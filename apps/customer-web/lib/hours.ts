type RawHours = Record<string, unknown> | Array<unknown> | null | undefined;

type HoursInterval = {
  day: number; // 0 = Sunday
  openMinutes: number;
  closeMinutes: number;
};

export type HoursStatus = {
  isOpen: boolean | null;
  hoursSummary?: string;
  openUntilLabel?: string;
  nextOpenLabel?: string;
};

const DAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const parseDayKey = (key: string): number | null => {
  const normalized = key.trim().toLowerCase();
  if (normalized in DAY_ALIASES) return DAY_ALIASES[normalized];
  if (/^\d+$/.test(normalized)) {
    const num = Number(normalized);
    if (num >= 0 && num <= 6) return num;
    if (num >= 1 && num <= 7) return num % 7;
  }
  return null;
};

const parseTimeToMinutes = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 0 && value <= 24) return Math.round(value * 60);
    if (value >= 0 && value <= 2400) {
      const hours = Math.floor(value / 100);
      const minutes = value % 100;
      if (hours >= 0 && hours <= 24 && minutes >= 0 && minutes < 60) {
        return hours * 60 + minutes;
      }
    }
    return null;
  }

  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const rangeMatch = raw.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);
  if (!rangeMatch) return null;
  const hourRaw = Number(rangeMatch[1]);
  const minuteRaw = rangeMatch[2] ? Number(rangeMatch[2]) : 0;
  const meridian = rangeMatch[3]?.toLowerCase();
  if (Number.isNaN(hourRaw) || Number.isNaN(minuteRaw)) return null;

  let hour = hourRaw;
  if (meridian) {
    if (hour === 12) hour = 0;
    if (meridian === 'pm') hour += 12;
  }

  if (hour < 0 || hour > 24 || minuteRaw < 0 || minuteRaw >= 60) return null;
  return hour * 60 + minuteRaw;
};

const parseIntervalValue = (value: unknown): Array<{ openMinutes: number; closeMinutes: number }> => {
  if (typeof value === 'string') {
    const parts = value.split('-').map((part) => part.trim());
    if (parts.length === 2) {
      const openMinutes = parseTimeToMinutes(parts[0]);
      const closeMinutes = parseTimeToMinutes(parts[1]);
      if (openMinutes !== null && closeMinutes !== null) {
        return [{ openMinutes, closeMinutes }];
      }
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseIntervalValue(entry));
  }

  if (typeof value === 'object' && value !== null) {
    const entry = value as Record<string, unknown>;
    const open =
      entry.open ??
      entry.start ??
      entry.opensAt ??
      entry.opens ??
      entry.from ??
      entry.begin ??
      null;
    const close =
      entry.close ??
      entry.end ??
      entry.closesAt ??
      entry.closes ??
      entry.to ??
      entry.finish ??
      null;
    const openMinutes = parseTimeToMinutes(open);
    const closeMinutes = parseTimeToMinutes(close);
    if (openMinutes !== null && closeMinutes !== null) {
      return [{ openMinutes, closeMinutes }];
    }

    if (Array.isArray(entry.intervals)) {
      return entry.intervals.flatMap((interval) => parseIntervalValue(interval));
    }
  }

  return [];
};

const normalizeIntervals = (intervals: HoursInterval[]): HoursInterval[] => {
  const normalized: HoursInterval[] = [];
  intervals.forEach((interval) => {
    if (interval.openMinutes === interval.closeMinutes) return;
    if (interval.openMinutes < interval.closeMinutes) {
      normalized.push(interval);
      return;
    }
    // Overnight range (e.g., 20:00 - 02:00)
    normalized.push({ day: interval.day, openMinutes: interval.openMinutes, closeMinutes: 1440 });
    normalized.push({ day: (interval.day + 1) % 7, openMinutes: 0, closeMinutes: interval.closeMinutes });
  });
  return normalized;
};

const parseHoursJson = (raw: RawHours): HoursInterval[] => {
  if (!raw) return [];
  const intervals: HoursInterval[] = [];

  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (typeof entry !== 'object' || entry === null) return;
      const record = entry as Record<string, unknown>;
      const dayValue = record.day ?? record.weekday ?? record.dow ?? null;
      const day = typeof dayValue === 'string' ? parseDayKey(dayValue) : typeof dayValue === 'number' ? dayValue : null;
      if (day === null || day < 0 || day > 6) return;
      const parsedIntervals = parseIntervalValue(record);
      parsedIntervals.forEach((interval) => intervals.push({ day, ...interval }));
    });
    return normalizeIntervals(intervals);
  }

  if (typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      const day = parseDayKey(key);
      if (day === null) return;
      const parsedIntervals = parseIntervalValue(value);
      parsedIntervals.forEach((interval) => intervals.push({ day, ...interval }));
    });
  }

  return normalizeIntervals(intervals);
};

const formatMinutes = (minutes: number): string => {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
};

const getZonedParts = (date: Date, timeZone?: string) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string) => parts.find((part) => part.type === type)?.value;
  const weekday = lookup('weekday') ?? 'Sun';
  const hour = Number(lookup('hour') ?? 0);
  const minute = Number(lookup('minute') ?? 0);
  const weekdayIndex = DAY_ALIASES[weekday.toLowerCase()] ?? 0;
  return { weekdayIndex, hour, minute };
};

const buildNextOpenLabel = (offsetMinutes: number, openMinutes: number): string => {
  const dayOffset = Math.floor(offsetMinutes / 1440);
  const timeLabel = formatMinutes(openMinutes);
  if (dayOffset === 0) return `Opens later today at ${timeLabel}`;
  if (dayOffset === 1) return `Opens tomorrow at ${timeLabel}`;
  const dayLabel = WEEKDAY_LABELS[dayOffset % 7];
  return `Opens ${dayLabel} at ${timeLabel}`;
};

export const getHoursStatus = (raw: RawHours, timeZone?: string): HoursStatus | null => {
  const intervals = parseHoursJson(raw);
  if (intervals.length === 0) return null;

  const now = getZonedParts(new Date(), timeZone);
  const nowMinutes = now.hour * 60 + now.minute;
  const todays = intervals.filter((interval) => interval.day === now.weekdayIndex);

  const openInterval = todays.find(
    (interval) => nowMinutes >= interval.openMinutes && nowMinutes < interval.closeMinutes
  );

  const hoursSummary = todays.length
    ? `Today: ${todays
        .map((interval) => `${formatMinutes(interval.openMinutes)}–${formatMinutes(interval.closeMinutes)}`)
        .join(', ')}`
    : undefined;

  if (openInterval) {
    return {
      isOpen: true,
      hoursSummary,
      openUntilLabel: `Open until ${formatMinutes(openInterval.closeMinutes)}`
    };
  }

  let nextOffset: number | null = null;
  let nextOpenMinutes: number | null = null;

  intervals.forEach((interval) => {
    let offset = (interval.day - now.weekdayIndex + 7) % 7;
    let candidate = offset * 1440 + interval.openMinutes;
    if (offset === 0 && interval.openMinutes <= nowMinutes) {
      candidate += 7 * 1440;
      offset = Math.floor(candidate / 1440);
    }
    if (candidate > nowMinutes && (nextOffset === null || candidate < nextOffset)) {
      nextOffset = candidate;
      nextOpenMinutes = interval.openMinutes;
    }
  });

  const nextOpenLabel =
    nextOffset !== null && nextOpenMinutes !== null
      ? buildNextOpenLabel(nextOffset - nowMinutes, nextOpenMinutes)
      : undefined;

  return {
    isOpen: false,
    hoursSummary,
    nextOpenLabel
  };
};
