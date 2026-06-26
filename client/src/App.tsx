import { useState, useEffect, Suspense, lazy } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Toaster } from "@modl-gg/shared-web/components/ui/toaster";
import { TooltipProvider } from "@modl-gg/shared-web/components/ui/tooltip";
import Sidebar from "@/components/layout/Sidebar";
import MobileNavbar from "@/components/layout/MobileNavbar";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { DashboardProvider } from "@/contexts/DashboardContext";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProtectedRoute, AuthRoute } from "@/lib/protected-route";
import { useIsMobile } from '@modl-gg/shared-web/hooks/use-mobile';
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useProvisioningStatusCheck } from "@/hooks/use-provisioning-status";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { RealtimeProvider } from "@/hooks/use-realtime";
import { PlayerWindowProvider } from "@/contexts/PlayerWindowContext";
import { WelcomeModal } from "@/components/layout/WelcomeModal";
import { Loader2 } from "lucide-react";

// Lazy load all pages for better code splitting
const NotFound = lazy(() => import("@/pages/not-found"));
const Home = lazy(() => import("@/pages/home"));
const LookupPage = lazy(() => import("@/pages/lookup-page"));
const PlayerDetailPage = lazy(() => import("@/pages/player-detail-page"));
const Tickets = lazy(() => import("@/pages/tickets"));
const TicketDetail = lazy(() => import("@/pages/ticket-detail"));
const PlayerTicket = lazy(() => import("@/pages/player-ticket"));
const Audit = lazy(() => import("@/pages/audit"));
const Settings = lazy(() => import("@/pages/settings"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const AppealsPage = lazy(() => import("@/pages/appeals"));
const SubmitTicketPage = lazy(() => import("@/pages/submit-ticket"));
const ApiDocs = lazy(() => import("@/pages/api-docs"));
const ProvisioningInProgressPage = lazy(() => import("@/pages/provisioning-in-progress"));
const AcceptInvitationPage = lazy(() => import("@/pages/AcceptInvitationPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const RateLimitPage = lazy(() => import("@/pages/RateLimitPage"));
const SetupPage = lazy(() => import("@/pages/SetupPage"));
const ServerNotFoundPage = lazy(() => import("@/pages/ServerNotFoundPage"));
const UploadEvidencePage = lazy(() => import("@/pages/upload-evidence-page"));
const VerifyPage = lazy(() => import("@/pages/VerifyPage"));
const ReplayPage = lazy(() => import("@/pages/replay-page"));

// Knowledgebase Pages
const KnowledgebasePage = lazy(() => import("@/pages/KnowledgebasePage"));
const ArticleDetailPage = lazy(() => import("@/pages/ArticleDetailPage"));
const HomePage = lazy(() => import("@/pages/HomePage"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

function Router() {
  const [location] = useLocation();
  const isMobile = useIsMobile();

  const isAdminPanelRoute = location.startsWith("/panel");
  const isAuthPage = location === '/auth' || location === '/panel/auth';
  const isAppealsPage = location === '/appeal';
  const isPlayerTicketPage = location.startsWith('/ticket/');
  const isSubmitTicketPage = location.startsWith('/submit-ticket');
  const isProvisioningPage = location === '/provisioning-in-progress';
  const isAcceptInvitationPage = location.startsWith('/accept-invitation');
  const isVerifyEmailPage = location.startsWith('/verify-email');
  const isUploadEvidencePage = location.startsWith('/upload-evidence');
  const isVerifyPage = location.startsWith('/verify/');
  const isReplayPage = location.startsWith('/replay');
  const isRateLimitPage = location.startsWith('/rate-limit');

  if (!isAdminPanelRoute && !isAuthPage && !isAppealsPage && !isPlayerTicketPage && !isSubmitTicketPage && !isProvisioningPage && !isAcceptInvitationPage && !isVerifyEmailPage && !isUploadEvidencePage && !isVerifyPage && !isReplayPage && !isRateLimitPage) {
    return (
      <main className="h-full bg-background">
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/knowledgebase" component={KnowledgebasePage} />
            <Route path="/article/:articleSlug" component={ArticleDetailPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
    );
  }

  if (isAuthPage || isAppealsPage || isPlayerTicketPage || isSubmitTicketPage || isProvisioningPage || isAcceptInvitationPage || isVerifyEmailPage || isUploadEvidencePage || isVerifyPage || isReplayPage || isRateLimitPage) {
    return (
      <main className="h-full bg-background">
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <AuthRoute path="/auth" component={AuthPage} />
            <AuthRoute path="/panel/auth" component={AuthPage} />
            <Route path="/appeal" component={AppealsPage} />
            <Route path="/submit-ticket" component={SubmitTicketPage} />
            <Route path="/submit-ticket/:type" component={SubmitTicketPage} />
            <Route path="/ticket/:id" component={PlayerTicket} />
            <Route path="/provisioning-in-progress" component={ProvisioningInProgressPage} />
            <Route path="/accept-invitation" component={AcceptInvitationPage} />
            <Route path="/verify-email" component={SetupPage} />
            <Route path="/upload-evidence/:token" component={UploadEvidencePage} />
            <Route path="/verify/:token" component={VerifyPage} />
            <Route path="/replay" component={ReplayPage} />
            <Route path="/rate-limit" component={RateLimitPage} />
          </Switch>
        </Suspense>
      </main>
    );
  }

  // Mobile version
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        <main className="flex-1 overflow-y-auto bg-background transition-all duration-300 ease-in-out scrollbar pb-16">
          <Suspense fallback={<PageLoader />}>
            <Switch>
              <ProtectedRoute path="/panel" component={Home} />
              <ProtectedRoute path="/panel/lookup" component={LookupPage} />
              <ProtectedRoute path="/panel/player/:uuid" component={PlayerDetailPage} />
              <ProtectedRoute path="/panel/tickets" component={Tickets} />
              <ProtectedRoute path="/panel/tickets/:id" component={TicketDetail} />
              <ProtectedRoute path="/panel/audit" component={Audit} />
              <ProtectedRoute path="/panel/settings" component={Settings} />
              <ProtectedRoute path="/panel/api-docs" component={ApiDocs} />
              <AuthRoute path="/panel/auth" component={AuthPage} />
              {/* These routes are outside /panel */}
              <AuthRoute path="/auth" component={AuthPage} />
              <Route path="/appeal" component={AppealsPage} />
              <Route path="/submit-ticket" component={SubmitTicketPage} />
              <Route path="/submit-ticket/:type" component={SubmitTicketPage} />
              <Route path="/ticket/:id" component={PlayerTicket} />
              <Route path="/provisioning-in-progress" component={ProvisioningInProgressPage} />
              <Route path="/accept-invitation" component={AcceptInvitationPage} />
              <Route path="/verify-email" component={SetupPage} />
              <Route path="/verify/:token" component={VerifyPage} />
              <Route path="/rate-limit" component={RateLimitPage} />
              <Route path="/replay" component={ReplayPage} />
              {/* Public KB routes for mobile, if accessed directly and not caught by earlier block */}
              <Route path="/knowledgebase" component={KnowledgebasePage} />
              <Route path="/article/:articleSlug" component={ArticleDetailPage} />
              <Route path="/" component={HomePage} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </main>
        { location.startsWith("/panel") && <MobileNavbar /> }
      </div>
    );
  }

  // Desktop version
  return (
    <div className="flex h-full overflow-hidden bg-background">
      { location.startsWith("/panel") && <Sidebar /> }
      <main className={`flex-1 ${location.startsWith("/panel") ? 'pl-24' : ''} overflow-y-auto bg-background transition-all duration-300 ease-in-out scrollbar`}>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <ProtectedRoute path="/panel" component={Home} />
            <ProtectedRoute path="/panel/lookup" component={LookupPage} />
            <ProtectedRoute path="/panel/player/:uuid" component={PlayerDetailPage} />
            <ProtectedRoute path="/panel/tickets" component={Tickets} />
            <ProtectedRoute path="/panel/tickets/:id" component={TicketDetail} />
            <ProtectedRoute path="/panel/audit" component={Audit} />
            <ProtectedRoute path="/panel/settings" component={Settings} />
            <ProtectedRoute path="/panel/api-docs" component={ApiDocs} />
            <AuthRoute path="/panel/auth" component={AuthPage} />
            {/* These routes are outside /panel */}
            <AuthRoute path="/auth" component={AuthPage} />
            <Route path="/appeal" component={AppealsPage} />
            <Route path="/submit-ticket" component={SubmitTicketPage} />
            <Route path="/submit-ticket/:type" component={SubmitTicketPage} />
            <Route path="/ticket/:id" component={PlayerTicket} />
            <Route path="/provisioning-in-progress" component={ProvisioningInProgressPage} />
            <Route path="/accept-invitation" component={AcceptInvitationPage} />
            <Route path="/verify-email" component={SetupPage} />
            <Route path="/verify/:token" component={VerifyPage} />
            <Route path="/rate-limit" component={RateLimitPage} />
            <Route path="/replay" component={ReplayPage} />
            {/* Public KB routes for desktop, if accessed directly and not caught by earlier block */}
            <Route path="/knowledgebase" component={KnowledgebasePage} />
            <Route path="/article/:articleSlug" component={ArticleDetailPage} />
            <Route path="/" component={HomePage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
    </div>
  );
}

// Recovery/verification flows that must stay reachable even when the tenant is not fully
// provisioned (serverExists===false) or the platform is in maintenance mode.
const ALWAYS_REACHABLE_PATHS = ['/verify-email', '/verify/', '/replay'];
const isAlwaysReachablePath = (loc: string) =>
  ALWAYS_REACHABLE_PATHS.some((p) => loc.startsWith(p));

function AppContent() {
  const { user, isLoading } = useAuth();
  const {
    data: publicSettings,
    isLoading: isLoadingSettings,
    isError: isSettingsError,
    refetch: refetchSettings,
  } = usePublicSettings();
  const [location] = useLocation();
  const [isWelcomeModalOpen, setWelcomeModalOpen] = useState(false);

  const maintenanceMode = publicSettings?.maintenanceMode ?? false;
  const maintenanceMessage = publicSettings?.maintenanceMessage ?? '';

  useDocumentTitle();
  useProvisioningStatusCheck();

  useEffect(() => {
    const hasSeenModal = localStorage.getItem("hasSeenWelcomeModal");
    const isOnPanelHomePage = location === '/panel';
    const isFromProvisioning = new URLSearchParams(window.location.search).get('fromProvisioning') === 'true';

    const excludedPages = ['/auth', '/panel/auth', '/appeal', '/provisioning-in-progress'];
    const isOnExcludedPage = excludedPages.some(page => location.startsWith(page));
    const isOnPlayerTicketPage = location.startsWith('/ticket/');
    const isOnAcceptInvitationPage = location.startsWith('/accept-invitation');

    if (!isOnPanelHomePage) {
      setWelcomeModalOpen(false);
      return;
    }

    if (!hasSeenModal && isOnPanelHomePage && !isFromProvisioning && !isOnExcludedPage && !isOnPlayerTicketPage && !isOnAcceptInvitationPage && user?.role === 'Super Admin') {
      setWelcomeModalOpen(true);
    }
  }, [location, user?.role]);

  const handleCloseWelcomeModal = () => {
    localStorage.setItem("hasSeenWelcomeModal", "true");
    setWelcomeModalOpen(false);
  };

  if (isLoading || isLoadingSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // A transport/network failure of /v1/public/settings is transient, NOT a real "server not found".
  // Only collapse to an error screen when we have no last-good settings to fall back to; otherwise the
  // stale-but-valid `publicSettings` keeps the app usable (e.g. an authenticated staff session) and the
  // next successful refetch self-heals. Never coerce a fetch failure into serverExists:false.
  if (isSettingsError && !publicSettings && !isAlwaysReachablePath(location)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">Unable to reach the server</h1>
        <p className="text-muted-foreground max-w-md">
          We couldn't load this page right now. This is usually temporary — please check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => { void refetchSettings(); }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  // Skip server-not-found check for verify-email/verify/replay pages (needed for email verification flow)
  if (publicSettings?.serverExists === false && !isAlwaysReachablePath(location)) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <ServerNotFoundPage />
      </Suspense>
    );
  }

  // Keep recovery/verification flows reachable during maintenance, matching the serverExists carve-out above.
  if (maintenanceMode && !isAlwaysReachablePath(location)) {
    return <MaintenancePage message={maintenanceMessage} />;
  }

  return (
    <>
      <RealtimeProvider />
      <Toaster />
      <WelcomeModal isOpen={isWelcomeModalOpen} onClose={handleCloseWelcomeModal} />
      <Router />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <DashboardProvider>
          <PlayerWindowProvider>
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </PlayerWindowProvider>
        </DashboardProvider>
      </SidebarProvider>
    </AuthProvider>
  );
}

export default App;
