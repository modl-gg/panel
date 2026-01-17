import React, { useState } from 'react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Checkbox } from '@modl-gg/shared-web/components/ui/checkbox';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import MediaUpload from '@/components/MediaUpload';

export interface PlayerPunishmentData {
  selectedPunishmentCategory?: string;
  selectedSeverity?: 'Lenient' | 'Regular' | 'Aggravated';
  selectedOffenseLevel?: 'first' | 'medium' | 'habitual';
  duration?: {
    value: number;
    unit: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
  };
  isPermanent?: boolean;
  reason?: string;
  evidence?: string[];
  staffNotes?: string;
  altBlocking?: boolean;
  statWiping?: boolean;
  silentPunishment?: boolean;
  kickSameIP?: boolean;
  attachReports?: string[];
  banToLink?: string;
  banLinkedAccounts?: boolean;
}

interface PlayerPunishmentProps {
  playerId?: string;
  playerName?: string;
  playerStatus?: string; // For kick validation
  data: PlayerPunishmentData;
  onChange: (data: PlayerPunishmentData) => void;
  onApply: (data: PlayerPunishmentData) => Promise<void>;
  punishmentTypesByCategory?: {
    Administrative: any[];
    Social: any[];
    Gameplay: any[];
  };
  isLoading?: boolean;
  compact?: boolean;
}

// Constants
const ADMINISTRATIVE_PUNISHMENTS = ['Kick', 'Manual Mute', 'Manual Ban', 'Security Ban', 'Linked Ban', 'Blacklist'];
const SEVERITY_OPTIONS = ['Lenient', 'Regular', 'Aggravated'];
const OFFENSE_LEVELS = [
  { id: 'first', label: 'First Offense' },
  { id: 'medium', label: 'Medium' },
  { id: 'habitual', label: 'Habitual' }
];
const DURATION_UNITS = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' }
];

const DEFAULT_PUNISHMENT_TYPES = {
  Administrative: [
    { id: 0, name: 'Kick', category: 'Administrative', customizable: false, ordinal: 0 },
    { id: 1, name: 'Manual Mute', category: 'Administrative', customizable: false, ordinal: 1 },
    { id: 2, name: 'Manual Ban', category: 'Administrative', customizable: false, ordinal: 2 },
    { id: 3, name: 'Security Ban', category: 'Administrative', customizable: false, ordinal: 3 },
    { id: 4, name: 'Linked Ban', category: 'Administrative', customizable: false, ordinal: 4 },
    { id: 5, name: 'Blacklist', category: 'Administrative', customizable: false, ordinal: 5 }
  ],
  Social: [],
  Gameplay: []
};

