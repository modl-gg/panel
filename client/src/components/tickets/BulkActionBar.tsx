import { useState } from 'react';
import { X, Tag, UserPlus, CircleDot, CheckCircle2 } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { FilterDropdown } from './FilterDropdown';

interface Label {
  id: string;
  name: string;
  color: string;
}

interface BulkActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onMarkAs: (status: 'open' | 'closed') => void;
  onAddLabels: (labels: string[]) => void;
  onAssign: (assignees: string[]) => void;
  availableLabels: Label[];
  staffMembers: { value: string; label: string }[];
  isLoading?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onMarkAs,
  onAddLabels,
  onAssign,
  availableLabels,
  staffMembers,
  isLoading = false,
}: BulkActionBarProps) {
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);

  const handleAddLabels = () => {
    if (selectedLabels.length > 0) {
      onAddLabels(selectedLabels);
      setSelectedLabels([]);
    }
  };

  const handleAssign = () => {
    if (selectedAssignees.length > 0) {
      onAssign(selectedAssignees);
      setSelectedAssignees([]);
    }
  };

  const handleMarkAs = () => {
    if (selectedStatus.length > 0) {
      onMarkAs(selectedStatus[0] as 'open' | 'closed');
      setSelectedStatus([]);
    }
  };

  const labelOptions = availableLabels.map((label) => ({
    value: label.name,
    label: label.name,
    color: label.color,
  }));

  const statusOptions = [
    { value: 'open', label: 'Open' },
    { value: 'closed', label: 'Closed' },
  ];

  return (
    <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 border border-border rounded-lg mb-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-7 w-7 p-0"
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {selectedCount} selected
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        <div className="flex items-center gap-2">
          {/* Mark as dropdown */}
          <div className="flex items-center gap-1">
            <FilterDropdown
              label="Mark as"
              options={statusOptions}
              selected={selectedStatus}
              onChange={setSelectedStatus}
              placeholder="Select status"
            />
            {selectedStatus.length > 0 && (
              <Button
                size="sm"
                onClick={handleMarkAs}
                disabled={isLoading}
                className="h-8"
              >
                Apply
              </Button>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Add Label dropdown */}
          <div className="flex items-center gap-1">
            <FilterDropdown
              label="Add Label"
              options={labelOptions}
              selected={selectedLabels}
              onChange={setSelectedLabels}
              multiSelect
              searchable
              placeholder="Select labels"
            />
            {selectedLabels.length > 0 && (
              <Button
                size="sm"
                onClick={handleAddLabels}
                disabled={isLoading}
                className="h-8"
              >
                Apply
              </Button>
            )}
          </div>

          <div className="h-4 w-px bg-border" />

          {/* Assign dropdown - now supports multiple */}
          <div className="flex items-center gap-1">
            <FilterDropdown
              label="Assign"
              options={staffMembers}
              selected={selectedAssignees}
              onChange={setSelectedAssignees}
              multiSelect
              searchable
              placeholder="Select assignees"
            />
            {selectedAssignees.length > 0 && (
              <Button
                size="sm"
                onClick={handleAssign}
                disabled={isLoading}
                className="h-8"
              >
                Apply
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
