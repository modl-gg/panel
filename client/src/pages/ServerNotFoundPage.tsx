import { AlertCircle, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { useTranslation } from 'react-i18next';
import { getCurrentDomain } from '@/lib/api';

export default function ServerNotFoundPage() {
  const { t } = useTranslation();
  const domain = getCurrentDomain();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <CardTitle>{t('pages.serverNotFound.title')}</CardTitle>
          <CardDescription className="mt-2">
            {t('pages.serverNotFound.descriptionPrefix')} <span className="font-medium text-foreground">{domain}</span> {t('pages.serverNotFound.descriptionSuffix')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {t('pages.serverNotFound.hint')}
          </p>

          <div className="space-y-3">
            <Button
              variant="default"
              className="w-full"
              onClick={() => window.location.href = 'https://modl.gg'}
            >
              <Home className="h-4 w-4 mr-2" />
              {t('pages.serverNotFound.goToModl')}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
