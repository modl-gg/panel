import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@modl-gg/shared-web/components/ui/card';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@modl-gg/shared-web/components/ui/table';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { 
  Ban, Eye, Search, TriangleAlert, Loader2, RefreshCcw 
} from 'lucide-react';
import { usePlayer } from '@/hooks/use-data';
import ResizableWindow from '@/components/layout/ResizableWindow';
import { useToast } from '@/hooks/use-toast';

interface Warning {
  type: string;
  reason: string;
  date: string;
  by: string;
  originalDate?: string; // For sorting purposes
}

interface PlayerDetailInfo {
  username: string;
  status: string;
  vip?: boolean;
  level?: number;
  uuid: string;
  firstJoined: string;
  lastOnline: string;
  playtime?: string;
  ip?: string;
  previousNames?: string;
  warnings: Warning[];
}

// Component for the detailed player view window
const PlayerLookupWindow = ({ 
  playerId, 
  isOpen, 
  onClose 
}: { 
  playerId?: string; 
  isOpen: boolean; 
  onClose: () => void;
}) => {
  const [playerInfo, setPlayerInfo] = useState<PlayerDetailInfo>({
    username: '',
    status: '',
    uuid: '',
    firstJoined: '',
    lastOnline: '',
    warnings: []
  });

  const { data: player, isLoading, error } = usePlayer(playerId || '');

  useEffect(() => {
    if (player && isOpen) {
      // Check if we're dealing with MongoDB data or the API response format
      if (player.username && player.uuid) {
        // This is already in the correct format from our API
        setPlayerInfo({
          username: player.username,
          status: player.status,
          uuid: player.uuid,
          firstJoined: player.firstJoined,
          lastOnline: player.lastOnline,
          warnings: player.warnings || []
        });
      } else if (player.usernames) {
        // This is MongoDB raw data that needs formatting
        const currentUsername = player.usernames && player.usernames.length > 0 
          ? player.usernames[player.usernames.length - 1].username 
          : 'Unknown';
        
        const firstJoined = player.usernames && player.usernames.length > 0 
          ? new Date(player.usernames[0].date).toLocaleDateString() 
          : 'Unknown';
        
        // Get previous usernames
        const previousNames = player.usernames && player.usernames.length > 1
          ? player.usernames
              .slice(0, -1) // All except the most recent
              .map((u: any) => u.username)
              .join(', ')
          : 'None';
        
        // Format IP
        const lastIP = player.ipList && player.ipList.length > 0 
          ? player.ipList[player.ipList.length - 1].ipAddress.replace(/\d+$/, 'x.x') 
          : 'Unknown';
          
        // Determine player status
        const status = player.punishments && player.punishments.some((p: any) => p.active && !p.expires) 
          ? 'Banned' 
          : player.punishments && player.punishments.some((p: any) => p.active) 
          ? 'Restricted' 
          : 'Active';
        
        // Format warnings from notes
        const warnings: Warning[] = player.notes ? player.notes.map((note: any) => ({
          type: 'Warning',
          reason: note.text,
          date: new Date(note.date).toLocaleDateString(),
          by: note.issuerName,
          originalDate: note.date // Store original date for sorting
        })) : [];
        
        // Add punishments to warnings
        if (player.punishments) {
          player.punishments.forEach((punishment: any) => {
            warnings.push({
              type: punishment.type,
              reason: punishment.reason,
              date: new Date(punishment.date).toLocaleDateString(),
              by: punishment.issuerName + (punishment.expires ? ` (until ${new Date(punishment.expires).toLocaleDateString()})` : ''),
              originalDate: punishment.date // Store original date for sorting
            });
          });
        }
        
        // Sort warnings by date (most recent first)
        warnings.sort((a, b) => {
          const dateA = new Date((a as any).originalDate || a.date || 0).getTime();
          const dateB = new Date((b as any).originalDate || b.date || 0).getTime();
          return dateB - dateA; // Descending order (newest first)
        });
        
        setPlayerInfo({
          username: currentUsername,
          status: status === 'Active' ? 'Online' : status,
          vip: false, // Not tracked in our schema yet
          level: 0,    // Not tracked in our schema yet
          uuid: player.minecraftUuid,
          firstJoined,
          lastOnline: 'Recent', // This data isn't available in our current schema
          playtime: 'Not tracked', // This data isn't available in our current schema 
          ip: lastIP,
          previousNames,
          warnings
        });
      }
    }
  }, [player, isOpen]);

  if (isLoading) {
    return (
      <ResizableWindow
        id="player-lookup"
        title="Loading Player Info..."
        isOpen={isOpen}
        onClose={onClose}
        initialSize={{ width: 650, height: 550 }}
      >
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ResizableWindow>
    );
  }

  if (error || !player) {
    return (
      <ResizableWindow
        id="player-lookup"
        title="Player Not Found"
        isOpen={isOpen}
        onClose={onClose}
        initialSize={{ width: 650, height: 550 }}
      >
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-destructive">Could not find player data.</p>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </div>
      </ResizableWindow>
    );
  }

  return (
    <ResizableWindow
      id="player-lookup"
      title={`Player Info: ${playerInfo.username}`}
      isOpen={isOpen}
      onClose={onClose}
      initialSize={{ width: 650, height: 550 }}
    >
      <div className="space-y-4">
        <div className="pt-2">
          <div className="bg-background-lighter p-4 rounded-lg">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">{playerInfo.username?.substring(0, 2) || '??'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h5 className="text-lg font-medium">{playerInfo.username || 'Unknown'}</h5>
                <div className="flex flex-wrap gap-2 mt-1">
                  <Badge 
                    variant="outline" 
                    className={`
                      ${playerInfo.status === 'Online' ? 'bg-success/10 text-success border-success/20' : 
                        playerInfo.status === 'Restricted' ? 'bg-warning/10 text-warning border-warning/20' : 
                        'bg-destructive/10 text-destructive border-destructive/20'
                      }
                    `}
                  >
                    {playerInfo.status}
                  </Badge>
                  {playerInfo.vip && (
                    <Badge variant="outline" className="bg-info/10 text-info border-info/20">
                      VIP
                    </Badge>
                  )}
                  {playerInfo.level && (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      Level {playerInfo.level}
                    </Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">UUID:</span>
                    <span className="ml-1">{playerInfo.uuid}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">First Joined:</span>
                    <span className="ml-1">{playerInfo.firstJoined}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Online:</span>
                    <span className="ml-1">{playerInfo.lastOnline}</span>
                  </div>
                  {playerInfo.playtime && (
                    <div>
                      <span className="text-muted-foreground">Playtime:</span>
                      <span className="ml-1">{playerInfo.playtime}</span>
                    </div>
                  )}
                  {playerInfo.ip && (
                    <div>
                      <span className="text-muted-foreground">IP (masked):</span>
                      <span className="ml-1">{playerInfo.ip}</span>
                    </div>
                  )}
                  {playerInfo.previousNames && (
                    <div>
                      <span className="text-muted-foreground">Previous Names:</span>
                      <span className="ml-1">{playerInfo.previousNames}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <h4 className="font-medium">Moderation History</h4>
          {playerInfo.warnings.length > 0 ? (
            playerInfo.warnings.map((warning, index) => (
              <div 
                key={index} 
                className={`
                  ${warning.type === 'Warning' ? 'bg-warning/10 border-warning' : 
                   warning.type === 'Mute' ? 'bg-info/10 border-info' :
                   'bg-destructive/10 border-destructive'} 
                  border-l-4 p-3 rounded-r-lg
                `}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <Badge 
                      variant="outline" 
                      className={`
                        ${warning.type === 'Warning' ? 'bg-warning/10 text-warning border-warning/20' : 
                         warning.type === 'Mute' ? 'bg-info/10 text-info border-info/20' :
                         'bg-destructive/10 text-destructive border-destructive/20'}
                      `}
                    >
                      {warning.type}
                    </Badge>
                    <p className="text-sm mt-1">{warning.reason}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{warning.date}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">By: {warning.by}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No moderation history found for this player.</p>
          )}
        </div>
        
        <div className="pt-4 flex justify-end space-x-2">
          <Button variant="destructive" size="sm">
            <Ban className="h-4 w-4 mr-1" /> Ban Player
          </Button>
          <Button variant="default" size="sm" className="bg-warning text-white hover:bg-warning/90">
            <TriangleAlert className="h-4 w-4 mr-1" /> Warn
          </Button>
          <Button variant="default" size="sm" className="bg-info text-white hover:bg-info/90">
            <RefreshCcw className="h-4 w-4 mr-1" /> Mute
          </Button>
        </div>
      </div>
    </ResizableWindow>
  );
};

const Lookup = () => {
  const [searchParams] = useLocation();
  const queryParams = new URLSearchParams(searchParams);
  const playerId = queryParams.get('id') || undefined;
  
  const [isPlayerWindowOpen, setIsPlayerWindowOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentLookups, setRecentLookups] = useState<any[]>([]);
  const { toast } = useToast();
  
  // More generous left margin to prevent text overlap with sidebar
  const mainContentClass = "ml-[32px] pl-8";
  
  const [isSearching, setIsSearching] = useState(false);

  // Load recent lookups from localStorage on component mount
  useEffect(() => {
    const savedLookups = localStorage.getItem('recentPlayerLookups');
    if (savedLookups) {
      try {
        const parsed = JSON.parse(savedLookups);
        if (Array.isArray(parsed)) {
          setRecentLookups(parsed.slice(0, 5)); // Keep only the most recent 5
        }
      } catch (e) {
        console.error('Failed to parse recent lookups:', e);
      }
    }
  }, []);

  // Function to add a player to recent lookups
  const addToRecentLookups = (playerData: any) => {
    const lookupEntry = {
      username: playerData.username,
      uuid: playerData.uuid,
      status: playerData.status || 'Unknown',
      timestamp: new Date().toISOString()
    };

    setRecentLookups(prev => {
      // Remove if already exists to avoid duplicates
      const filtered = prev.filter(lookup => lookup.uuid !== playerData.uuid);
      // Add to beginning and keep only 5 most recent
      const newLookups = [lookupEntry, ...filtered].slice(0, 5);
      
      // Save to localStorage
      localStorage.setItem('recentPlayerLookups', JSON.stringify(newLookups));
      
      return newLookups;
    });
  };

  // Function to handle player search
  const handlePlayerSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearching(true);
      try {
        // Fetch the player data to get their UUID
        // Searching for player
        const response = await fetch(`/api/player/${searchQuery}`);
        if (response.ok) {
          const playerData = await response.json();
          // Search response received
          if (playerData && playerData.uuid) {
            // Add to recent lookups before redirecting
            addToRecentLookups(playerData);
            // Redirect to the player lookup window with the UUID
            // Player found
            window.location.href = `/lookup?id=${playerData.uuid}`;
          } else {
            toast({
              title: "Error",
              description: "Invalid player data returned. Please try a different username.",
              variant: "destructive",
            });
          }
        } else {
          // Try to parse error message
          try {
            const errorData = await response.json();
            toast({
              title: "Player Not Found",
              description: errorData.message || 'Player not found. Please check the username and try again.',
              variant: "destructive",
            });
          } catch (e) {
            toast({
              title: "Search Error",
              description: `Error searching for player: ${response.statusText}`,
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        toast({
          title: "Search Error",
          description: "An error occurred during search. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSearching(false);
      }
    }
  };

  // Open the player window if an ID is provided in URL
  useEffect(() => {
    if (playerId) {
      setIsPlayerWindowOpen(true);
    }
  }, [playerId]);

  // Add player to recent lookups when viewing via URL
  const { data: currentPlayer } = usePlayer(playerId || '');
  useEffect(() => {
    if (currentPlayer && playerId) {
      // Only add if we have the player data and it's not already the most recent
      if (recentLookups.length === 0 || recentLookups[0]?.uuid !== currentPlayer.uuid) {
        addToRecentLookups(currentPlayer);
      }
    }
  }, [currentPlayer, playerId]);

  return (
    <section className={`min-h-screen p-6 md:p-8 transition-all duration-300 ${mainContentClass}`}>
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Player Lookup</h2>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-md font-medium">Search Player</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePlayerSearch} className="flex gap-2">
              <Input 
                type="text"
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={!searchQuery.trim() || isSearching}>
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" /> Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-1" /> Search
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-md font-medium">Recent Lookups</CardTitle>
              {recentLookups.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRecentLookups([]);
                    localStorage.removeItem('recentPlayerLookups');
                  }}
                  className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  Clear All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {recentLookups.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                No recent lookups. Search for a player to see them here.
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="rounded-l-lg">Player</TableHead>
                    <TableHead>UUID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="rounded-r-lg">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLookups.map((lookup: any, index: number) => (
                    <TableRow key={index} className="border-b border-border">
                      <TableCell className="font-medium">{lookup.username || 'Unknown'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{lookup.uuid}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`
                            ${lookup.status === 'Active' ? 'bg-success/10 text-success border-success/20' : 
                              lookup.status === 'Warned' ? 'bg-warning/10 text-warning border-warning/20' : 
                              'bg-destructive/10 text-destructive border-destructive/20'
                            }
                          `}
                        >
                          {lookup.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary" 
                            title="View Details"
                            onClick={() => {
                              // Add to recent lookups again to update timestamp
                              addToRecentLookups(lookup);
                              window.location.href = `/lookup?id=${lookup.uuid}`;
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <PlayerLookupWindow 
        playerId={playerId}
        isOpen={isPlayerWindowOpen} 
        onClose={() => {
          setIsPlayerWindowOpen(false);
          // Reset the URL to remove the ID parameter when window is closed
          window.history.pushState({}, '', '/lookup');
        }} 
      />
    </section>
  );
};

export default Lookup;