import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from 'modl-shared-web/components/ui/button';

const ApiDocs = () => {
  const [expandedEndpoints, setExpandedEndpoints] = useState<Record<string, boolean>>({
    'players': true,
    'tickets': false,
    'appeals': false,
    'logs': false,
    'staff': false,
    'settings': false
  });

  const toggleEndpoint = (endpoint: string) => {
    setExpandedEndpoints(prev => ({
      ...prev,
      [endpoint]: !prev[endpoint]
    }));
  };

  const endpoints = [
    {
      id: 'players',
      title: 'Players API',
      description: 'Manage player information and punishments',
      routes: [
        {
          method: 'GET',
          path: '/api/panel/players',
          description: 'Retrieve a list of all players',
          responseType: 'Array<Player>'
        },
        {
          method: 'GET',
          path: '/api/panel/players/:uuid',
          description: 'Get detailed information about a specific player',
          responseType: 'Player'
        },
        {
          method: 'POST',
          path: '/api/panel/players',
          description: 'Create a new player record',
          requestType: 'Player',
          responseType: 'Player'
        },
        {
          method: 'PATCH',
          path: '/api/panel/players/:uuid',
          description: 'Update a player\'s information',
          requestType: 'Partial<Player>',
          responseType: 'Player'
        },
        {
          method: 'POST',
          path: '/api/panel/players/:uuid/punishments',
          description: 'Apply a punishment to a player',
          requestType: 'Punishment',
          responseType: 'Player'
        },
        {
          method: 'POST',
          path: '/api/panel/players/:uuid/notes',
          description: 'Add a note to a player\'s record',
          requestType: 'Note',
          responseType: 'Player'
        }
      ]
    },
    {
      id: 'tickets',
      title: 'Tickets API',
      description: 'Manage support tickets and staff communications',
      routes: [
        {
          method: 'GET',
          path: '/api/panel/tickets',
          description: 'Retrieve a list of all tickets',
          responseType: 'Array<Ticket>'
        },
        {
          method: 'GET',
          path: '/api/panel/tickets/:id',
          description: 'Get detailed information about a specific ticket',
          responseType: 'Ticket'
        },
        {
          method: 'POST',
          path: '/api/panel/tickets/bug',
          description: 'Create a new bug report ticket',
          requestType: 'BugReportForm',
          responseType: 'Ticket'
        },
        {
          method: 'POST',
          path: '/api/panel/tickets/player',
          description: 'Create a new player report ticket',
          requestType: 'PlayerReportForm',
          responseType: 'Ticket'
        },
        {
          method: 'POST',
          path: '/api/panel/tickets/chat',
          description: 'Create a new chat report ticket',
          requestType: 'ChatReportForm',
          responseType: 'Ticket'
        },
        {
          method: 'POST',
          path: '/api/panel/tickets/staff',
          description: 'Create a new staff application ticket',
          requestType: 'StaffApplicationForm',
          responseType: 'Ticket'
        },
        {
          method: 'POST',
          path: '/api/panel/tickets/support',
          description: 'Create a new general support ticket',
          requestType: 'SupportForm',
          responseType: 'Ticket'
        },
        {
          method: 'POST',
          path: '/api/panel/tickets/:id/submit',
          description: 'Submit an unfinished ticket',
          requestType: 'TicketForm',
          responseType: 'Ticket'
        },
        {
          method: 'PATCH',
          path: '/api/panel/tickets/:id',
          description: 'Update ticket status or add a reply',
          requestType: 'TicketUpdate',
          responseType: 'Ticket'
        }
      ]
    },
    {
      id: 'appeals',
      title: 'Appeals API',
      description: 'Manage ban appeals from players',
      routes: [
        {
          method: 'GET',
          path: '/api/panel/appeals',
          description: 'Retrieve a list of all appeals',
          responseType: 'Array<Appeal>'
        },
        {
          method: 'GET',
          path: '/api/panel/appeals/:id',
          description: 'Get detailed information about a specific appeal',
          responseType: 'Appeal'
        },
        {
          method: 'GET',
          path: '/api/panel/appeals/punishment/:id',
          description: 'Get appeals related to a specific punishment',
          responseType: 'Array<Appeal>'
        },
        {
          method: 'POST',
          path: '/api/panel/appeals',
          description: 'Create a new appeal',
          requestType: 'AppealForm',
          responseType: 'Appeal'
        },
        {
          method: 'POST',
          path: '/api/panel/appeals/:id/reply',
          description: 'Add a reply to an appeal',
          requestType: 'AppealReply',
          responseType: 'Appeal'
        },
        {
          method: 'PATCH',
          path: '/api/panel/appeals/:id/status',
          description: 'Update an appeal\'s status',
          requestType: '{ status: "Accepted" | "Rejected" | "Pending" }',
          responseType: 'Appeal'
        }
      ]
    },
    {
      id: 'logs',
      title: 'Logs API',
      description: 'Access and create system logs',
      routes: [
        {
          method: 'GET',
          path: '/api/panel/logs',
          description: 'Retrieve system logs with optional filtering',
          responseType: 'Array<Log>'
        },
        {
          method: 'POST',
          path: '/api/panel/logs',
          description: 'Create a new system log entry',
          requestType: 'Log',
          responseType: 'Log'
        }
      ]
    },
    {
      id: 'staff',
      title: 'Staff API',
      description: 'Manage staff accounts and permissions',
      routes: [
        {
          method: 'GET',
          path: '/api/panel/staff',
          description: 'Retrieve a list of all staff members',
          responseType: 'Array<StaffMember>'
        },
        {
          method: 'GET',
          path: '/api/panel/staff/:id',
          description: 'Get detailed information about a specific staff member',
          responseType: 'StaffMember'
        }
      ]
    },
    {
      id: 'settings',
      title: 'Settings API',
      description: 'Access and modify system settings',
      routes: [
        {
          method: 'GET',
          path: '/api/panel/settings',
          description: 'Retrieve current system settings',
          responseType: 'Settings'
        },
        {
          method: 'PATCH',
          path: '/api/panel/settings',
          description: 'Update system settings',
          requestType: 'Partial<Settings>',
          responseType: 'Settings'
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen items-center justify-center bg-background px-24 py-24">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">API Documentation</h1>
        <p className="text-muted-foreground">
          This documentation provides details on the available API endpoints for the Minecraft Moderation Panel.
        </p>
      </div>

      <br></br>

      <div className="grid gap-6">
        {endpoints.map((endpoint) => (
          <div key={endpoint.id} className="border rounded-lg overflow-hidden">
            <div 
              className="flex items-center justify-between px-4 py-3 bg-muted/40 cursor-pointer"
              onClick={() => toggleEndpoint(endpoint.id)}
            >
              <h2 className="text-xl font-semibold">{endpoint.title}</h2>
              <Button variant="ghost" size="icon">
                {expandedEndpoints[endpoint.id] ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
              </Button>
            </div>
            
            {expandedEndpoints[endpoint.id] && (
              <div className="p-4 space-y-4">
                <p className="text-muted-foreground">{endpoint.description}</p>
                
                <div className="space-y-3">
                  {endpoint.routes.map((route, index) => (
                    <div key={index} className="border rounded-md overflow-hidden">
                      <div className="flex items-center px-4 py-2 bg-muted/20">
                        <span className={`inline-block px-2 py-1 text-xs font-medium rounded-md mr-3 ${
                          route.method === 'GET' ? 'bg-blue-100 text-blue-700' :
                          route.method === 'POST' ? 'bg-green-100 text-green-700' :
                          route.method === 'PATCH' ? 'bg-yellow-100 text-yellow-700' :
                          route.method === 'DELETE' ? 'bg-red-100 text-red-700' : ''
                        }`}>
                          {route.method}
                        </span>
                        <code className="font-mono text-sm">{route.path}</code>
                      </div>
                      <div className="p-3 space-y-2">
                        <p>{route.description}</p>
                        {route.requestType && (
                          <div className="text-sm">
                            <span className="font-semibold">Request:</span> <code className="bg-muted/30 px-1.5 py-0.5 rounded">{route.requestType}</code>
                          </div>
                        )}
                        <div className="text-sm">
                          <span className="font-semibold">Response:</span> <code className="bg-muted/30 px-1.5 py-0.5 rounded">{route.responseType}</code>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApiDocs;