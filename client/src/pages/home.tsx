import { useState } from 'react';
import { 
  Bell, 
  RefreshCw, 
  Sun,
  Moon
} from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';
import { useTheme } from 'next-themes';
import { 
  useStats,
  useDashboardMetrics,
  useRecentTickets,
  useRecentPunishments,
  useTicketSubscriptionUpdates,
  useUnsubscribeFromTicket,
  useMarkSubscriptionUpdateAsRead
} from '@/hooks/use-data';
import { useToast } from 'modl-shared-web/hooks/use-toast';
import PageContainer from '@/components/layout/PageContainer';
import { DashboardMetricsChart } from '@/components/dashboard/DashboardMetricsChart';
import { RecentTicketsSection } from '@/components/dashboard/RecentTicketsSection';
import { RecentPunishmentsSection } from '@/components/dashboard/RecentPunishmentsSection';
import { TicketSubscriptionsSection } from '@/components/dashboard/TicketSubscriptionsSection';


const Home = () => {
  const [metricsPeriod, setMetricsPeriod] = useState('7d');
  const [isSpinning, setIsSpinning] = useState(false);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  
  // Fetch all dashboard data
  const { data: metricsData, isLoading: isLoadingMetrics, refetch: refetchMetrics } = useDashboardMetrics(metricsPeriod);
  const { data: recentTicketsData, isLoading: isLoadingTickets, refetch: refetchTickets } = useRecentTickets(3);
  const { data: recentPunishmentsData, isLoading: isLoadingPunishments, refetch: refetchPunishments } = useRecentPunishments(5);
  const { data: subscriptionUpdatesData, isLoading: isLoadingUpdates, refetch: refetchUpdates } = useTicketSubscriptionUpdates(10);
  
  // Mutations for subscription management
  const unsubscribeMutation = useUnsubscribeFromTicket();
  const markAsReadMutation = useMarkSubscriptionUpdateAsRead();

  const handleRefreshData = async () => {
    setIsSpinning(true);
    
    try {
      await Promise.all([
        refetchMetrics(),
        refetchTickets(),
        refetchPunishments(),
        refetchUpdates(),
        new Promise(resolve => setTimeout(resolve, 800))
      ]);
      
      toast({
        title: "Dashboard Refreshed",
        description: "All dashboard data has been updated.",
      });
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      toast({
        title: "Error",
        description: "Failed to refresh dashboard. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSpinning(false);
    }
  };

  const handleUnsubscribe = async (ticketId: string) => {
    return unsubscribeMutation.mutateAsync(ticketId);
  };

  const handleMarkAsRead = async (updateId: string) => {
    return markAsReadMutation.mutateAsync(updateId);
  };

  return (
    <PageContainer>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground">
            <Bell className="h-5 w-5" />
          </Button>
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
      
      {/* Dashboard Metrics Chart */}
      <div className="mb-6">
        <DashboardMetricsChart 
          data={metricsData || []}
          loading={isLoadingMetrics}
          period={metricsPeriod}
          onPeriodChange={setMetricsPeriod}
        />
      </div>
      
      {/* Ticket Subscriptions - Full Width */}
      <div className="mb-6">
        <TicketSubscriptionsSection 
          updates={subscriptionUpdatesData || []}
          loading={isLoadingUpdates}
          onUnsubscribe={handleUnsubscribe}
          onMarkAsRead={handleMarkAsRead}
        />
      </div>
      
      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    </PageContainer>
  );
};

export default Home;
