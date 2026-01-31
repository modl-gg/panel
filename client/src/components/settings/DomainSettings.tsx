import React, { useState, useEffect } from 'react';
import { Globe, CheckCircle, AlertCircle, Copy, ExternalLink, RefreshCw, Check } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@modl-gg/shared-web/components/ui/alert';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

interface DomainStatus {
  domain: string;
  status: 'pending' | 'active' | 'error' | 'verifying';
  cnameConfigured: boolean;
  sslStatus: 'pending' | 'active' | 'error';
  lastChecked: string;
  error?: string;
}

const DomainSettings: React.FC = () => {
  const [customDomain, setCustomDomain] = useState<string>('');
  const [currentDomain, setCurrentDomain] = useState<string>('');
  const [domainStatus, setDomainStatus] = useState<DomainStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accessingFromCustomDomain, setAccessingFromCustomDomain] = useState(false);
  const [modlSubdomainUrl, setModlSubdomainUrl] = useState<string>('');
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  // Get current subdomain from window location
  useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    if (parts.length > 2) {
      setCurrentDomain(parts[0]);
    }
  }, []);

  // Load existing domain configuration
  useEffect(() => {
    loadDomainConfig();
  }, []);

  const loadDomainConfig = async () => {
    try {
      const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
      const response = await fetch(getApiUrl('/v1/panel/settings/domain'), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.customDomain) {
          setCustomDomain(data.customDomain);
          setDomainStatus(data.status);
        }
        setAccessingFromCustomDomain(data.accessingFromCustomDomain || false);
        setModlSubdomainUrl(data.modlSubdomainUrl || '');
      }
    } catch (error) {
      console.error('Error loading domain configuration:', error);
    }
  };

  const validateDomain = (domain: string): boolean => {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  };

  const handleDomainSubmit = async () => {
    if (!customDomain.trim()) {
      toast({
        title: "Error",
        description: "Please enter a domain name",
        variant: "destructive",
      });
      return;
    }

    if (!validateDomain(customDomain)) {
      toast({
        title: "Invalid Domain",
        description: "Please enter a valid domain name (e.g., panel.yourdomain.com)",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customDomain }),
      });

      if (response.ok) {
        const data = await response.json();
        setDomainStatus(data.status);
        toast({
          title: "Domain Configuration Started",
          description: "Your custom domain has been configured. Please set up the CNAME record and click verify.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to configure domain",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to configure domain. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!customDomain) return;

    setIsVerifying(true);
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/domain/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ domain: customDomain }),
      });

      if (response.ok) {
        const data = await response.json();
        setDomainStatus(data.status);
        
        // Show appropriate message based on status
        if (data.status.status === 'active') {
          toast({
            title: "Domain Verified! 🎉",
            description: data.message || "Your custom domain is now active with SSL certificate!",
          });
        } else if (data.status.status === 'verifying') {
          toast({
            title: "Verification In Progress",
            description: data.message || "Domain verification is in progress. This may take a few minutes.",
          });
        } else if (data.status.status === 'error') {
          toast({
            title: "Verification Failed",
            description: data.status.error || "Failed to verify domain configuration",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Status Updated",
            description: data.message || "Domain verification status updated",
          });
        }
      } else {
        const error = await response.json();
        toast({
          title: "Verification Error",
          description: error.message || "Failed to verify domain",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify domain. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRemoveDomain = async () => {
    if (!customDomain) return;

    setIsLoading(true);
    try {
      const csrfFetch = apiFetch;
      const response = await csrfFetch('/v1/panel/settings/domain', {
        method: 'DELETE',
      });

      if (response.ok) {
        setCustomDomain('');
        setDomainStatus(null);
        toast({
          title: "Domain Removed",
          description: "Custom domain has been removed. You can now access your panel via the default subdomain.",
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to remove domain",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to remove domain. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copied",
      description: "CNAME record copied to clipboard",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'verifying': return 'bg-blue-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'pending': return 'Pending';
      case 'verifying': return 'Verifying';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  // Only show to users with admin settings permissions
  if (!user || !hasPermission('admin.settings.modify')) {
    return (
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Custom Domain Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Use your own domain instead of {currentDomain}.modl.gg. We recommend using 'support' as your subdomain.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          {accessingFromCustomDomain && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-800">Custom Domain Editing Restricted</AlertTitle>
              <AlertDescription className="text-orange-700">
                You cannot modify custom domain settings while accessing from a custom domain.
                Please access your panel via{' '}
                <a
                  href={modlSubdomainUrl}
                  className="underline font-medium hover:text-orange-900"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {modlSubdomainUrl}
                </a>
                {' '}to make changes.
              </AlertDescription>
            </Alert>
          )}

          <div>
            <br></br>
            <p className="font-medium">Cloudflare Nameservers Required</p>
            <p className="text-sm text-muted-foreground">
              You must use Cloudflare nameservers and enable proxying on the C-Name record. 
            </p>
            <p className="text-sm text-muted-foreground">
              Learn how to switch your nameservers to Cloudflare <a href="https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/">here</a>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="customDomain">Custom Domain</Label>
              <Input
                id="customDomain"
                type="text"
                placeholder="support.examplemc.net"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                disabled={isLoading || accessingFromCustomDomain}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleDomainSubmit}
                disabled={isLoading || !customDomain.trim() || accessingFromCustomDomain}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Configuring...
                  </>
                ) : (
                  'Configure Domain'
                )}
              </Button>
            </div>
          </div>

          {domainStatus && (
            <div className="space-y-4">
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`${getStatusColor(domainStatus.status)} text-white`}>
                    {getStatusText(domainStatus.status)}
                  </Badge>
                  <span className="text-sm font-medium">{domainStatus.domain}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerifyDomain}
                    disabled={isVerifying || accessingFromCustomDomain}
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Verify
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveDomain}
                    disabled={isLoading || accessingFromCustomDomain}
                  >
                    Remove
                  </Button>
                </div>
              </div>

              {domainStatus.status === 'error' && domainStatus.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Configuration Error</AlertTitle>
                  <AlertDescription>{domainStatus.error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {domainStatus && domainStatus.status !== 'active' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              DNS Configuration Required
            </CardTitle>
            <CardDescription>
              Set up the following CNAME record with Cloudflare
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>DNS Record Setup</AlertTitle>
              <AlertDescription>
                <div className="space-y-3 mt-3">
                  <div>
                    <strong>Record Type:</strong> CNAME
                  </div>
                  <div>
                    <strong>Name/Host:</strong> {customDomain.split('.')[0]} (or the subdomain part)
                  </div>
                  <div className="flex items-center gap-2">
                    <strong>Value/Target:</strong>
                    <code className="bg-muted px-2 py-1 rounded text-sm">
                      {currentDomain}.modl.gg
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(`${currentDomain}.modl.gg`)}
                    >
                      {copied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div>
                    <strong>Orange Cloud:</strong> Enabled
                  </div>
                  <div>
                    <strong>TTL:</strong> Auto
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}


      <Card>
        <CardHeader>
          <CardTitle>Setup Instructions</CardTitle>
          <CardDescription>
            Step-by-step guide to configure your custom domain
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-3">1. Configure Domain</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter your desired custom domain in the form above and click "Configure Domain".
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-3">2. Set DNS Record</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Create a proxied CNAME record with Cloudflare pointing to your current subdomain.
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-3">3. Verify Configuration</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Click "Verify" to check if the DNS record is properly configured.
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-3">4. All done!</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Use your new custom domain to access the panel.
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3">Important Notes</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• DNS changes can take up to 48 hours to propagate globally</li>
                <li>• SSL certificate generation may take a few minutes after DNS verification</li>
                <li>• Your panel will remain accessible via the original subdomain</li>
                <li>• Custom domain can be removed at any time without affecting functionality</li>
                <li>• SSL and DNS validation are managed automatically by Cloudflare after CNAME setup</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DomainSettings;
