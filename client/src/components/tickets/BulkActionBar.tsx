import { useState } from 'react';
import { X, Lock, Unlock, Tag, UserPlus } from 'lucide-react';
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
  onClose: () => void;
  onReopen: () => void;
  onAddLabels: (labels: string[]) => void;
  onAssign: (assignee: string) => void;
  availableLabels: Label[];
  staffMembers: { value: string; label: string }[];
  isLoading?: boolean;
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onClose,
  onReopen,
  onAddLabels,
  onAssign,
  availableLabels,
  staffMembers,
  isLoading = false,
}: BulkActionBarProps) {
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string[]>([]);

  const handleAddLabels = () => {
    if (selectedLabels.length > 0) {
      onAddLabels(selectedLabels);
      setSelectedLabels([]);
    }
  };

  const handleAssign = () => {
    if (selectedAssignee.length > 0) {
      onAssign(selectedAssignee[0]);
      setSelectedAssignee([]);
    }
  };

  const labelOptions = availableLabels.map((label) => ({
    value: label.name,
    label: label.name,
    color: label.color,
  }));

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
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="h-7"
          >
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReopen}
            disabled={isLoading}
            className="h-7"
          >
            <Unlock className="h-3.5 w-3.5 mr-1.5" />
            Reopen
          </Button>

          <div className="h-4 w-px bg-border" />

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

          <div className="flex items-center gap-1">
            <FilterDropdown
              label="Assign"
              options={[
                { value: 'none', label: 'Unassigned' },
                ...staffMembers,
              ]}
              selected={selectedAssignee}
              onChange={setSelectedAssignee}
              searchable
              placeholder="Select assignee"
            />
            {selectedAssignee.length > 0 && (
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