const PlayerPunishment: React.FC<PlayerPunishmentProps> = ({
  playerId,
  playerName,
  playerStatus = 'Offline',
  data,
  onChange,
  onApply,
  punishmentTypesByCategory = DEFAULT_PUNISHMENT_TYPES,
  isLoading = false,
  compact = false
}) => {
  const { toast } = useToast();
  const [isApplying, setIsApplying] = useState(false);
  const [linkedBanSearch, setLinkedBanSearch] = useState('');
  const [linkedBanSearchResults, setLinkedBanSearchResults] = useState<any[]>([]);

  const updateData = (updates: Partial<PlayerPunishmentData>) => {
    onChange({ ...data, ...updates });
  };

  const getCurrentPunishmentType = () => {
    if (!data.selectedPunishmentCategory) return null;
    
    const allTypes = [
      ...punishmentTypesByCategory.Administrative,
      ...punishmentTypesByCategory.Social,
      ...punishmentTypesByCategory.Gameplay
    ];
    
    return allTypes.find(type => type.name === data.selectedPunishmentCategory);
  };

  const getPunishmentPreview = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return '';

    let preview = punishmentType.name;
    
    if (data.selectedSeverity && !punishmentType.singleSeverityPunishment) {
      preview += ` (${data.selectedSeverity})`;
    }
    
    if (data.selectedOffenseLevel && punishmentType.singleSeverityPunishment) {
      const levelMap = { first: 'First', medium: 'Medium', habitual: 'Habitual' };
      preview += ` (${levelMap[data.selectedOffenseLevel]} Offense)`;
    }
    
    // Determine the punishment action type and duration
    let actionType = '';
    let durationValue: number | undefined;
    let durationUnit: string | undefined;
    let isPermanentPunishment = false;
    
    // Handle administrative punishments
    if (punishmentType.name === 'Kick') {
      actionType = 'kick';
    } else if (punishmentType.name === 'Manual Mute') {
      actionType = 'mute';
      if (data.isPermanent) {
        isPermanentPunishment = true;
      } else if (data.duration) {
        durationValue = data.duration.value;
        durationUnit = data.duration.unit;
      }
    } else if (punishmentType.name === 'Manual Ban' || punishmentType.name === 'Security Ban' || punishmentType.name === 'Linked Ban') {
      actionType = 'ban';
      if (data.isPermanent) {
        isPermanentPunishment = true;
      } else if (data.duration) {
        durationValue = data.duration.value;
        durationUnit = data.duration.unit;
      }
    } else if (punishmentType.name === 'Blacklist') {
      actionType = 'blacklist';
      isPermanentPunishment = true;
    } else {
      // For configured punishment types, get duration from the configuration
      if (punishmentType.singleSeverityPunishment && punishmentType.singleSeverityDurations && data.selectedOffenseLevel) {
        const durationConfig = punishmentType.singleSeverityDurations[data.selectedOffenseLevel];
        if (durationConfig) {
          actionType = durationConfig.type?.includes('ban') ? 'ban' : 'mute';
          if (durationConfig.type?.includes('permanent')) {
            isPermanentPunishment = true;
          } else {
            durationValue = durationConfig.value;
            durationUnit = durationConfig.unit;
          }
        }
      } else if (punishmentType.durations && data.selectedSeverity) {
        const severityMap = { 'lenient': 'low', 'regular': 'regular', 'aggravated': 'severe' };
        const mappedSeverity = severityMap[data.selectedSeverity.toLowerCase() as keyof typeof severityMap] || 'regular';
        
        const offenseLevel = data.selectedOffenseLevel || 'first';
        const durationConfig = punishmentType.durations[mappedSeverity as keyof typeof punishmentType.durations]?.[offenseLevel];
        
        if (durationConfig) {
          actionType = durationConfig.type?.includes('ban') ? 'ban' : 'mute';
          if (durationConfig.type?.includes('permanent')) {
            isPermanentPunishment = true;
          } else {
            durationValue = durationConfig.value;
            durationUnit = durationConfig.unit;
          }
        }
      }
      
      // Default fallback
      if (!actionType) {
        actionType = 'ban';
      }
    }
    
    // Add duration and action type
    if (isPermanentPunishment) {
      preview += ` - Permanent ${actionType}`;
    } else if (durationValue && durationUnit) {
      preview += ` - ${durationValue} ${durationUnit} ${actionType}`;
    } else if (actionType === 'kick') {
      // Kicks don't have duration
      preview += ` - ${actionType}`;
    } else if (actionType) {
      preview += ` - ${actionType}`;
    }
    
    return preview;
  };

  const handleApplyPunishment = async () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return;

    setIsApplying(true);
    try {
      await onApply(data);
      
      // Reset form after successful application
      updateData({
        selectedPunishmentCategory: undefined,
        selectedSeverity: undefined,
        selectedOffenseLevel: undefined,
        reason: '',
        evidence: [],
        staffNotes: '',
        altBlocking: false,
        statWiping: false,
        silentPunishment: false,
        kickSameIP: false,
        attachReports: [],
        banToLink: '',
        banLinkedAccounts: false
      });
      
      toast({
        title: "Punishment Applied",
        description: `${punishmentType.name} has been applied successfully.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply punishment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleCategorySelect = (type: any) => {
    // Validate kick for offline players
    if (type.name === 'Kick' && playerStatus !== 'Online') {
      toast({
        title: "Cannot Kick",
        description: "Player must be online to kick.",
        variant: "destructive",
      });
      return;
    }

    const newData = {
      ...data,
      selectedPunishmentCategory: type.name,
      selectedSeverity: undefined,
      selectedOffenseLevel: undefined,
      altBlocking: false,
      statWiping: false
    };

    // For single-severity punishments (non-administrative), automatically set default offense level
    if (type.singleSeverityPunishment && !ADMINISTRATIVE_PUNISHMENTS.includes(type.name)) {
      newData.selectedOffenseLevel = 'first' as const;
    }

    updateData(newData);
  };

  // Function to search for active punishments by ID or player name
  const searchLinkedBan = async (query: string) => {
    if (!query.trim()) {
      setLinkedBanSearchResults([]);
      return;
    }

    try {
      const { getApiUrl, getCurrentDomain } = await import('@/lib/api');
      const response = await fetch(getApiUrl(`/v1/panel/punishments/search?q=${encodeURIComponent(query)}&activeOnly=true`), {
        credentials: 'include',
        headers: { 'X-Server-Domain': getCurrentDomain() }
      });
      const results = response.ok ? await response.json() : [];
      setLinkedBanSearchResults(results);
    } catch (error) {
      setLinkedBanSearchResults([]);
    }
  };

  const selectLinkedBan = (punishment: any) => {
    updateData({ banToLink: punishment.id });
    setLinkedBanSearch(`${punishment.id} - ${punishment.playerName}`);
    setLinkedBanSearchResults([]);
  };

  const renderCategoryGrid = (types: any[], title: string) => (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{title}</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {types.length > 0 ? types.map(type => (
          <Button 
            key={type.id}
            variant="outline" 
            size="sm" 
            className={`py-1 text-xs ${type.name === 'Kick' && playerStatus !== 'Online' ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => handleCategorySelect(type)}
            title={type.name === 'Kick' && playerStatus !== 'Online' ? 'Player must be online to kick' : ''}
          >
            {type.name}
          </Button>
        )) : (
          <div className="col-span-2 sm:col-span-3 md:col-span-4 lg:col-span-6 text-xs text-muted-foreground p-2 border border-dashed rounded">
            {isLoading ? `Loading ${title.toLowerCase()} punishment types...` : `No ${title.toLowerCase()} punishment types configured`}
          </div>
        )}
      </div>
    </div>
  );

  const renderSeveritySelection = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return null;
    
    if (ADMINISTRATIVE_PUNISHMENTS.includes(punishmentType.name)) return null;
    
    // Single severity punishments show offense level instead of severity
    if (punishmentType.singleSeverityPunishment) return null;
    
    // Special permanent punishments don't show severity selection
    if (punishmentType.permanentUntilSkinChange || punishmentType.permanentUntilUsernameChange) return null;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Severity</label>
        <div className="flex gap-2">
          {SEVERITY_OPTIONS.map((severity) => (
            <Button
              key={severity}
              variant={data.selectedSeverity === severity ? "default" : "outline"}
              size="sm"
              onClick={() => updateData({ selectedSeverity: severity as any })}
              className="min-w-[100px] flex-1"
            >
              {severity}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  const renderOffenseSelection = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return null;
    
    if (ADMINISTRATIVE_PUNISHMENTS.includes(punishmentType.name)) return null;
    
    // Only show offense selection for single severity punishments
    if (!punishmentType.singleSeverityPunishment) return null;
    
    // Special permanent punishments don't show offense selection
    if (punishmentType.permanentUntilSkinChange || punishmentType.permanentUntilUsernameChange) return null;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Offense Level</label>
        <div className="flex gap-2">
          {OFFENSE_LEVELS.map((level) => (
            <Button
              key={level.id}
              variant={data.selectedOffenseLevel === level.id ? "default" : "outline"}
              size="sm"
              onClick={() => updateData({ selectedOffenseLevel: level.id as any })}
              className="min-w-[100px] flex-1"
            >
              {level.label}
            </Button>
          ))}
        </div>
      </div>
    );
  };

  const renderDurationControls = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return null;
    
    // Only Manual Mute and Manual Ban need duration controls
    const needsDuration = ['Manual Mute', 'Manual Ban'].includes(punishmentType.name);
    if (!needsDuration) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Duration</label>
          <div className="flex items-center">
            <Checkbox
              id={`permanent-${punishmentType.name.toLowerCase().replace(' ', '-')}`}
              checked={data.isPermanent || false}
              onCheckedChange={(checked) => {
                updateData({ 
                  isPermanent: checked === true,
                  duration: checked ? undefined : { value: 24, unit: 'hours' }
                });
              }}
            />
            <label 
              htmlFor={`permanent-${punishmentType.name.toLowerCase().replace(' ', '-')}`} 
              className="text-sm ml-2"
            >
              Permanent
            </label>
          </div>
        </div>

        {!data.isPermanent && (
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Duration"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={data.duration?.value || ''}
              onChange={(e) => updateData({
                duration: { 
                  ...data.duration, 
                  value: parseInt(e.target.value) || 1,
                  unit: data.duration?.unit || 'hours'
                }
              })}
              min={1}
            />
            <select
              className="w-24 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
              value={data.duration?.unit || 'hours'}
              onChange={(e) => updateData({
                duration: { 
                  ...data.duration,
                  value: data.duration?.value || 1,
                  unit: e.target.value as any
                }
              })}
            >
              {DURATION_UNITS.map(unit => (
                <option key={unit.value} value={unit.value}>{unit.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    );
  };

  const renderSpecialOptions = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return null;

    const options = [];

    // Special options for specific administrative punishment types
    if (punishmentType.name === 'Kick') {
      options.push(
        <div key="kickSameIP" className="flex items-center space-x-2">
          <Checkbox
            id="kickSameIP"
            checked={data.kickSameIP || false}
            onCheckedChange={(checked) => updateData({ kickSameIP: checked === true })}
          />
          <label htmlFor="kickSameIP" className="text-sm">
            Kick players with same IP
          </label>
        </div>
      );
    } else if (punishmentType.name === 'Manual Ban') {
      // Manual Ban specific options
      options.push(
        <div key="banLinkedAccounts" className="flex items-center space-x-2">
          <Checkbox
            id="banLinkedAccounts"
            checked={data.banLinkedAccounts || false}
            onCheckedChange={(checked) => updateData({ banLinkedAccounts: checked === true })}
          />
          <label htmlFor="banLinkedAccounts" className="text-sm">
            Ban Linked Accounts
          </label>
        </div>,
        <div key="wipeAccount" className="flex items-center space-x-2">
          <Checkbox
            id="wipeAccount"
            checked={data.statWiping || false}
            onCheckedChange={(checked) => updateData({ statWiping: checked === true })}
          />
          <label htmlFor="wipeAccount" className="text-sm">
            Wipe Account After Expiry
          </label>
        </div>
      );
    } else if (punishmentType.name === 'Linked Ban') {
      // Linked Ban requires selecting an existing punishment to link to
      return (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Search for Punishment to Link</label>
            <p className="text-xs text-muted-foreground mb-2">Search by punishment ID or player name</p>
            <div className="relative">
              <Input
                placeholder="Enter punishment ID or player name..."
                value={linkedBanSearch}
                onChange={(e) => {
                  setLinkedBanSearch(e.target.value);
                  searchLinkedBan(e.target.value);
                }}
                className="mb-2"
              />
              {linkedBanSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-10 bg-background border border-border rounded-md shadow-lg max-h-32 overflow-y-auto">
                  {linkedBanSearchResults.map((punishment, index) => (
                    <div
                      key={index}
                      className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                      onClick={() => selectLinkedBan(punishment)}
                    >
                      <div className="text-sm font-medium">{punishment.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {punishment.playerName} - {punishment.type} - {punishment.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {data.banToLink && (
              <div className="mt-2">
                <Badge variant="outline" className="text-xs">
                  Selected: {data.banToLink}
                </Badge>
              </div>
            )}
          </div>
        </div>
      );
    } else if (['Security Ban', 'Blacklist'].includes(punishmentType.name)) {
      // These administrative punishments have no special options
      return null;
    } else {
      // Non-administrative punishments - check punishment type configuration
      if (punishmentType.canBeAltBlocking) {
        options.push(
          <div key="altBlocking" className="flex items-center space-x-2">
            <Checkbox
              id="altBlocking"
              checked={data.altBlocking || false}
              onCheckedChange={(checked) => updateData({ altBlocking: checked === true })}
            />
            <label htmlFor="altBlocking" className="text-sm">
              Alt-blocking
              <span className="text-xs text-muted-foreground ml-2">- Prevents alternative accounts from connecting</span>
            </label>
          </div>
        );
      }
      
      if (punishmentType.canBeStatWiping) {
        options.push(
          <div key="statWiping" className="flex items-center space-x-2">
            <Checkbox
              id="statWiping"
              checked={data.statWiping || false}
              onCheckedChange={(checked) => updateData({ statWiping: checked === true })}
            />
            <label htmlFor="statWiping" className="text-sm">
              Stat-wiping
              <span className="text-xs text-muted-foreground ml-2">- Resets player statistics and progress</span>
            </label>
          </div>
        );
      }
    }

    // Silent punishment is available for all punishment types
    options.push(
      <div key="silentPunishment" className="flex items-center space-x-2">
        <Checkbox
          id="silentPunishment"
          checked={data.silentPunishment || false}
          onCheckedChange={(checked) => updateData({ silentPunishment: checked === true })}
        />
        <label htmlFor="silentPunishment" className="text-sm">
          Silent punishment
        </label>
      </div>
    );

    if (options.length === 0) return null;

    return (
      <div className="space-y-2">
        <label className="text-sm font-medium">Options</label>
        <div className="space-y-2">
          {options}
        </div>
      </div>
    );
  };

  const reasonRequiredPunishments = ['Kick', 'Manual Mute', 'Manual Ban'];

  const renderTextFields = () => {
    const punishmentType = getCurrentPunishmentType();
    if (!punishmentType) return null;
    
    const sections = [];
    
    if (reasonRequiredPunishments.includes(punishmentType.name)) {
      const reasonPlaceholders = {
        'Kick': 'Enter reason for kick',
        'Manual Mute': 'Enter reason for mute',
        'Manual Ban': 'Enter reason for ban'
      };
      const reasonPlaceholder = reasonPlaceholders[punishmentType.name as keyof typeof reasonPlaceholders] || 'Enter punishment reason...';
      
      sections.push(
        <div key="reason" className="space-y-2">
          <label className="text-sm font-medium">Reason (shown to player)</label>
          <textarea
            className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={reasonPlaceholder}
            value={data.reason || ''}
            onChange={(e) => updateData({ reason: e.target.value })}
          />
        </div>
      );
    }
    
    // Evidence field - shown for all punishment types
    sections.push(
      <div key="evidence" className="space-y-4">
        <label className="text-sm font-medium">Evidence</label>
        
        {/* Evidence Items */}
        <div className="space-y-2">
          {(data.evidence || []).map((evidence, index) => (
            <div key={index} className="flex items-center space-x-2">
              <input
                type="text"
                className={`flex-1 h-8 rounded-md border border-input px-3 py-1 text-sm ${
                  evidence.startsWith('http') || evidence.startsWith('{') ? 'bg-muted text-muted-foreground' : 'bg-background'
                }`}
                placeholder="Evidence URL or description..."
                value={(() => {
                  // Handle uploaded file objects
                  if (evidence.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(evidence);
                      return `📁 ${parsed.fileName}`;
                    } catch {
                      return evidence;
                    }
                  }
                  // Handle direct URLs (legacy)
                  if (evidence.startsWith('http')) {
                    return `📁 ${evidence.split('/').pop()}`;
                  }
                  // Regular text evidence
                  return evidence;
                })()}
                onChange={(e) => {
                  // Don't allow editing of uploaded files (URLs or objects)
                  if (evidence.startsWith('http') || evidence.startsWith('{')) return;
                  
                  const newEvidence = [...(data.evidence || [])];
                  newEvidence[index] = e.target.value;
                  updateData({ evidence: newEvidence });
                }}
                readOnly={evidence.startsWith('http') || evidence.startsWith('{')}
              />
              
              {/* Upload button for this evidence item */}
              <MediaUpload
                uploadType="evidence"
                onUploadComplete={(result, file) => {
                  // Create evidence object with file metadata like PlayerWindow does
                  const evidenceObject = {
                    url: result.url,
                    fileName: file?.name || 'Unknown file',
                    fileType: file?.type || 'application/octet-stream',
                    fileSize: file?.size || 0
                  };
                  
                  // Store the stringified object so it can be parsed later
                  const newEvidence = [...(data.evidence || [])];
                  newEvidence[index] = JSON.stringify(evidenceObject);
                  updateData({ evidence: newEvidence });
                }}
                metadata={{
                  playerId: playerId,
                  category: 'punishment'
                }}
                variant="button-only"
                maxFiles={1}
              />
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newEvidence = (data.evidence || []).filter((_, i) => i !== index);
                  updateData({ evidence: newEvidence });
                }}
              >
                Remove
              </Button>
            </div>
          ))}
          
          {/* Add Evidence Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateData({ evidence: [...(data.evidence || []), ''] })}
          >
            Add Evidence
          </Button>
        </div>
      </div>
    );
    
    // Staff Notes - shown for all punishment types
    sections.push(
      <div key="staffNotes" className="space-y-2">
        <label className="text-sm font-medium">Staff Notes (Internal)</label>
        <textarea
          className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Internal notes for staff..."
          value={data.staffNotes || ''}
          onChange={(e) => updateData({ staffNotes: e.target.value })}
        />
      </div>
    );
    
    return <>{sections}</>;
  };

  // Stage 1: Category Selection
  if (!data.selectedPunishmentCategory) {
    return (
      <div className={compact ? "space-y-3" : "bg-muted/30 p-4 rounded-lg space-y-4"}>
        {!compact && (
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Create Punishment</h4>
            {playerName && (
              <Badge variant="outline">
                {playerName}
              </Badge>
            )}
          </div>
        )}
        
        <div className="space-y-3">
          {renderCategoryGrid(punishmentTypesByCategory.Administrative, "Administrative Actions")}
          {renderCategoryGrid(punishmentTypesByCategory.Social, "Chat & Social")}
          {renderCategoryGrid(punishmentTypesByCategory.Gameplay, "Game & Account")}
        </div>
      </div>
    );
  }

  // Stage 2: Punishment Configuration
  const punishmentType = getCurrentPunishmentType();
  if (!punishmentType) return null;

  return (
    <div className={compact ? "space-y-4" : "bg-muted/30 p-4 rounded-lg space-y-4"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => updateData({ selectedPunishmentCategory: undefined })}
          >
            ← Back
          </Button>
          <span className="font-medium">{punishmentType.name}</span>
        </div>
        {playerName && (
          <Badge variant="outline">
            {playerName}
          </Badge>
        )}
      </div>

      <div className="space-y-4">
        {renderSeveritySelection()}
        {renderOffenseSelection()}
        {renderDurationControls()}
        {renderSpecialOptions()}
        {renderTextFields()}
      </div>

      <Button
        onClick={handleApplyPunishment}
        disabled={isApplying || (reasonRequiredPunishments.includes(data.selectedPunishmentCategory || '') && !data.reason?.trim()) || (() => {
          const punishmentType = getCurrentPunishmentType();
          if (!punishmentType) return true;
          
          if (punishmentType.permanentUntilSkinChange || punishmentType.permanentUntilUsernameChange) {
            return false;
          }
          
          if (!punishmentType.singleSeverityPunishment && !ADMINISTRATIVE_PUNISHMENTS.includes(data.selectedPunishmentCategory || '')) {
            return !data.selectedSeverity;
          }
          
          if (punishmentType.singleSeverityPunishment) {
            return !data.selectedOffenseLevel;
          }
          
          return false;
        })()}
        className="w-full"
      >
        {isApplying ? (
          'Applying...'
        ) : (
          `Apply: ${getPunishmentPreview() || 'Select punishment options'}`
        )}
      </Button>
    </div>
  );
};

export default PlayerPunishment;