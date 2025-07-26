import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { ArrowUpIcon, ArrowDownIcon, Users, Ticket, Shield, AlertTriangle } from 'lucide-react';

interface OverviewData {
  totalTickets: number;
  totalPlayers: number;
  totalStaff: number;
  activeTickets: number;
  ticketChange: number;
  playerChange: number;
}

interface OverviewCardsProps {
  data: OverviewData | null;
  loading: boolean;
}

export function OverviewCards({ data, loading }: OverviewCardsProps) {
  if (loading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              </CardTitle>
              <div className="h-8 w-8 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Total Players',
      value: data.totalPlayers.toLocaleString(),
      icon: Users,
      change: data.playerChange,
      description: 'Registered players'
    },
    {
      title: 'Total Tickets',
      value: data.totalTickets.toLocaleString(),
      icon: Ticket,
      change: data.ticketChange,
      description: 'All time tickets'
    },
    {
      title: 'Active Tickets',
      value: data.activeTickets.toLocaleString(),
      icon: AlertTriangle,
      change: null,
      description: 'Requiring attention'
    },
    {
      title: 'Staff Members',
      value: data.totalStaff.toLocaleString(),
      icon: Shield,
      change: null,
      description: 'Active staff'
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground">
              {card.change !== null && (
                <span className={`inline-flex items-center ${card.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {card.change >= 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
                  {Math.abs(card.change)}% from last month
                </span>
              )}
              {card.change === null && card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}