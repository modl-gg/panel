import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Search, ChevronRight, X, Loader2 } from 'lucide-react';
import { Input } from 'modl-shared-web/components/ui/input';
import { Button } from 'modl-shared-web/components/ui/button';
import { Avatar } from 'modl-shared-web/components/ui/avatar';
import { Badge } from 'modl-shared-web/components/ui/badge';
import { Separator } from 'modl-shared-web/components/ui/separator';
import { usePlayers } from '@/hooks/use-data';

interface Player {
  username?: string;
  uuid: string;
  lastOnline: string;
  status: 'Active' | 'Warned' | 'Banned';
}

const LookupPage = () => {
  const [location, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Use Query for fetching players
  const { data: players, isLoading, refetch } = usePlayers();

  // Fetch players on initial load
  useEffect(() => {
    if (!players && !isLoading) {
      refetch();
    }
    
    // Load search history from local storage
    const savedHistory = localStorage.getItem('searchHistory');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSearchHistory(parsed.slice(0, 5)); // Keep only the most recent 5
        }
      } catch (e) {
        console.error('Failed to parse search history:', e);
      }
    }
  }, [players, isLoading, refetch]);

  // Filter players based on search query
  const filteredPlayers = players 
    ? players.filter((player: Player) => 
        player.username?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Handle player selection
  const handlePlayerSelect = (player: Player) => {
    // Add to search history if not already there
    const historyExists = searchHistory.some(p => p.uuid === player.uuid);
    if (!historyExists) {
      const newHistory = [player, ...searchHistory].slice(0, 5);
      setSearchHistory(newHistory);
      
      // Save to local storage
      localStorage.setItem('searchHistory', JSON.stringify(newHistory));
    }
    
    // Navigate to player detail page
    navigate(`/player/${player.uuid}`);
  };

  // Handle clearing search
  const handleClearSearch = () => {
    setSearchQuery('');
  };

  return (
    <div className="w-full px-4 py-4">
      <h1 className="text-2xl font-bold mb-4">Player Lookup</h1>
      
      <div className="flex items-center relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
        
        <Input
          type="text"
          placeholder="Search by username..."
          className="pl-10 pr-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        {searchQuery && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-5 w-5 p-0" 
              onClick={handleClearSearch}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : searchQuery ? (
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Search Results</h2>
          
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player: Player) => (
              <div 
                key={player.uuid}
                className="flex items-center justify-between p-3 bg-card rounded-lg hover:bg-card/80 cursor-pointer"
                onClick={() => handlePlayerSelect(player)}
              >
                <div className="flex items-center">
                  <Avatar className="mr-3 h-9 w-9">
                    <div className="bg-primary/10 flex items-center justify-center h-full rounded-full">
                      <span className="text-sm font-medium text-primary">
                        {player.username?.substring(0, 2) || '??'}
                      </span>
                    </div>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{player.username || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">Last seen: {player.lastOnline}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <StatusBadge status={player.status} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6">
              <p className="text-muted-foreground">No players found</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {searchHistory.length > 0 && (
            <div className="space-y-1 mb-6">
              <h2 className="text-sm font-medium text-muted-foreground mb-2">Recent Lookups</h2>
              
              {searchHistory.map((player) => (
                <div 
                  key={player.uuid}
                  className="flex items-center justify-between p-3 bg-card rounded-lg hover:bg-card/80 cursor-pointer"
                  onClick={() => handlePlayerSelect(player)}
                >
                  <div className="flex items-center">
                    <Avatar className="mr-3 h-9 w-9">
                      <div className="bg-primary/10 flex items-center justify-center h-full rounded-full">
                        <span className="text-sm font-medium text-primary">
                          {player.username?.substring(0, 2) || '??'}
                        </span>
                      </div>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{player.username || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">Last seen: {player.lastOnline}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <StatusBadge status={player.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">All Players</h2>
            {players && players.length > 0 ? (
              players.slice(0, 15).map((player: Player) => (
                <div 
                  key={player.uuid}
                  className="flex items-center justify-between p-3 bg-card rounded-lg hover:bg-card/80 cursor-pointer"
                  onClick={() => handlePlayerSelect(player)}
                >
                  <div className="flex items-center">
                    <Avatar className="mr-3 h-9 w-9">
                      <div className="bg-primary/10 flex items-center justify-center h-full rounded-full">
                        <span className="text-sm font-medium text-primary">
                          {player.username?.substring(0, 2) || '??'}
                        </span>
                      </div>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm">{player.username || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">Last seen: {player.lastOnline}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <StatusBadge status={player.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground">No players found</p>
              </div>
            )}
            
            {players && players.length > 15 && (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground">Showing 15 of {players.length} players. Use search to find more.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper component for rendering status badges
const StatusBadge = ({ status }: { status: 'Active' | 'Warned' | 'Banned' }) => {
  switch (status) {
    case 'Active':
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/20">
          Active
        </Badge>
      );
    case 'Warned':
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
          Warned
        </Badge>
      );
    case 'Banned':
      return (
        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
          Banned
        </Badge>
      );
    default:
      return null;
  }
};

export default LookupPage;