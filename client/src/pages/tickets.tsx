import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { 
  Bug, 
  Users, 
  MessageSquare, 
  LockKeyhole, 
  Filter, 
  Eye,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// Format date to MM/dd/yy HH:mm in browser's timezone
const formatDate = (dateString: string): string => {
  try {
    if (!dateString || dateString === 'Invalid Date') {
      return 'Unknown';
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return date.toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (e) {
    console.error("Error formatting date:", e, "Input:", dateString);
    return 'Invalid Date'; // Return clear error message if formatting fails
  }
};

// Format date as "X time ago"
const formatTimeAgo = (dateString: string): string => {
  try {
    if (!dateString || dateString === 'Invalid Date') {
      return 'Unknown';
    }
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // Convert to seconds
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec} second${diffSec !== 1 ? 's' : ''} ago`;
    
    // Convert to minutes
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    
    // Convert to hours
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    
    // Convert to days
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    
    // Convert to months
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? 's' : ''} ago`;
    
    // Convert to years
    const diffYear = Math.floor(diffMonth / 12);
    return `${diffYear} year${diffYear !== 1 ? 's' : ''} ago`;
    
  } catch (e) {
    console.error("Error formatting time ago:", e, "Input:", dateString);
    return "Unknown";
  }
};
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent, CardHeader } from '@modl-gg/shared-web/components/ui/card';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { useSidebar } from '@/hooks/use-sidebar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@modl-gg/shared-web/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@modl-gg/shared-web/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { useTickets, useTicketCounts } from '@/hooks/use-data';
import PageContainer from '@/components/layout/PageContainer';

// Define the Ticket interface to match the MongoDB schema
interface Ticket {
  _id?: string;
  id: string;
  type: 'bug' | 'player' | 'chat' | 'appeal' | 'staff' | 'support';
  subject: string;
  reportedBy: string;
  date: string;
  status: 'Unfinished' | 'Open' | 'Closed';
  locked?: boolean;
  description?: string;
  messages?: Array<{
    id: string;
    sender: string;
    senderType: string;
    content: string;
    timestamp: string;
    staff?: boolean;
  }>;
  notes?: Array<{
    author: string;
    content: string;
    timestamp: string;
    isStaffOnly: boolean;
  }>;
}

// Generate a badge color and text based on ticket status
const getTicketStatusInfo = (ticket: Ticket) => {
  // Use simplified status system - only Open or Closed
  const isOpen = !ticket.locked;
                  
  const statusClass = isOpen
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-red-50 text-red-700 border-red-200';
    
  const statusText = isOpen ? 'Open' : 'Closed';
  
  return { statusClass, statusText, isOpen };
};

const Tickets = () => {
  const { } = useSidebar(); // We're not using sidebar context in this component
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("support");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [, setLocation] = useLocation();
  
  // Debounced search query to avoid too many API calls
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  const { data: ticketsResponse, isLoading, error } = useTickets({
    page: currentPage,
    limit: 10,
    search: debouncedSearchQuery,
    status: statusFilter === "all" ? "" : statusFilter,
    type: activeTab,
  });
  
  // Get ticket counts for all categories to show in tab badges
  const { counts: ticketCounts, isLoading: isLoadingCounts } = useTicketCounts({
    search: debouncedSearchQuery,
    status: statusFilter === "all" ? "" : statusFilter,
  });
  
  // More generous left margin to prevent text overlap with sidebar
  const mainContentClass = "ml-[32px] pl-8";

  // Extract data from the paginated response
  const tickets = ticketsResponse?.tickets || [];
  const pagination = ticketsResponse?.pagination || {
    current: 1,
    total: 1,
    totalTickets: 0,
    hasNext: false,
    hasPrev: false,
  };
  
  // Convert ticket status to simplified Open/Closed
  const getSimplifiedStatus = (ticket: Ticket): 'open' | 'closed' => {
    // Using simplified status system - if it's not Open or it's locked, it's closed
    if (ticket.locked === true) {
      return 'closed';
    }
    return 'open';
  };
  
  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, statusFilter]);
    const handleNavigateToTicket = (ticketId: string) => {
    // Navigate to the ticket detail page
    // Navigate to ticket
    
    // Ensure ticketId is defined and is a string
    if (!ticketId || typeof ticketId !== 'string') {
      console.error('Invalid ticket ID for navigation:', ticketId);
      return;
    }
    
    // Remove any characters that might cause issues in the URL
    // Replace # with "ID-" to avoid hash confusion in the URL
    const safeTicketId = ticketId.replace('#', 'ID-');
    // Ticket ID processed for URL
    
    // Add a small delay to make sure the navigation occurs
    setTimeout(() => {
      setLocation(`/panel/tickets/${safeTicketId}`);
    }, 50);
  };

  // Get the timestamp of the last message in the ticket
  const getLastReplyTimestamp = (ticket: Ticket): string => {
    if (!ticket.messages || ticket.messages.length === 0) {
      return ticket.date; // If no messages, use the ticket creation date
    }
    
    // Sort messages by timestamp (newest first)
    const sortedMessages = [...ticket.messages].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return sortedMessages[0].timestamp;
  };

  // Render a single ticket row
  const renderTicketRow = (ticket: Ticket, index: number) => {
    const lastReplyTimestamp = getLastReplyTimestamp(ticket);
    
    return (
      <TableRow key={index} className="border-b border-border">
        <TableCell>{ticket.id}</TableCell>
        <TableCell className="font-medium">
          {ticket.subject}
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge 
              variant="outline" 
              className={`text-xs px-1.5 py-0 h-5 ${getTicketStatusInfo(ticket).statusClass}`}
            >
              {getTicketStatusInfo(ticket).statusText}
            </Badge>
          </div>
        </TableCell>
        <TableCell>{ticket.reportedBy}</TableCell>
        <TableCell>{formatDate(ticket.date)}</TableCell>
        <TableCell>{formatTimeAgo(lastReplyTimestamp)}</TableCell>
        <TableCell>
          <div className="flex space-x-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="View" onClick={() => handleNavigateToTicket(ticket.id)}>
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  // Render a loading row
  const renderLoadingRow = () => (
    <TableRow>
      <TableCell colSpan={6} className="text-center py-6">
        <div className="flex justify-center items-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading tickets...</span>
        </div>
      </TableCell>
    </TableRow>
  );

  // Render an empty table message
  const renderEmptyRow = () => (
    <TableRow>
      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
        No tickets match your current filters.
      </TableCell>
    </TableRow>
  );

  // Render ticket table content based on loading state and data
  const renderTicketTableContent = () => {
    if (isLoading) {
      return renderLoadingRow();
    }
    
    if (tickets.length > 0) {
      return tickets.map((ticket: Ticket, index: number) => renderTicketRow(ticket, index));
    }
    
    return renderEmptyRow();
  };

  // Render table with header and content
  const renderTicketTable = () => (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead className="rounded-l-lg">ID</TableHead>
          <TableHead>Subject</TableHead>
          <TableHead>Reported By</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last Reply</TableHead>
          <TableHead className="rounded-r-lg">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {renderTicketTableContent()}
      </TableBody>
    </Table>
  );

  // Handle pagination navigation
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  
  // Render pagination controls
  const renderPagination = () => (
    <div className="flex justify-between items-center pt-4">
      <div className="text-sm text-muted-foreground">
        Showing {((pagination.current - 1) * 10) + 1}-{Math.min(pagination.current * 10, pagination.totalTickets)} of {pagination.totalTickets} entries
      </div>
      <div className="flex space-x-1">
        <Button 
          variant="outline" 
          size="sm" 
          className="px-3 py-1"
          disabled={!pagination.hasPrev}
          onClick={() => handlePageChange(pagination.current - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {/* Page numbers */}
        {Array.from({ length: Math.min(5, pagination.total) }, (_, i) => {
          const page = Math.max(1, pagination.current - 2) + i;
          if (page > pagination.total) return null;
          
          return (
            <Button
              key={page}
              variant={page === pagination.current ? "default" : "outline"}
              size="sm"
              className="px-3 py-1"
              onClick={() => handlePageChange(page)}
            >
              {page}
            </Button>
          );
        })}
        
        <Button 
          variant="outline" 
          size="sm" 
          className="px-3 py-1"
          disabled={!pagination.hasNext}
          onClick={() => handlePageChange(pagination.current + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <PageContainer>
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Tickets</h2>
          <div className="flex space-x-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets, players, staff, or content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-80"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-background border border-border text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Card>
          <CardHeader className="p-0">
            <Tabs defaultValue="support" className="w-full" onValueChange={setActiveTab}>
              <TabsList className="w-full h-full justify-start rounded-none bg-transparent border-b border-border overflow-x-auto mx-1">
                <TabsTrigger 
                  value="support" 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-6 py-2"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Support
                  <Badge variant="outline" className="ml-2 bg-muted/30 text-foreground border-none text-xs font-medium">{ticketCounts.support || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="bug" 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-6 py-2"
                >
                  <Bug className="h-4 w-4 mr-2" />
                  Bug Reports
                  <Badge variant="outline" className="ml-2 bg-muted/30 text-foreground border-none text-xs font-medium">{ticketCounts.bug || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="player" 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-6 py-2"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Player Reports
                  <Badge variant="outline" className="ml-2 bg-muted/30 text-foreground border-none text-xs font-medium">{ticketCounts.player || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="chat" 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-6 py-2"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat Reports
                  <Badge variant="outline" className="ml-2 bg-muted/30 text-foreground border-none text-xs font-medium">{ticketCounts.chat || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="appeal" 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-6 py-2"
                >
                  <LockKeyhole className="h-4 w-4 mr-2" />
                  Ban Appeals
                  <Badge variant="outline" className="ml-2 bg-muted/30 text-foreground border-none text-xs font-medium">{ticketCounts.appeal || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger 
                  value="staff" 
                  className="border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary rounded-none px-6 py-2"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Staff Applications
                  <Badge variant="outline" className="ml-2 bg-muted/30 text-foreground border-none text-xs font-medium">{ticketCounts.staff || 0}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="support" className="p-0 mt-0">
                <CardContent className="p-4">
                  {renderTicketTable()}
                  {renderPagination()}
                </CardContent>
              </TabsContent>
              
              <TabsContent value="bug" className="p-0 mt-0">
                <CardContent className="p-4">
                  {renderTicketTable()}
                  {renderPagination()}
                </CardContent>
              </TabsContent>
              
              <TabsContent value="player" className="p-0 mt-0">
                <CardContent className="p-4">
                  {renderTicketTable()}
                  {renderPagination()}
                </CardContent>
              </TabsContent>
              
              <TabsContent value="chat" className="p-0 mt-0">
                <CardContent className="p-4">
                  {renderTicketTable()}
                  {renderPagination()}
                </CardContent>
              </TabsContent>
              
              <TabsContent value="appeal" className="p-0 mt-0">
                <CardContent className="p-4">
                  {renderTicketTable()}
                  {renderPagination()}
                </CardContent>
              </TabsContent>
              
              <TabsContent value="staff" className="p-0 mt-0">
                <CardContent className="p-4">
                  {renderTicketTable()}
                  {renderPagination()}
                </CardContent>
              </TabsContent>
          
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </PageContainer>
  );
};

export default Tickets;