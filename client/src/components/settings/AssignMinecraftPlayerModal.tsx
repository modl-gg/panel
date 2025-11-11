import React, { useState, useMemo } from 'react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@modl-gg/shared-web/components/ui/dialog';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { useToast } from '@modl-gg/shared-web/hooks/use-toast';
import { usePlayerSearch, useAssignMinecraftPlayer, useStaff } from '@/hooks/use-data';
import { Loader2, User, X, Search } from 'lucide-react';

interface StaffMember {
  _id: string;
  email: string;
  username: string;
  role: string;
  assignedMinecraftUuid?: string;
  assignedMinecraftUsername?: string;
}

interface AssignMinecraftPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffMember: StaffMember | null;
}

const AssignMinecraftPlayerModal: React.FC<AssignMinecraftPlayerModalProps> = ({
  isOpen,
  onClose,
  staffMember
}) => {
  const [selectedPlayerUuid, setSelectedPlayerUuid] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { toast } = useToast();
  
  const { data: staff } = useStaff();
  const { data: searchResults, isLoading: playersLoading } = usePlayerSearch(searchQuery);
  const assignPlayerMutation = useAssignMinecraftPlayer();

  // Get assigned UUIDs from staff members to filter them out
  const assignedUuids = useMemo(() => {
    if (!staff) return [];
    return staff
      .filter((member: any) => member.assignedMinecraftUuid)
      .map((member: any) => member.assignedMinecraftUuid);
  }, [staff]);

  // Filter out already assigned players from search results
  const availablePlayers = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.filter((player: any) => {
      const playerUuid = player.uuid || player.minecraftUuid;
      return !assignedUuids.includes(playerUuid);
    });
  }, [searchResults, assignedUuids]);

  const handleAssign = async () => {
    if (!staffMember) return;

    if (!selectedPlayerUuid) {
      toast({
        title: 'No Player Selected',
        description: 'Please select a Minecraft player to assign.',
        variant: 'destructive'
      });
      return;
    }

    const selectedPlayer = availablePlayers.find((p: any) => {
      const playerUuid = p.uuid || p.minecraftUuid;
      return playerUuid === selectedPlayerUuid;
    });
    if (!selectedPlayer) return;

    try {
      await assignPlayerMutation.mutateAsync({
        username: staffMember.username,
        minecraftUuid: selectedPlayer.uuid || selectedPlayer.minecraftUuid,
        minecraftUsername: selectedPlayer.username
      });

      toast({
        title: 'Player Assigned',
        description: `${selectedPlayer.username} has been assigned to ${staffMember.username}.`
      });

      onClose();
      setSelectedPlayerUuid('');
    } catch (error) {
      toast({
        title: 'Assignment Failed',
        description: error instanceof Error ? error.message : 'Failed to assign player',
        variant: 'destructive'
      });
    }
  };

  const handleClearAssignment = async () => {
    if (!staffMember) return;

    try {
      await assignPlayerMutation.mutateAsync({
        username: staffMember.username,
        minecraftUuid: undefined,
        minecraftUsername: undefined
      });

      toast({
        title: 'Assignment Cleared',
        description: `Minecraft player assignment cleared for ${staffMember.username}.`
      });

      onClose();
    } catch (error) {
      toast({
        title: 'Clear Failed',
        description: error instanceof Error ? error.message : 'Failed to clear assignment',
        variant: 'destructive'
      });
    }
  };

  const handleClose = () => {
    setSelectedPlayerUuid('');
    setSearchQuery('');
    onClose();
  };

  if (!staffMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Minecraft Player</DialogTitle>
          <DialogDescription>
            Assign a Minecraft player to <strong>{staffMember.email}</strong> ({staffMember.role})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Current Assignment */}
          {staffMember.assignedMinecraftUuid && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span className="text-sm font-medium">Currently Assigned:</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAssignment}
                  disabled={assignPlayerMutation.isPending}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="mt-1">
                <Badge variant="secondary">
                  {staffMember.assignedMinecraftUsername}
                </Badge>
              </div>
            </div>
          )}

          {/* Player Search */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Search and Select Minecraft Player</label>
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username or UUID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {/* Results */}
            {!searchQuery || searchQuery.trim().length < 2 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Start typing to search for players</p>
                <p className="text-xs mt-1">Search by username or UUID (minimum 2 characters)</p>
              </div>
            ) : playersLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Searching players...</span>
              </div>
            ) : availablePlayers.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {searchResults && searchResults.length > 0 ? (
                  <>All matching players are already assigned to staff members.</>
                ) : (
                  <>No players found matching "{searchQuery}"</>
                )}
              </div>
            ) : (
              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <div className="p-2">
                  <div className="px-2 py-1 text-xs text-muted-foreground mb-2">
                    Found {availablePlayers.length} available player{availablePlayers.length !== 1 ? 's' : ''}
                  </div>
                  {availablePlayers.map((player: any) => {
                    const playerUuid = player.uuid || player.minecraftUuid;
                    return (
                      <Button
                        key={playerUuid}
                        variant={selectedPlayerUuid === playerUuid ? "secondary" : "ghost"}
                        className="w-full justify-start text-left h-auto py-3 px-3 mb-1"
                        onClick={() => setSelectedPlayerUuid(playerUuid)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-md flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-white" />
                          </div>
                          <div className="flex flex-col items-start min-w-0 flex-1">
                            <span className="font-medium text-sm truncate w-full">{player.username || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground truncate w-full">{playerUuid}</span>
                          </div>
                          {selectedPlayerUuid === playerUuid && (
                            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Only Minecraft players that are not currently assigned to other staff members are shown.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={assignPlayerMutation.isPending}>
            Cancel
          </Button>
          <Button 
            onClick={handleAssign} 
            disabled={!selectedPlayerUuid || assignPlayerMutation.isPending}
          >
            {assignPlayerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Assigning...
              </>
            ) : (
              'Assign Player'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignMinecraftPlayerModal;