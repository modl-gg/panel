import { useEffect, useState } from 'react';
import { useRouter } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { Notice } from '@/components/ui/notice';
import { useTranslation } from 'react-i18next';

interface RateLimitInfo {
  retryAfter?: number;
  timeRemaining?: string;
  rateLimit?: string;
  nextAttemptAt?: string;
  message?: string;
  securityNote?: string;
}

export default function RateLimitPage() {
  const { t } = useTranslation();
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-warning/10 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-warning" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">
            {t('pages.rateLimit.title')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {t('pages.rateLimit.description')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Time remaining display */}
          {timeLeft > 0 && (
            <div className="text-center bg-warning/10 rounded-lg p-4">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-warning" />
                <span className="font-semibold text-warning">
                  {t('pages.rateLimit.timeRemaining')}
                </span>
              </div>
              <div className="text-3xl font-mono font-bold text-warning">
                {formatTime(timeLeft)}
              </div>
            </div>
          )}

          {/* Rate limit details */}
          {rateLimitInfo.rateLimit && (
            <div className="text-center text-sm text-muted-foreground">
              <strong>{t('pages.rateLimit.rateLimitLabel')}</strong> {rateLimitInfo.rateLimit}
            </div>
          )}

          {/* Custom message */}
          {rateLimitInfo.message && (
            <div className="text-sm text-foreground bg-muted rounded-lg p-3">
              {rateLimitInfo.message}
            </div>
          )}

          {/* Security note */}
          {rateLimitInfo.securityNote && (
            <Notice variant="info" title={t('pages.rateLimit.securityInfo')}>
              {rateLimitInfo.securityNote}
            </Notice>
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
                {t('common.tryAgain')}
              </Button>
            ) : (
              <Button
                disabled
                className="w-full"
                size="lg"
                variant="secondary"
              >
                <Clock className="w-4 h-4 mr-2" />
                {t('pages.rateLimit.wait', { time: formatTime(timeLeft) })}
              </Button>
            )}

            <Button
              onClick={handleDashboard}
              variant="outline"
              className="w-full"
              size="lg"
            >
              {t('pages.rateLimit.returnToDashboard')}
            </Button>
          </div>

          {/* Help text */}
          <div className="text-xs text-muted-foreground text-center">
            {t('pages.rateLimit.helpText')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}