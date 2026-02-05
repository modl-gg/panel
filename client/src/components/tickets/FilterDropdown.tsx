import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { Button } from '@modl-gg/shared-web/components/ui/button';
import { Input } from '@modl-gg/shared-web/components/ui/input';
import { Badge } from '@modl-gg/shared-web/components/ui/badge';

interface FilterOption {
  value: string;
  label: string;
  color?: string;
}

interface FilterDropdownProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  multiSelect?: boolean;
  searchable?: boolean;
  placeholder?: string;
}

export function FilterDropdown({
  label,
  options,
  selected,
  onChange,
  multiSelect = false,
  searchable = false,
  placeholder = 'Select...',
}: FilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (value: string) => {
    if (multiSelect) {
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    } else {
      onChange(selected.includes(value) ? [] : [value]);
      setIsOpen(false);
    }
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const getSelectedLabel = () => {
    if (selected.length === 0) return placeholder;
    if (selected.length === 1) {
      const option = options.find((o) => o.value === selected[0]);
      return option?.label || selected[0];
    }
    return `${selected.length} selected`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-3 justify-between w-[140px]"
      >
        <span className="flex items-center gap-1.5 truncate">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="h-4 min-w-[18px] px-1 text-xs font-normal">
              {selected.length}
            </Badge>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 ml-1 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-popover border border-border rounded-md shadow-lg z-50">
          {searchable && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="h-7 pl-7 text-sm"
                  autoFocus
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1">
            {selected.length > 0 && (
              <button
                className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted rounded"
                onClick={clearSelection}
              >
                Clear selection
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                No options found
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors ${
                    selected.includes(option.value)
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => handleSelect(option.value)}
                >
                  <div className={`w-4 h-4 flex items-center justify-center rounded border ${
                    selected.includes(option.value)
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  }`}>
                    {selected.includes(option.value) && <Check className="h-3 w-3" />}
                  </div>
                  {option.color && (
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
