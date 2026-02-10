import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Bell,
  RefreshCw,
  Sun,
  Moon
} from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
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
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
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

  const maintenanceBanner = useMemo(() => {
    const start = new Date('2026-02-12T03:00:00Z'); // 10 PM ET = 03:00 UTC next day
    const end = new Date('2026-02-12T05:00:00Z');   // 12 AM ET = 05:00 UTC

    const fmt = new Intl.DateTimeFormat(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });

    const startStr = fmt.format(start);
    const endStr = fmt.format(end);

    return `[IMPORTANT] As we prepare for a major upgrade on ${startStr} to ${endStr}, you are required to upgrade your Minecraft plugin to version 1.1.2 to avoid downtime.`;
  }, []);

  return (
    <PageContainer>
      <div className="bg-red-600 text-white text-xs font-medium px-3 py-1.5 -mx-4 -mt-4 md:-mx-6 md:-mt-6 md:rounded-t-xl flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        <span>
          {maintenanceBanner}{' '}
          <a
            href="https://github.com/modl-gg/minecraft/releases/tag/1.1.2"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            Download here
          </a>
        </span>
      </div>

      <div className="flex justify-between items-center mb-6 mt-4">
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
