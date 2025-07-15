import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Toaster } from "modl-shared-web/components/ui/toaster";
import { TooltipProvider } from "modl-shared-web/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Sidebar from "@/components/layout/Sidebar";
import MobileNavbar from "@/components/layout/MobileNavbar";
import { SidebarProvider } from "@/hooks/use-sidebar";
import { DashboardProvider } from "@/contexts/DashboardContext";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProtectedRoute, AuthRoute } from "@/lib/protected-route";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useProvisioningStatusCheck } from "@/hooks/use-provisioning-status";
import { PlayerWindowProvider } from "@/contexts/PlayerWindowContext";
import Home from "@/pages/home";
import Lookup from "@/pages/lookup";
import LookupPage from "@/pages/lookup-page";
import PlayerDetailPage from "@/pages/player-detail-page";
import Tickets from "@/pages/tickets";
import TicketDetail from "@/pages/ticket-detail";
import PlayerTicket from "@/pages/player-ticket";
import Audit from "@/pages/audit";
import Settings from "@/pages/settings";
import AuthPage from "@/pages/auth-page";
import AppealsPage from "@/pages/appeals";
import ApiDocs from "@/pages/api-docs";
import ProvisioningInProgressPage from "@/pages/provisioning-in-progress";
import AcceptInvitationPage from "@/pages/AcceptInvitationPage";
import { WelcomeModal } from "@/components/layout/WelcomeModal";
import MaintenancePage from "./pages/MaintenancePage";
import RateLimitPage from "@/pages/RateLimitPage";
import { Loader2 } from "lucide-react";

// Knowledgebase Pages
import KnowledgebasePage from "@/pages/KnowledgebasePage";
import ArticleDetailPage from "@/pages/ArticleDetailPage";
import HomePage from "@/pages/HomePage";

function Router() {
  const [location] = useLocation();
  const isMobile = useIsMobile();

  // Handle public Knowledgebase routes first
  // Check if the location is NOT part of the admin panel, auth, appeals, etc.
  const isAdminPanelRoute = location.startsWith("/panel");
  const isAuthPage = location === '/auth' || location === '/panel/auth';
  const isAppealsPage = location === '/appeal'; // Assuming appeals is not under /panel
  const isPlayerTicketPage = location.startsWith('/ticket/'); // Assuming player-ticket is not under /panel
  const isProvisioningPage = location === '/provisioning-in-progress';
  const isAcceptInvitationPage = location.startsWith('/accept-invitation');

  if (!isAdminPanelRoute && !isAuthPage && !isAppealsPage && !isPlayerTicketPage && !isProvisioningPage && !isAcceptInvitationPage) {
    return (
      <main className="h-full bg-background"> {/* Basic wrapper for public pages */}
        <Switch>
          <Route path="/knowledgebase" component={KnowledgebasePage} />
          <Route path="/:articleSlug" component={ArticleDetailPage} />
          <Route path="/" component={HomePage} />
          {/* Fallback for unmatched public routes, ensure it's placed after specific public routes */}
          {/* <Route component={NotFound} />  Consider if a global NotFound is better */}
        </Switch>
      </main>
    );
  }
  
  // Don't show navigation on auth page, appeals page, player ticket page, or provisioning page
  // Note: isAuthPage now covers /auth and /panel/auth
  if (isAuthPage || isAppealsPage || isPlayerTicketPage || isProvisioningPage || isAcceptInvitationPage) {
    return (
      <main className="h-full bg-background">
        <Switch>
          <AuthRoute path="/auth" component={AuthPage} />
          <AuthRoute path="/panel/auth" component={AuthPage} />
          <Route path="/appeal" component={AppealsPage} />
          <Route path="/ticket/:id" component={PlayerTicket} />
          <Route path="/provisioning-in-progress" component={ProvisioningInProgressPage} />
          <Route path="/accept-invitation" component={AcceptInvitationPage} />
        </Switch>
      </main>
    );
  }

  // Mobile version
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        <main className="flex-1 overflow-y-auto bg-background transition-all duration-300 ease-in-out scrollbar pb-16">
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
            {/* These routes are assumed to be outside /panel */}
            <AuthRoute path="/auth" component={AuthPage} /> {/* For direct /auth access */}
            <Route path="/appeal" component={AppealsPage} />
            <Route path="/ticket/:id" component={PlayerTicket} />
            <Route path="/provisioning-in-progress" component={ProvisioningInProgressPage} />
            <Route path="/accept-invitation" component={AcceptInvitationPage} />
            <Route path="/rate-limit" component={RateLimitPage} />
            {/* Public KB routes for mobile, if accessed directly and not caught by earlier block */}
            <Route path="/knowledgebase" component={KnowledgebasePage} />
            <Route path="/:articleSlug" component={ArticleDetailPage} />
            <Route path="/" component={HomePage} />
            <Route component={NotFound} />
          </Switch>
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
        <Switch>
          <ProtectedRoute path="/panel" component={Home} />
          <ProtectedRoute path="/panel/lookup" component={Lookup} />
          <ProtectedRoute path="/panel/tickets" component={Tickets} />
          <ProtectedRoute path="/panel/tickets/:id" component={TicketDetail} />
          <ProtectedRoute path="/panel/audit" component={Audit} />
          <ProtectedRoute path="/panel/settings" component={Settings} />
          <ProtectedRoute path="/panel/api-docs" component={ApiDocs} />
          <AuthRoute path="/panel/auth" component={AuthPage} />
           {/* These routes are assumed to be outside /panel */}
          <AuthRoute path="/auth" component={AuthPage} /> {/* For direct /auth access */}
          <Route path="/appeal" component={AppealsPage} />
          <Route path="/ticket/:id" component={PlayerTicket} />
          <Route path="/provisioning-in-progress" component={ProvisioningInProgressPage} />
          <Route path="/accept-invitation" component={AcceptInvitationPage} />
          <Route path="/rate-limit" component={RateLimitPage} />
          {/* Public KB routes for desktop, if accessed directly and not caught by earlier block */}
          <Route path="/knowledgebase" component={KnowledgebasePage} />
          <Route path="/:articleSlug" component={ArticleDetailPage} />
          <Route path="/" component={HomePage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function AppContent() {
  const { user, isLoading, maintenanceMode, maintenanceMessage } = useAuth();
  const [location] = useLocation();
  const [isWelcomeModalOpen, setWelcomeModalOpen] = useState(false);

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
    
    if (!hasSeenModal && isOnPanelHomePage && !isFromProvisioning && !isOnExcludedPage && !isOnPlayerTicketPage && !isOnAcceptInvitationPage) {
      setWelcomeModalOpen(true);
    }
  }, [location]);

  const handleCloseWelcomeModal = () => {
    localStorage.setItem("hasSeenWelcomeModal", "true");
    setWelcomeModalOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';

  if (maintenanceMode && !isAdmin) {
    return <MaintenancePage message={maintenanceMessage} />;
  }

  return (
    <>
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
