import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  CircleDot,
  CheckCircle2,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Square,
  CheckSquare,
  Eye,
  User,
  SortAsc
} from 'lucide-react';
import { formatDate, formatTimeAgo } from '../utils/date-utils';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Card, CardContent } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@modl-gg/shared-web/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@modl-gg/shared-web/components/ui/select';
import { useTickets, useTicketStatusCounts, useBulkUpdateTickets, useLabels, useStaff } from '@/hooks/use-data';
import { useIsMobile } from '@/hooks/use-mobile';
import PageContainer from '@/components/layout/PageContainer';
import { FilterDropdown } from '@/components/tickets/FilterDropdown';
import { BulkActionBar } from '@/components/tickets/BulkActionBar';
import { LabelBadge } from '@/components/ui/label-badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';

interface Ticket {
  _id?: string;
  id: string;
  type: string;
  subject: string;
  reportedBy: string;
  reportedByName?: string;
  date: string;
  status: string;
  locked?: boolean;
  tags?: string[];
  assignedTo?: string;
  lastReply?: {
    created: string;
    name: string;
    staff: boolean;
  };
  replyCount?: number;
}

interface Label {
  id: string;
  name: string;
  color: string;
  description?: string;
}

const Tickets = () => {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // State for filters
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState<string[]>([]);
  const [labelFilters, setLabelFilters] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [sortOption, setSortOption] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);

  // Multi-select state
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedTickets(new Set());
  }, [statusFilter, authorFilter, labelFilters, assigneeFilter, typeFilter, sortOption]);

  // Fetch data
  const { data: ticketsResponse, isLoading, refetch } = useTickets({
    page: currentPage,
    limit: 25,
    search: debouncedSearchQuery,
    status: statusFilter,
    types: typeFilter,
    author: authorFilter.length === 1 ? authorFilter[0] : '',
    labels: labelFilters,
    assignees: assigneeFilter,
    sort: sortOption,
  });

  const { data: statusCounts } = useTicketStatusCounts({
    search: debouncedSearchQuery,
    types: typeFilter,
    author: authorFilter.length === 1 ? authorFilter[0] : '',
    labels: labelFilters,
    assignees: assigneeFilter,
  });

  const { data: labelsData } = useLabels();
  const { data: staffData } = useStaff();
  const bulkUpdateMutation = useBulkUpdateTickets();

  const tickets: Ticket[] = ticketsResponse?.tickets || [];
  const pagination = ticketsResponse?.pagination || {
    current: 1,
    total: 1,
    totalTickets: 0,
    hasNext: false,
    hasPrev: false,
  };

  const labels: Label[] = labelsData || [];
  const staffMembers = (staffData || []).map((s: any) => ({
    value: s.username || s.email?.split('@')[0] || '',
    label: s.username || s.email?.split('@')[0] || 'Unknown',
  }));

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedTickets.size === tickets.length) {
      setSelectedTickets(new Set());
    } else {
      setSelectedTickets(new Set(tickets.map((t) => t.id)));
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    const newSelection = new Set(selectedTickets);
    if (newSelection.has(ticketId)) {
      newSelection.delete(ticketId);
    } else {
      newSelection.add(ticketId);
    }
    setSelectedTickets(newSelection);
  };

  // Bulk action handlers
  const handleBulkMarkAs = async (status: 'open' | 'closed') => {
    try {
      await bulkUpdateMutation.mutateAsync({
        ticketIds: Array.from(selectedTickets),
        locked: status === 'closed',
      });
      toast({ title: 'Success', description: `Marked ${selectedTickets.size} tickets as ${status}` });
      setSelectedTickets(new Set());
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: `Failed to mark tickets as ${status}`, variant: 'destructive' });
    }
  };

  const handleBulkAddLabels = async (labelsToAdd: string[]) => {
    try {
      await bulkUpdateMutation.mutateAsync({
        ticketIds: Array.from(selectedTickets),
        addLabels: labelsToAdd,
      });
      toast({ title: 'Success', description: `Added labels to ${selectedTickets.size} tickets` });
      setSelectedTickets(new Set());
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add labels', variant: 'destructive' });
    }
  };

  const handleBulkAssign = async (assignees: string[]) => {
    try {
      await bulkUpdateMutation.mutateAsync({
        ticketIds: Array.from(selectedTickets),
        assignTo: assignees.join(','),
      });
      toast({ title: 'Success', description: `Assigned ${selectedTickets.size} tickets to ${assignees.length} staff member(s)` });
      setSelectedTickets(new Set());
      refetch();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to assign tickets', variant: 'destructive' });
    }
  };

  const handleNavigateToTicket = (ticketId: string) => {
    if (!ticketId || typeof ticketId !== 'string') return;
    const safeTicketId = ticketId.replace('#', 'ID-');
    setTimeout(() => setLocation(`/panel/tickets/${safeTicketId}`), 50);
  };

  // Type filter options
  const typeOptions = [
    { value: 'support', label: 'Support' },
    { value: 'bug', label: 'Bug Report' },
    { value: 'player', label: 'Player Report' },
    { value: 'chat', label: 'Chat Report' },
    { value: 'appeal', label: 'Ban Appeal' },
    { value: 'staff', label: 'Staff Application' },
  ];

  // Sort options
  const sortOptions = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'recently-updated', label: 'Recently Updated' },
    { value: 'least-recently-updated', label: 'Least Recently Updated' },
  ];

  const renderTicketRow = (ticket: Ticket) => {
    const isSelected = selectedTickets.has(ticket.id);
    const ticketLabels = ticket.tags || [];

    return (
      <TableRow
        key={ticket.id}
        className={`border-b border-border hover:bg-muted/50 cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
      >
        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => handleSelectTicket(ticket.id)}
          />
        </TableCell>
        <TableCell onClick={() => handleNavigateToTicket(ticket.id)}>
          <div className="flex items-start gap-3">
            {ticket.locked ? (
              <CheckCircle2 className="h-4 w-4 text-purple-500 mt-1 flex-shrink-0" />
            ) : (
              <CircleDot className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{ticket.subject}</span>
                {ticketLabels.map((tagName) => {
                  const label = labels.find((l) => l.name === tagName);
                  return (
                    <LabelBadge
                      key={tagName}
                      name={tagName}
                      color={label?.color || '#6b7280'}
                      size="sm"
                    />
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                #{ticket.id} opened {formatTimeAgo(ticket.date)} by {ticket.reportedByName || ticket.reportedBy}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground">
          {ticket.assignedTo && (
            <div className="flex items-center justify-end gap-1">
              <User className="h-3.5 w-3.5" />
              <span>{ticket.assignedTo}</span>
            </div>
          )}
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
          {ticket.replyCount || 0} replies
        </TableCell>
        <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
          {ticket.lastReply ? formatTimeAgo(ticket.lastReply.created) : '-'}
        </TableCell>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              handleNavigateToTicket(ticket.id);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  const renderMobileTicketCard = (ticket: Ticket) => {
    const isSelected = selectedTickets.has(ticket.id);
    const ticketLabels = ticket.tags || [];

    return (
      <Card
        key={ticket.id}
        className={`mb-3 ${isSelected ? 'ring-2 ring-primary' : ''}`}
        onClick={() => handleNavigateToTicket(ticket.id)}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => handleSelectTicket(ticket.id)}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {ticket.locked ? (
                  <CheckCircle2 className="h-4 w-4 text-purple-500 flex-shrink-0" />
                ) : (
                  <CircleDot className="h-4 w-4 text-green-500 flex-shrink-0" />
                )}
                <span className="font-medium text-sm truncate">{ticket.subject}</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                {ticketLabels.map((tagName) => {
                  const label = labels.find((l) => l.name === tagName);
                  return (
                    <LabelBadge
                      key={tagName}
                      name={tagName}
                      color={label?.color || '#6b7280'}
                      size="sm"
                    />
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground">
                #{ticket.id} - {ticket.reportedByName || ticket.reportedBy} - {formatTimeAgo(ticket.date)}
              </div>
              {ticket.assignedTo && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {ticket.assignedTo}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <PageContainer>
      <div className="flex flex-col space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
          <h2 className="text-xl font-semibold">Tickets</h2>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
          {/* Status tabs */}
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant={statusFilter === 'open' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('open')}
              className="h-8"
            >
              <CircleDot className="h-4 w-4 mr-1.5 text-green-500" />
              {statusCounts?.open ?? 0} Open
            </Button>
            <Button
              variant={statusFilter === 'closed' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('closed')}
              className="h-8"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5 text-purple-500" />
              {statusCounts?.closed ?? 0} Closed
            </Button>
          </div>

          <div className="h-6 w-px bg-border mx-1" />

          {/* Filter dropdowns */}
          <FilterDropdown
            label="Type"
            options={typeOptions}
            selected={typeFilter}
            onChange={setTypeFilter}
            multiSelect
          />

          <FilterDropdown
            label="Label"
            options={labels.map((l) => ({ value: l.name, label: l.name, color: l.color }))}
            selected={labelFilters}
            onChange={setLabelFilters}
            multiSelect
            searchable
          />

          <FilterDropdown
            label="Assignee"
            options={[{ value: 'none', label: 'Unassigned' }, ...staffMembers]}
            selected={assigneeFilter}
            onChange={setAssigneeFilter}
            multiSelect
            searchable
          />

          <div className="flex-1" />

          {/* Sort */}
          <Select value={sortOption} onValueChange={setSortOption}>
            <SelectTrigger className="w-[180px] h-8">
              <SortAsc className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Bulk action bar */}
        {selectedTickets.size > 0 && (
          <BulkActionBar
            selectedCount={selectedTickets.size}
            onClearSelection={() => setSelectedTickets(new Set())}
            onMarkAs={handleBulkMarkAs}
            onAddLabels={handleBulkAddLabels}
            onAssign={handleBulkAssign}
            availableLabels={labels}
            staffMembers={staffMembers}
            isLoading={bulkUpdateMutation.isPending}
          />
        )}

        {/* Ticket list */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                <span className="text-muted-foreground">Loading tickets...</span>
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No tickets match your current filters.
              </div>
            ) : isMobile ? (
              <div className="p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Checkbox
                    checked={selectedTickets.size === tickets.length && tickets.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Select all</span>
                </div>
                {tickets.map(renderMobileTicketCard)}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedTickets.size === tickets.length && tickets.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="text-right">Assignee</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Last Reply</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map(renderTicketRow)}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {tickets.length > 0 && (
          <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:justify-between md:items-center">
            <div className="text-sm text-muted-foreground text-center md:text-left">
              Showing {((pagination.current - 1) * 25) + 1}-{Math.min(pagination.current * 25, pagination.totalTickets)} of {pagination.totalTickets} tickets
            </div>
            <div className="flex justify-center space-x-1">
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrev}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, pagination.total) }, (_, i) => {
                const page = Math.max(1, pagination.current - 2) + i;
                if (page > pagination.total) return null;
                return (
                  <Button
                    key={page}
                    variant={page === pagination.current ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};

export default Tickets;
