import React, { useEffect, useState } from 'react';
import { useLocation, useRouter } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { AlertCircle, Clock, RefreshCw } from 'lucide-react';

interface RateLimitInfo {
  retryAfter?: number;
  timeRemaining?: string;
  rateLimit?: string;
  nextAttemptAt?: string;
  message?: string;
  securityNote?: string;
}

export default function RateLimitPage() {
  const [, setLocation] = useLocation();
  const [, navigate] = useRouter();
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo>({});

  useEffect(() => {
    // Try to get rate limit info from sessionStorage
    const storedInfo = sessionStorage.getItem('rateLimitInfo');
    if (storedInfo) {
      try {
        const info = JSON.parse(storedInfo);
        setRateLimitInfo(info);
        
        // Calculate time left based on nextAttemptAt
        if (info.nextAttemptAt) {
          const nextAttempt = new Date(info.nextAttemptAt).getTime();
          const now = Date.now();
          const timeLeftMs = Math.max(0, nextAttempt - now);
          setTimeLeft(Math.ceil(timeLeftMs / 1000));
        } else if (info.retryAfter) {
          setTimeLeft(info.retryAfter);
        }
      } catch (error) {
        console.error('Failed to parse rate limit info:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const handleRetry = () => {
    // Clear the rate limit info
    sessionStorage.removeItem('rateLimitInfo');
    
    // Try to go back to the previous page, or dashboard as fallback
    const returnPath = sessionStorage.getItem('preRateLimitPath') || '/dashboard';
    sessionStorage.removeItem('preRateLimitPath');
    navigate(returnPath);
  };

  const handleDashboard = () => {
    sessionStorage.removeItem('rateLimitInfo');
    sessionStorage.removeItem('preRateLimitPath');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Rate Limit Exceeded
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-gray-400">
            You've made too many requests. Please wait before trying again.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Time remaining display */}
          {timeLeft > 0 && (
            <div className="text-center bg-orange-50 dark:bg-orange-900/10 rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <span className="font-semibold text-orange-800 dark:text-orange-300">
                  Time Remaining
                </span>
              </div>
              <div className="text-3xl font-mono font-bold text-orange-600 dark:text-orange-400">
                {formatTime(timeLeft)}
              </div>
            </div>
          )}

          {/* Rate limit details */}
          {rateLimitInfo.rateLimit && (
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              <strong>Rate Limit:</strong> {rateLimitInfo.rateLimit}
            </div>
          )}

          {/* Custom message */}
          {rateLimitInfo.message && (
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              {rateLimitInfo.message}
            </div>
          )}

          {/* Security note */}
          {rateLimitInfo.securityNote && (
            <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <strong>Security Info:</strong> {rateLimitInfo.securityNote}
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            {timeLeft <= 0 ? (
              <Button 
                onClick={handleRetry} 
                className="w-full"
                size="lg"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            ) : (
              <Button 
                disabled 
                className="w-full" 
                size="lg"
                variant="secondary"
              >
                <Clock className="w-4 h-4 mr-2" />
                Wait {formatTime(timeLeft)}
              </Button>
            )}
            
            <Button 
              onClick={handleDashboard}
              variant="outline" 
              className="w-full"
              size="lg"
            >
              Return to Dashboard
            </Button>
          </div>

          {/* Help text */}
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Rate limiting helps protect the server and ensures fair usage for all users. 
            If you continue to experience issues, please contact support.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}