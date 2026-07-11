export const PRETTY_DATE_FORMAT = 'MMM D, YYYY';
export const DEFAULT_DATE_FORMAT = PRETTY_DATE_FORMAT;

let _dateFormat = DEFAULT_DATE_FORMAT;
let _dateLocale = 'en';

export const setDateFormat = (fmt: string) => {
  _dateFormat = fmt;
};

export const getDateFormat = () => _dateFormat;

export const setDateLocale = (lang: string) => {
  _dateLocale = lang || 'en';
};

type PrettyVariant = 'date' | 'time';

const prettyFormatterCache = new Map<string, Intl.DateTimeFormat>();

const prettyFormatterOptions = (variant: PrettyVariant): Intl.DateTimeFormatOptions => {
  if (variant === 'date') {
    return { month: 'short', day: 'numeric', year: 'numeric' };
  }
  const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return _dateLocale.startsWith('en') ? { ...timeOptions, hour12: true } : timeOptions;
};

const getPrettyFormatter = (variant: PrettyVariant): Intl.DateTimeFormat => {
  const key = `${_dateLocale}:${variant}`;
  const cached = prettyFormatterCache.get(key);
  if (cached) {
    return cached;
  }
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(_dateLocale, prettyFormatterOptions(variant));
  } catch {
    formatter = new Intl.DateTimeFormat('en', prettyFormatterOptions(variant));
  }
  prettyFormatterCache.set(key, formatter);
  return formatter;
};

export const formatPrettyDate = (date: Date): string => getPrettyFormatter('date').format(date);

export const formatPrettyDateTime = (date: Date): string => {
  const time = getPrettyFormatter('time')
    .formatToParts(date)
    .map((part) => (part.type === 'dayPeriod' ? part.value.toLowerCase() : part.value))
    .join('');
  return `${formatPrettyDate(date)} - ${time}`;
};

const pad = (n: number): string => n.toString().padStart(2, '0');

const formatDateParts = (date: Date, includeTime: boolean): string => {
  if (_dateFormat === PRETTY_DATE_FORMAT) {
    return includeTime ? formatPrettyDateTime(date) : formatPrettyDate(date);
  }

  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const yyyy = date.getFullYear().toString();

  let datePart: string;
  switch (_dateFormat) {
    case 'DD/MM/YYYY':
      datePart = `${dd}/${mm}/${yyyy}`;
      break;
    case 'YYYY-MM-DD':
      datePart = `${yyyy}-${mm}-${dd}`;
      break;
    default: // MM/DD/YYYY
      datePart = `${mm}/${dd}/${yyyy}`;
      break;
  }

  if (!includeTime) return datePart;

  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${datePart} ${hh}:${min}`;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const formatChartDateLabel = (label: string | number): string => {
  const text = String(label);
  const match = ISO_DATE_PATTERN.exec(text);
  if (!match) {
    return text;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDateParts(date, false);
};

export const formatDate = (dateString: string): string => {
  try {
    if (!dateString || dateString === 'Invalid Date') {
      return 'Unknown';
    }

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }

    return formatDateParts(date, true);
  } catch (error) {
    return 'Invalid Date';
  }
};

export const formatDateOnly = (date: Date | string): string => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }
    return formatDateParts(dateObj, false);
  } catch (error) {
    return 'Invalid Date';
  }
};

export const formatDateWithTime = (date: Date | string | null | undefined): string => {
  if (!date) return 'Unknown';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) {
    return 'Invalid Date';
  }

  return formatDateParts(dateObj, true);
};

export const formatTimeAgo = (dateString: string | Date): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();

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

    // Cover up to 30 days in the weeks tier so the 28-29 day gap (where floor(days/30) is 0,
    // but floor(days/7) is already 4) doesn't produce a nonsensical "0mo ago".
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;

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
    if (!dateString) return 'Unknown';

    const date = new Date(dateString);

    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }

    const now = new Date();
    const timeDiff = date.getTime() - now.getTime();

    const formattedDate = formatDateParts(date, true);

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
