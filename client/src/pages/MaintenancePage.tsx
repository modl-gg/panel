import { AlertCircle } from "lucide-react";
import { useTranslation } from 'react-i18next';

interface MaintenancePageProps {
  message: string;
}

const MaintenancePage = ({ message }: MaintenancePageProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="text-center max-w-lg">
        <AlertCircle className="mx-auto h-16 w-16 text-primary mb-6" />
        <h1 className="text-4xl font-bold mb-4">{t('pages.maintenance.heading')}</h1>
        <p className="text-lg text-muted-foreground mb-8">
          {t('pages.maintenance.description')}
        </p>
        {message && (
          <div className="bg-muted/50 p-4 rounded-lg border border-border">
            <p className="text-sm">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenancePage; 