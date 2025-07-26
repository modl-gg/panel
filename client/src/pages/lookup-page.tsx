import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Search, ChevronRight, X, Loader2 } from 'lucide-react';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { usePlayers } from '@/hooks/use-data';

interface Player {
  username?: string;
  uuid: string;
  minecraftUuid?: string;
  lastOnline?: string;
  lastLogin?: Date | string;
  lastSeen?: Date | string;
  lastDisconnect?: Date | string;
  status: string;
  data?: any;
  isOnline?: boolean;
}

const LookupPage = () => {
  const [location, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Use Query for fetching players
  const { data: players, isLoading, refetch } = usePlayers();
  
  // Get recent searches from localStorage sorted by timestamp
  const [recentSearches, setRecentSearches] = useState<Array<{player: Player, timestamp: number}>>([]);

  // Fetch players on initial load
  useEffect(() => {
    if (!players && !isLoading) {
      refetch();
    }
    
    // Load recent searches from local storage
    const savedSearches = localStorage.getItem('recentPlayerSearches');
    if (savedSearches) {
      try {
        const parsed = JSON.parse(savedSearches);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed);
        }
      } catch (e) {
        console.error('Failed to parse recent searches:', e);
      }
    }
  }, [players, isLoading, refetch]);

  // Filter players based on search query
  const filteredPlayers = players 
    ? players.filter((player: Player) => 
        player.username?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Get player UUID (handling both uuid and minecraftUuid fields)
  const getPlayerUuid = (player: Player) => {
    return player.minecraftUuid || player.uuid;
  };
  
  // Check if player is online
  const isPlayerOnline = (player: Player) => {
    if (player.isOnline !== undefined) return player.isOnline;
    if (player.data?.isOnline !== undefined) return player.data.isOnline;
    return player.status === 'Online';
  };
  
  // Handle player selection
  const handlePlayerSelect = (player: Player) => {
    const uuid = getPlayerUuid(player);
    
    // Update recent searches
    const timestamp = Date.now();
    const existing = recentSearches.filter(s => getPlayerUuid(s.player) !== uuid);
    const newSearches = [{player, timestamp}, ...existing].slice(0, 10);
    setRecentSearches(newSearches);
    
    // Save to local storage
    localStorage.setItem('recentPlayerSearches', JSON.stringify(newSearches));
    
    // Navigate to player detail page
    navigate(`/panel/player/${uuid}`);
  };

  // Handle clearing search
  const handleClearSearch = () => {
    setSearchQuery('');
  };

  return (
    <div className="transition-all duration-300 bg-background/50 border rounded-xl shadow-sm md:p-8 md:my-8 md:mx-8 p-4 my-0 mx-0 mb-20">
      <h1 className="text-2xl font-bold mb-6">Player Lookup</h1>
      
      <div className="relative mb-6">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
        
        <Input
          type="text"
          placeholder="Search by username..."
          className="pl-10 pr-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
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
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Search Results</h2>
          
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player: Player) => (
              <div 
                key={getPlayerUuid(player)}
                className="flex items-center justify-between p-4 bg-background border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => handlePlayerSelect(player)}
              >
                <div className="flex items-center">
                  <div className="relative h-10 w-10 bg-muted rounded-lg flex items-center justify-center overflow-hidden mr-3">
                    <img 
                      src={`/api/panel/players/avatar/${getPlayerUuid(player)}?size=40&overlay=true`}
                      alt={`${player.username || 'Player'} Avatar`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <span className="hidden text-sm font-bold text-primary">
                      {player.username?.substring(0, 2).toUpperCase() || '??'}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-sm">{player.username || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isPlayerOnline(player) ? 'Online' : 'Offline'}
                    </p>
                  </div>
                </div>
                
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
          {recentSearches.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground mb-4">Recent Lookups</h2>
              
              {recentSearches
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 5)
                .map(({player}) => (
                <div 
                  key={getPlayerUuid(player)}
                  className="flex items-center justify-between p-4 bg-background border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handlePlayerSelect(player)}
                >
                  <div className="flex items-center">
                    <div className="relative h-10 w-10 bg-muted rounded-lg flex items-center justify-center overflow-hidden mr-3">
                      <img 
                        src={`/api/panel/players/avatar/${getPlayerUuid(player)}?size=40&overlay=true`}
                        alt={`${player.username || 'Player'} Avatar`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <span className="hidden text-sm font-bold text-primary">
                        {player.username?.substring(0, 2).toUpperCase() || '??'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{player.username || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {isPlayerOnline(player) ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </div>
                  
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LookupPage;