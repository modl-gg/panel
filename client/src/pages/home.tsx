import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  RefreshCw,
  Sun,
  Moon
} from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { useTheme } from 'next-themes';
import {
  useStats,
  useRecentTickets,
  useRecentPunishments,
  useAssignedTicketUpdates,
  useMarkSubscriptionUpdateAsRead
} from '@/hooks/use-data';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import PageContainer from '@/components/layout/PageContainer';
import { RecentTicketsSection } from '@/components/dashboard/RecentTicketsSection';
import { RecentPunishmentsSection } from '@/components/dashboard/RecentPunishmentsSection';
import { AssignedTicketUpdatesSection } from '@/components/dashboard/AssignedTicketUpdatesSection';


const Home = () => {
  const [isSpinning, setIsSpinning] = useState(false);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  // Fetch all dashboard data
  const { data: recentTicketsData, isLoading: isLoadingTickets, refetch: refetchTickets } = useRecentTickets(3);
  const { data: recentPunishmentsData, isLoading: isLoadingPunishments, refetch: refetchPunishments } = useRecentPunishments(5);
  const { data: assignedUpdatesData, isLoading: isLoadingUpdates, refetch: refetchUpdates } = useAssignedTicketUpdates(10);

  // Mutations for updates management
  const markAsReadMutation = useMarkSubscriptionUpdateAsRead();

  const handleRefreshData = async () => {
    setIsSpinning(true);

    try {
      await Promise.all([
        refetchTickets(),
        refetchPunishments(),
        refetchUpdates(),
        new Promise(resolve => setTimeout(resolve, 800))
      ]);

      toast({
        title: t('dashboard.refreshed'),
        description: t('dashboard.refreshedDesc'),
      });
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      toast({
        title: t('toast.error'),
        description: t('dashboard.refreshError'),
        variant: "destructive",
      });
    } finally {
      setIsSpinning(false);
    }
  };

  const handleMarkAsRead = async (updateId: string) => {
    return markAsReadMutation.mutateAsync(updateId);
  };

  return (
    <PageContainer>
      <div className="flex flex-col space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">{t('dashboard.title')}</h2>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={handleRefreshData}
              disabled={isSpinning}
            >
              <RefreshCw className={`h-5 w-5 ${isSpinning ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Assigned Ticket Updates - Full Width */}
        <AssignedTicketUpdatesSection
          updates={assignedUpdatesData || []}
          loading={isLoadingUpdates}
          onMarkAsRead={handleMarkAsRead}
        />

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Tickets */}
          <RecentTicketsSection
            tickets={recentTicketsData || []}
            loading={isLoadingTickets}
          />

          {/* Recent Punishments */}
          <RecentPunishmentsSection
            punishments={recentPunishmentsData || []}
            loading={isLoadingPunishments}
          />
        </div>
      </div>
    </PageContainer>
  );
};

export default Home;
