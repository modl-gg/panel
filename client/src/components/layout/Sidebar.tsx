import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { useState, useEffect, useRef } from "react";
import {
  Home,
  Search,
  Ticket,
  FileText,
  Settings,
  Loader2,
  BookOpen,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "modl-shared-web/components/ui/tooltip";
import { Button } from "modl-shared-web/components/ui/button";
import { Input } from "modl-shared-web/components/ui/input";
import { usePlayers, useBillingStatus } from "@/hooks/use-data";
import { useDashboard } from "@/contexts/DashboardContext";
import PlayerWindow from "../../components/windows/PlayerWindow";
import serverLogo from "../../assets/server-logo.png";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { usePunishmentLookup } from "@/hooks/use-player-lookup";
import { usePermissions, PERMISSIONS } from "@/hooks/use-permissions";

const Sidebar = () => {
  const { isSearchActive, setIsSearchActive } = useSidebar();
  const { openLookupWindow: openDashboardLookupWindow } = useDashboard();
  const [location, navigate] = useLocation();
  const { data: billingStatus } = useBillingStatus();
  const { data: publicSettings } = usePublicSettings();
  const { hasPermission } = usePermissions();
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [isLookupClosing, setIsLookupClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isHoveringSearch, setIsHoveringSearch] = useState(false);
  
  // Detect if search query starts with # for punishment lookup
  const isPunishmentLookup = searchQuery.trim().startsWith('#');
  const punishmentQuery = isPunishmentLookup ? searchQuery.trim().substring(1) : '';
  const debouncedPunishmentQuery = isPunishmentLookup && punishmentQuery.length > 0 ? punishmentQuery : "";
  
  // Lookup punishment if the query looks like a punishment ID
  const { 
    data: punishmentLookupResult, 
    isLoading: isPunishmentLoading, 
    error: punishmentError 
  } = usePunishmentLookup(debouncedPunishmentQuery);
  // Track multiple windows with a map of id -> isOpen state
  const [playerWindows, setPlayerWindows] = useState<Record<string, boolean>>(
    {},
  );
  const closeTimeoutRef = useRef<number | null>(null);

  // Function to open player window when clicked from search
  const openPlayerWindow = (playerId: string) => {
    // Add this window to our tracked windows
    setPlayerWindows((prev) => ({
      ...prev,
      [playerId]: true, // Set this player's window to open
    }));
    openDashboardLookupWindow(); // Also open at dashboard level for tracking
  };

  // Function to close a specific player window
  const closePlayerWindow = (playerId: string) => {
    setPlayerWindows((prev) => {
      // Create a new object excluding this player
      const newWindows = { ...prev };
      delete newWindows[playerId];
      return newWindows;
    });
  };

  const openLookup = () => {
    if (!isLookupOpen && !isLookupClosing) {
      setIsLookupOpen(true);
      setIsLookupClosing(false);
    }
  };

  const closeLookup = () => {
    // Don't attempt to close if not open
    if (!isLookupOpen) return;

    // If already hovering over search area, don't try to close
    if (isHoveringSearch) return;

    // Clear any existing timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    // Set a 300ms delay before closing - allows user to move mouse to search panel
    closeTimeoutRef.current = window.setTimeout(() => {
      // IMPORTANT: Check again if user is hovering over search during delay
      if (isHoveringSearch) {
        closeTimeoutRef.current = null;
        return;
      }

      // Start the close animation
      setIsLookupClosing(true);

      // Actually close the panel after animation completes
      setTimeout(() => {
        if (!isHoveringSearch) {
          // Final check before closing
          setIsLookupOpen(false);
          setIsLookupClosing(false);
          setSearchQuery("");
          setIsFocused(false);
        } else {
          // If user somehow got back to the panel, cancel closing
          setIsLookupClosing(false);
        }
      }, 100);

      closeTimeoutRef.current = null;
    }, 300);
  };

  // Update search active state when search query changes
  useEffect(() => {
    setIsSearchActive(searchQuery.length > 0);
  }, [searchQuery, setIsSearchActive]);

  // Check URL parameters on initial load to open player window if needed
  useEffect(() => {
    const url = new URL(window.location.href);
    const playerIdFromUrl = url.searchParams.get("player");

    if (playerIdFromUrl) {
      // Open this player's window
      setPlayerWindows((prev) => ({
        ...prev,
        [playerIdFromUrl]: true,
      }));
      openDashboardLookupWindow();
    }
  }, [openDashboardLookupWindow]);

  // Clean up any timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Define nav items
  const allNavItems = [
    {
      name: "Home",
      path: "/panel",
      icon: <Home className="h-5 w-5" />,
      onClick: () => {
        if (isLookupOpen) closeLookup();
        navigate("/panel");
      },
    },
    {
      name: "Lookup",
      path: "/panel/lookup", // This path is for active state, click handled separately
      icon: <Search className="h-5 w-5" />,
      onClick: () => {
        if (isLookupOpen) {
          closeLookup();
        } else {
          openLookup();
          // Do not navigate here, lookup is an overlay
        }
      },
    },
    {
      name: "Tickets",
      path: "/panel/tickets",
      icon: <Ticket className="h-5 w-5" />,
      onClick: () => {
        if (isLookupOpen) closeLookup();
        navigate("/panel/tickets");
      },
    },
    {
      name: "Audit",
      path: "/panel/audit",
      icon: <FileText className="h-5 w-5" />,
      onClick: () => {
        if (isLookupOpen) closeLookup();
        navigate("/panel/audit");
      },
    },
    {
      name: "Settings",
      path: "/panel/settings",
      icon: <Settings className="h-5 w-5" />,
      onClick: () => {
        if (isLookupOpen) closeLookup();
        navigate("/panel/settings");
      },
    },
  ];

  // Filter nav items based on permissions
  const navItems = allNavItems.filter(item => 
    !item.permission || hasPermission(item.permission)
  );

  // Fetch players from API using React Query
  const { data: players, isLoading } = usePlayers();

  // Define player type to avoid 'implicitly has an any type' errors
  interface Player {
    uuid: string;
    username?: string;
    status: string;
    lastOnline?: string;
  }

  // Filter lookup results
  const filteredLookups =
    searchQuery && players
      ? players.filter(
          (player: Player) =>
            player.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            player.uuid?.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : players || [];

  return (
    <div className="fixed ml-4 top-1/4 left-4 z-40">
      {/* Server Logo */}
      <div className="bg-sidebar/90 p-2 rounded-2xl shadow-lg w-16 mb-3 transition-all duration-200 hover:shadow-xl hover:bg-sidebar/95" 
        style={{ backdropFilter: "blur(12px)" }}>
        <img 
          src={publicSettings?.panelIconUrl || serverLogo} 
          alt={publicSettings?.serverDisplayName || "Server Logo"} 
          className="w-12 h-12 object-contain rounded-xl"
        />
      </div>
      
      <div className="flex">
        {/* Fixed-width sidebar navigation (always visible) */}
        <aside
          className="bg-sidebar/90 h-auto min-h-[300px] rounded-2xl w-16 overflow-hidden"
          style={{ backdropFilter: "blur(12px)" }}
          onClick={(e) => {
            // Close search if clicked anywhere except the lookup button
            if (
              isLookupOpen &&
              !(e.target as HTMLElement).closest('button[data-lookup="true"]')
            ) {
              closeLookup();
            }
          }}
        >
          <div className="w-16 p-2 pt-4">
            <nav className="flex-1">
              <ul className="space-y-4">
                {navItems.map((item, index) => {
                  const isActive =
                    location === item.path || // Exact match for current page
                    (item.path === "/panel/lookup" && isLookupOpen) || // Lookup is active
                    (item.path === "/panel" && location.startsWith("/panel/player/")); // Home active if on player detail from panel                  // Special handling for lookup icon
                  if (item.path === "/panel/lookup") {
                    return (
                      <li key={item.path} className="relative">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isActive ? "secondary" : "ghost"}
                              size="icon"
                              className={cn(
                                "w-full h-10",
                                isActive &&
                                  "bg-sidebar-primary/10 text-sidebar-primary hover:bg-sidebar-primary/20",
                              )}
                              onClick={() =>
                                isLookupOpen ? closeLookup() : openLookup()
                              }
                              onMouseEnter={() => {
                                // Clear any pending close operation when mouse enters icon
                                if (closeTimeoutRef.current) {
                                  clearTimeout(closeTimeoutRef.current);
                                  closeTimeoutRef.current = null;
                                }
                                openLookup();
                              }}
                              onMouseOver={() => {
                                // Also handle onMouseOver to ensure consistent behavior
                                if (closeTimeoutRef.current) {
                                  clearTimeout(closeTimeoutRef.current);
                                  closeTimeoutRef.current = null;
                                }
                                openLookup();
                              }}
                              onMouseLeave={closeLookup}
                              data-lookup="true"
                            >
                              <div className="relative">
                                <Search className="h-5 w-5" />
                              </div>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">Lookup</TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  }

                  // Regular menu items
                  return (
                    <li key={item.path}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isActive ? "secondary" : "ghost"}
                            size="icon"
                            className={cn(
                              "w-full h-10",
                              isActive &&
                                "bg-sidebar-primary/10 text-sidebar-primary hover:bg-sidebar-primary/20",
                            )}
                            onClick={item.onClick}
                          >
                            <div className="relative">
                              {item.icon}
                            </div>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {item.name}
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </aside>

        {/* Expandable search area */}
        {isLookupOpen && (
          <div
            className={`bg-sidebar/90 h-[300px] ml-2 rounded-xl overflow-hidden ${isLookupClosing ? "animate-slide-left" : "animate-slide-right"}`}
            style={{ backdropFilter: "blur(12px)" }}
            onMouseEnter={() => {
              // Immediately cancel any pending close operations
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
              setIsLookupClosing(false);
              setIsHoveringSearch(true);
            }}
            onMouseLeave={() => {
              // First, update the hovering state
              setIsHoveringSearch(false);

              // Force start the closing animation directly without delay
              // This is needed when moving away from the search panel
              setIsLookupClosing(true);

              // And close the panel after animation completes
              setTimeout(() => {
                setIsLookupOpen(false);
                setIsLookupClosing(false);
                setSearchQuery("");
                setIsFocused(false);
              }, 100);
            }}
          >
            <div className="p-3 pt-4 w-[240px] h-full flex flex-col">
              <Input
                placeholder="Search players..."
                className="w-full h-9 bg-background/90 border border-sidebar-border rounded-md text-sm px-3 mb-2"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                autoFocus
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
              <div className="text-xs text-muted-foreground mb-3 px-1">
                Use <span className="font-mono bg-muted px-1 rounded">#</span> to search punishment IDs
              </div>

              {(isLoading || isPunishmentLoading) ? (
                <div className="py-8 flex justify-center items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchQuery ? (
                <div className="flex-1 overflow-y-auto pr-1">
                  {/* Show punishment lookup result first if using # prefix */}
                  {isPunishmentLookup && punishmentLookupResult && (() => {
                    console.log('Rendering punishment lookup result:', punishmentLookupResult);
                    return (
                    <div className="mb-3">
                      <div className="py-1 px-2 mb-2 text-xs text-muted-foreground">
                        Punishment Found
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full justify-start text-xs py-3 px-3 h-auto mb-1 bg-primary/10 hover:bg-primary/20 border border-primary/20"
                        onClick={() => {
                          // Set URL parameter for player with punishment ID
                          const url = new URL(window.location.href);
                          url.searchParams.set("player", punishmentLookupResult.playerUuid);
                          url.searchParams.set("punishment", punishmentLookupResult.punishment.id);
                          window.history.pushState({}, "", url.toString());

                          // Open the player window
                          openPlayerWindow(punishmentLookupResult.playerUuid);
                          closeLookup();
                        }}
                      >
                        <div className="flex flex-col items-start w-full">
                          <span className="font-medium text-primary">
                            {punishmentLookupResult.playerUsername || punishmentLookupResult.playerUuid || 'Unknown Player'}
                          </span>
                          <span className="text-primary text-[10px] font-medium">
                            ID: {punishmentLookupResult.punishment.id}
                          </span>
                        </div>
                      </Button>
                    </div>
                    );
                  })()}
                  
                  {/* Show punishment not found message */}
                  {isPunishmentLookup && punishmentError && (
                    <div className="mb-3">
                      <div className="py-1 px-2 mb-2 text-xs text-muted-foreground">
                        Punishment Lookup
                      </div>
                      <div className="py-3 px-3 text-center text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded">
                        Punishment ID '{punishmentQuery}' not found
                      </div>
                    </div>
                  )}
                  
                  {/* Show player search results */}
                  {!isPunishmentLookup && filteredLookups.length > 0 && (
                    <div>
                      <div className="py-1 px-2 mb-2 text-xs text-muted-foreground">
                        Players Found
                      </div>
                      {filteredLookups.map((player: Player, index: number) => (
                        <Button
                          key={index}
                          variant="ghost"
                          className="w-full justify-start text-xs py-2 px-3 h-auto mb-1"
                          onClick={() => {
                            // Set the URL parameter without changing the page
                            const url = new URL(window.location.href);
                            url.searchParams.set("player", player.uuid);
                            window.history.pushState({}, "", url.toString());

                            // Open the player window
                            openPlayerWindow(player.uuid);
                            closeLookup();
                          }}
                        >
                          <div className="flex flex-col items-start">
                            <span className="font-medium">{player.username || 'Unknown'}</span>
                            <span className="text-muted-foreground text-[10px]">
                              {player.status}
                            </span>
                          </div>
                        </Button>
                      ))}
                    </div>
                  )}
                  
                  {/* Show punishment ID prompt when # is typed but no ID yet */}
                  {isPunishmentLookup && punishmentQuery.length === 0 && (
                    <div className="py-3 px-3 text-center text-xs text-muted-foreground bg-muted/10 border border-muted/20 rounded">
                      Enter a punishment ID after the # symbol
                    </div>
                  )}
                  
                  {/* Show no results message */}
                  {!isPunishmentLookup && filteredLookups.length === 0 && !punishmentLookupResult && (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      No players found matching '{searchQuery}'
                    </div>
                  )}
                </div>
              ) : players && players.length > 0 ? (
                <div className="flex-1 overflow-y-auto pr-1">
                  <div className="py-1 px-2 mb-2 text-xs text-muted-foreground">
                    Recent Players
                  </div>
                  {players
                    .sort((a: Player, b: Player) => {
                      // Sort by lastOnline, most recent first
                      const aTime = a.lastOnline ? new Date(a.lastOnline).getTime() : 0;
                      const bTime = b.lastOnline ? new Date(b.lastOnline).getTime() : 0;
                      return bTime - aTime;
                    })
                    .slice(0, 5)
                    .map((player: Player, index: number) => (
                    <Button
                      key={index}
                      variant="ghost"
                      className="w-full justify-start text-xs py-2 px-3 h-auto mb-1"
                      onClick={() => {
                        const url = new URL(window.location.href);
                        url.searchParams.set("player", player.uuid);
                        window.history.pushState({}, "", url.toString());
                        openPlayerWindow(player.uuid);
                        closeLookup();
                      }}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{player.username || 'Unknown'}</span>
                        <span className="text-muted-foreground text-[10px]">
                          {player.status}
                        </span>
                      </div>
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Render multiple player windows with offset positioning */}
        {Object.entries(playerWindows).map(([playerId, isOpen], index) => (
          <PlayerWindow
            key={playerId}
            playerId={playerId}
            isOpen={isOpen}
            initialPosition={{
              x: Math.max(100, window.innerWidth / 2 - 325) + index * 40,
              y: Math.max(100, window.innerHeight / 2 - 275) + index * 30,
            }}
            onClose={() => {
              // Close this specific window
              closePlayerWindow(playerId);

              // Update URL parameters - we keep other players in the URL
              const url = new URL(window.location.href);
              url.searchParams.delete("player");

              // If we have other windows open, add the first one to the URL
              const remainingPlayers = Object.keys(playerWindows).filter(
                (id) => id !== playerId,
              );
              if (remainingPlayers.length > 0) {
                url.searchParams.set("player", remainingPlayers[0]);
              }

              window.history.pushState({}, "", url.toString());
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default Sidebar;
