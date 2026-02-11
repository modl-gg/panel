/**
 * Shared date and time formatting utilities
 */

let _currentLocale = 'en-US';

const langToLocaleMap: Record<string, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
};

export const setDateLocale = (lang: string) => {
  _currentLocale = langToLocaleMap[lang] || 'en-US';
};

export const getDateLocale = () => _currentLocale;

export const formatDate = (dateString: string): string => {
  try {
    // Handle various date formats and edge cases
    if (!dateString || dateString === 'Invalid Date') {
      return 'Unknown';
    }

    const date = new Date(dateString);

    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }

    return date.toLocaleString(_currentLocale, {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (error) {
    return 'Invalid Date';
  }
};

export const formatDateWithTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'Unknown';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  // Check if the date is valid
  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  return new Intl.DateTimeFormat(_currentLocale, {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(dateObj);
};

export const formatTimeAgo = (dateString: string | Date): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();

    // Check for invalid date
    if (isNaN(date.getTime())) {
      return 'Unknown';
    }

    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) return `${diffInWeeks}w ago`;

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths}mo ago`;

    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears}y ago`;
  } catch (error) {
    return 'Unknown';
  }
};

export const formatDateWithRelative = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const timeDiff = date.getTime() - now.getTime();

    // Format the actual date
    const formattedDate = date.toLocaleString(_currentLocale, {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Calculate relative time
    const absDiff = Math.abs(timeDiff);
    const minutes = Math.floor(absDiff / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let relativeText = '';
    if (days > 0) {
      relativeText = timeDiff > 0 ? `in ${days}d` : `${days}d ago`;
    } else if (hours > 0) {
      relativeText = timeDiff > 0 ? `in ${hours}h` : `${hours}h ago`;
    } else if (minutes > 0) {
      relativeText = timeDiff > 0 ? `in ${minutes}m` : `${minutes}m ago`;
    } else {
      relativeText = 'now';
    }

    return `${formattedDate} (${relativeText})`;
  } catch (error) {
    return 'Invalid Date';
  }
};
