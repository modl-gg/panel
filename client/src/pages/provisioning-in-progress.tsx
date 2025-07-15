import React, { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import PageContainer from '@/components/layout/PageContainer'; // Import PageContainer
import { Loader2 } from 'lucide-react'; // Import a loader icon

const ProvisioningInProgressPage: React.FC = () => {
  const [, navigate] = useLocation();
  const [statusMessage, setStatusMessage] = useState('Initializing server setup...');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Get serverName and signInToken from URL query parameter
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const serverName = searchParams.get('server');
  const signInToken = searchParams.get('signInToken'); // Get the signInToken

  const checkStatus = useCallback(async () => {
    if (!serverName) {
      setError('Server name not found in URL. Cannot check provisioning status.');
      setStatusMessage('Configuration error.');
      return;
    }
    try {
      let apiUrl = `/api/provisioning/status/${serverName}`;
      if (signInToken) {
        apiUrl += `?signInToken=${signInToken}`; // Append signInToken if present
      }
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If response is not JSON
          errorData = { error: `Server returned an error: ${response.statusText || response.status}` };
        }
        // For 5xx errors from server (like provisioning failed), display that error.
        // For network or other client-side issues, retry or show generic error.
        if (response.status >= 500 && errorData.error) {
            throw new Error(errorData.error); // Error from server's provisioning status
        }
        throw new Error(errorData.error || `Failed to check status. HTTP error: ${response.status}`);
      }
      
      const data = await response.json();

      // Use the message from the server directly, as it now includes auto-login status
      setStatusMessage(data.message || `Server '${serverName}' status: ${data.status}`);      if (data.status === 'completed') {
        // Provisioning is complete - always redirect to auth page for login
        setStatusMessage(data.message + ' Redirecting to login...');
        setTimeout(() => {
          window.location.href = '/auth?message=provisioning_complete_login_required';
        }, 3000);
      } else if (data.status === 'in-progress') {
        setError(null);
        setRetryCount(0);
        setTimeout(checkStatus, 3000);
      } else if (data.status === 'failed') {
        setError(data.message || 'Provisioning failed. Please contact support or try again.');
        // No automatic retry for failed status, user can click "Try Again"
      } else {
        // Handle other statuses or unexpected responses
        setError(null);
        setRetryCount(0);
        setTimeout(checkStatus, 5000);
      }
    } catch (err: any) {
      console.error('Error checking provisioning status:', err);
      if (retryCount < maxRetries) {
        setStatusMessage(`Connection issue. Retrying (${retryCount + 1}/${maxRetries})...`);
        setRetryCount(prev => prev + 1);
        setTimeout(checkStatus, 5000 * (retryCount + 1)); // Exponential backoff for retries
      } else {
        setError(err.message || 'An unexpected error occurred while checking server status. Please try refreshing or contact support.');
        setStatusMessage('Failed to complete server setup.');
      }
    }
  }, [navigate, retryCount, serverName, signInToken]); // Added signInToken to dependencies

  useEffect(() => {
    if (serverName) {
      checkStatus(); // Initial check only if serverName is present
    } else {
      setError('Critical: Server identifier is missing from the URL.');
      setStatusMessage('Cannot proceed with server setup check.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [serverName, checkStatus]); // Added checkStatus to dependencies

  return (
    <PageContainer title="Server Setup">
      <div className="flex flex-col items-center justify-center text-center p-4">
        <h1 className="text-2xl font-semibold mb-4">Setting Up Your Server: {serverName || "Unknown"}</h1>
        <p className="text-lg mb-6 text-muted-foreground">{statusMessage}</p>
        
        {error && (
          <div className="bg-destructive/10 border border-destructive text-destructive p-4 rounded-md mb-6 w-full max-w-md">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}
        
        {!error && !statusMessage.includes("Redirecting") && !statusMessage.includes("Failed") && (
          <div className="flex flex-col items-center mt-6">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">This may take a few moments...</p>
          </div>
        )}

        {error && (
          <button 
            onClick={() => {
              setRetryCount(0);
              setError(null);
              setStatusMessage('Retrying setup...');
              checkStatus();
            }}
            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    </PageContainer>
  );
};

export default ProvisioningInProgressPage;
