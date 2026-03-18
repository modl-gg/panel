import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, CheckCircle, AlertCircle, Copy, ExternalLink, RefreshCw, Check, Crown } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Label } from '@modl-gg/shared-web/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@modl-gg/shared-web/components/ui/alert';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Separator } from '@modl-gg/shared-web/components/ui/separator';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { apiFetch, getCurrentDomain } from '@/lib/api';
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
  const [canManageCustomDomain, setCanManageCustomDomain] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();

  // Get current subdomain from tenant domain
  useEffect(() => {
    const hostname = getCurrentDomain();
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
      const response = await apiFetch('/v1/panel/settings/domain');
      if (response.ok) {
        const data = await response.json();
        if (data.customDomain) {
          setCustomDomain(data.customDomain);
          setDomainStatus(data.status);
        }
        setAccessingFromCustomDomain(data.accessingFromCustomDomain || false);
        setModlSubdomainUrl(data.modlSubdomainUrl || '');
        setCanManageCustomDomain(Boolean(data.canManageCustomDomain));
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
    if (!canManageCustomDomain) {
      toast({
        title: t('settings.domain.premiumRequired'),
        description: t('settings.domain.premiumRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    if (!customDomain.trim()) {
      toast({
        title: t('toast.error'),
        description: t('settings.domain.enterDomain'),
        variant: "destructive",
      });
      return;
    }

    if (!validateDomain(customDomain)) {
      toast({
        title: t('settings.domain.invalidDomain'),
        description: t('settings.domain.invalidDomainDesc'),
        variant: "destructive",
      });
      return;
    }

    if (domainStatus?.domain && domainStatus.domain.toLowerCase() === customDomain.trim().toLowerCase()) {
      toast({
        title: t('settings.domain.alreadyConfigured'),
        description: t('settings.domain.alreadyConfiguredDesc'),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch('/v1/panel/settings/domain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customDomain }),
      });

      if (response.ok) {
        const data = await response.json();
        setDomainStatus(data.status);

        if (data.status?.status === 'error') {
          toast({
            title: t('settings.domain.configurationError'),
            description: data.status.error || t('settings.domain.cloudflareConfigFailed'),
            variant: "destructive",
          });
        } else {
          toast({
            title: t('settings.domain.configurationStarted'),
            description: t('settings.domain.configurationStartedDesc'),
          });
        }
      } else {
        const error = await response.json();
        toast({
          title: t('toast.error'),
          description: error.message || t('settings.domain.configureFailed'),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('settings.domain.configureFailed'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyDomain = async () => {
    if (!canManageCustomDomain) {
      toast({
        title: t('settings.domain.premiumRequired'),
        description: t('settings.domain.premiumRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    if (!customDomain) return;

    setIsVerifying(true);
    try {
      const response = await apiFetch('/v1/panel/settings/domain/verify', {
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
            title: t('settings.domain.domainVerified'),
            description: data.message || t('settings.domain.domainVerifiedDesc'),
          });
        } else if (data.status.status === 'verifying') {
          toast({
            title: t('settings.domain.verificationInProgress'),
            description: data.message || t('settings.domain.verificationInProgressDesc'),
          });
        } else if (data.status.status === 'error') {
          toast({
            title: t('settings.domain.verificationFailed'),
            description: data.status.error || t('settings.domain.verificationFailedDesc'),
            variant: "destructive",
          });
        } else {
          toast({
            title: t('settings.domain.statusUpdated'),
            description: data.message || t('settings.domain.statusUpdatedDesc'),
          });
        }
      } else {
        const error = await response.json();
        toast({
          title: t('settings.domain.verificationError'),
          description: error.message || t('settings.domain.verifyFailed'),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('settings.domain.verifyFailed'),
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRemoveDomain = async () => {
    if (!canManageCustomDomain) {
      toast({
        title: t('settings.domain.premiumRequired'),
        description: t('settings.domain.premiumRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    if (!customDomain) return;

    setIsLoading(true);
    try {
      const response = await apiFetch('/v1/panel/settings/domain', {
        method: 'DELETE',
      });

      if (response.ok) {
        setCustomDomain('');
        setDomainStatus(null);
        toast({
          title: t('settings.domain.domainRemoved'),
          description: t('settings.domain.domainRemovedDesc'),
        });
      } else {
        const error = await response.json();
        toast({
          title: t('toast.error'),
          description: error.message || t('settings.domain.removeFailed'),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('settings.domain.removeFailed'),
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
      title: t('toast.copied'),
      description: t('settings.domain.cnameRecordCopied'),
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
      case 'active': return t('status.active');
      case 'pending': return t('status.pending');
      case 'verifying': return t('settings.domain.statusVerifying');
      case 'error': return t('status.error');
      default: return t('settings.domain.statusUnknown');
    }
  };

  // Only show to users with domain view permissions
  if (!user || !hasPermission('admin.settings.view.domain')) {
    return (
      <div className="flex items-center justify-center h-64 border-2 border-dashed border-muted rounded-lg">
        <p className="text-muted-foreground">{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">{t('settings.domain.title')}</h3>
        <p className="text-sm text-muted-foreground">
          {t('settings.domain.description', { domain: currentDomain })}
        </p>
      </div>

      <Card className="rounded-card shadow-card-inner bg-surface-2">
        <CardContent className="space-y-6">
          {!canManageCustomDomain && (
            <Alert className="border-orange-200 bg-orange-50">
              <Crown className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-800">{t('settings.domain.premiumFeature')}</AlertTitle>
              <AlertDescription className="text-orange-700">
                {t('settings.domain.premiumFeatureDesc')}
              </AlertDescription>
            </Alert>
          )}

          {accessingFromCustomDomain && (
            <Alert className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-800">{t('settings.domain.editingRestricted')}</AlertTitle>
              <AlertDescription className="text-orange-700">
                {t('settings.domain.editingRestrictedDesc')}
                {' '}
                <a
                  href={modlSubdomainUrl}
                  className="underline font-medium hover:text-orange-900"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {modlSubdomainUrl}
                </a>
                {' '}{t('settings.domain.toMakeChanges')}
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4">
            <p className="font-medium">{t('settings.domain.cloudflareRequired')}</p>
            <p className="text-sm text-muted-foreground">
              {t('settings.domain.cloudflareRequiredDesc')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('settings.domain.cloudflareLearnPrefix')}{' '}<a href="https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/">{t('settings.domain.here')}</a>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="customDomain">{t('settings.domain.customDomain')}</Label>
              <Input
                id="customDomain"
                type="text"
                placeholder="support.examplemc.net"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                disabled={isLoading || accessingFromCustomDomain || !canManageCustomDomain}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleDomainSubmit}
                disabled={isLoading || !customDomain.trim() || accessingFromCustomDomain || !canManageCustomDomain}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    {t('settings.domain.configuring')}
                  </>
                ) : (
                  t('settings.domain.configureDomain')
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
                    disabled={isVerifying || accessingFromCustomDomain || domainStatus?.status === 'active' || !canManageCustomDomain}
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t('settings.domain.verifying')}
                      </>
                    ) : domainStatus?.status === 'active' ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('settings.domain.verified')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('settings.domain.verify')}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveDomain}
                    disabled={isLoading || accessingFromCustomDomain || !canManageCustomDomain}
                  >
                    {t('common.remove')}
                  </Button>
                </div>
              </div>

              {domainStatus.status === 'error' && domainStatus.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>{t('settings.domain.configurationError')}</AlertTitle>
                  <AlertDescription>{domainStatus.error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {domainStatus && domainStatus.status !== 'active' && (
        <Card className="rounded-card shadow-card-inner bg-surface-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              {t('settings.domain.dnsConfigRequired')}
            </CardTitle>
            <CardDescription>
              {t('settings.domain.dnsConfigDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('settings.domain.dnsRecordSetup')}</AlertTitle>
              <AlertDescription>
                <div className="space-y-3 mt-3">
                  <div>
                    <strong>{t('settings.domain.recordType')}:</strong> CNAME
                  </div>
                  <div>
                    <strong>{t('settings.domain.nameHost')}:</strong> {customDomain.split('.')[0]} ({t('settings.domain.subdomainPart')})
                  </div>
                  <div className="flex items-center gap-2">
                    <strong>{t('settings.domain.valueTarget')}:</strong>
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
                    <strong>{t('settings.domain.orangeCloud')}:</strong> {t('settings.domain.enabled')}
                  </div>
                  <div>
                    <strong>{t('settings.domain.ttl')}:</strong> {t('settings.domain.auto')}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}


      <Card className="rounded-card shadow-card-inner bg-surface-2">
        <CardHeader>
          <CardTitle>{t('settings.domain.setupInstructions')}</CardTitle>
          <CardDescription>
            {t('settings.domain.setupInstructionsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-3">{t('settings.domain.step1Title')}</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('settings.domain.step1Desc')}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-3">{t('settings.domain.step2Title')}</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('settings.domain.step2Desc')}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-3">{t('settings.domain.step3Title')}</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('settings.domain.step3Desc')}
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-3">{t('settings.domain.step4Title')}</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  {t('settings.domain.step4Desc')}
                </p>
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="font-medium mb-3">{t('settings.domain.importantNotes')}</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>• {t('settings.domain.notesDnsPropagation')}</li>
                <li>• {t('settings.domain.notesSslGeneration')}</li>
                <li>• {t('settings.domain.notesOriginalAccess')}</li>
                <li>• {t('settings.domain.notesRemovable')}</li>
                <li>• {t('settings.domain.notesCloudflareManaaged')}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DomainSettings;
