import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LabelBadgeProps {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function LabelBadge({ name, color, onRemove, className, size = 'sm' }: LabelBadgeProps) {
  // Calculate text color based on background color brightness
  const getContrastColor = (hexColor: string) => {
    // Remove # if present
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    // Calculate brightness
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
  };

  const textColor = getContrastColor(color);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        className
      )}
      style={{
        backgroundColor: color,
        color: textColor,
      }}
    >
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 hover:opacity-70 transition-opacity"
          style={{ color: textColor }}
        >
          <X className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </button>
      )}
    </span>
  );
}
