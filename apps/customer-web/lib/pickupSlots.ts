/**
 * Pickup slot generation for scheduled orders.
 * Generates available time slots based on operating hours, lead time, and slot granularity.
 */

type RawHours = Record<string, unknown> | Array<unknown> | null | undefined;

type HoursInterval = {
  day: number;
  openMinutes: number;
  closeMinutes: number;
};

export type PickupSlot = {
  start: string;
  end: string;
  label: string;
};

const DAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6
};

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
    const parts = value.split('-').map((p) => p.trim());
    if (parts.length === 2) {
      const openMinutes = parseTimeToMinutes(parts[0]);
      const closeMinutes = parseTimeToMinutes(parts[1]);
      if (openMinutes !== null && closeMinutes !== null) return [{ openMinutes, closeMinutes }];
    }
  }
  if (Array.isArray(value)) return value.flatMap((e) => parseIntervalValue(e));
  if (typeof value === 'object' && value !== null) {
    const e = value as Record<string, unknown>;
    const open = parseTimeToMinutes(e.open ?? e.start ?? e.opensAt ?? e.opens ?? e.from ?? e.begin);
    const close = parseTimeToMinutes(e.close ?? e.end ?? e.closesAt ?? e.closes ?? e.to ?? e.finish);
    if (open !== null && close !== null) return [{ openMinutes: open, closeMinutes: close }];
    if (Array.isArray(e.intervals)) return (e.intervals as unknown[]).flatMap((i) => parseIntervalValue(i));
  }
  return [];
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
      parseIntervalValue(record).forEach((iv) => intervals.push({ day, ...iv }));
    });
    return intervals;
  }
  if (typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
      const day = parseDayKey(key);
      if (day === null) return;
      parseIntervalValue(value).forEach((iv) => intervals.push({ day, ...iv }));
    });
  }
  return intervals;
};

/** Get (dayOfWeek, minutesSinceMidnight) for a Date in the given timezone */
const getZonedParts = (date: Date, timeZone: string): { dayOfWeek: number; minutesSinceMidnight: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const lookup = (t: string) => parts.find((p) => p.type === t)?.value;
  const weekday = lookup('weekday') ?? 'Sun';
  const dayOfWeek = DAY_ALIASES[weekday.toLowerCase()] ?? 0;
  const h = Number(lookup('hour') ?? 0);
  const m = Number(lookup('minute') ?? 0);
  return { dayOfWeek, minutesSinceMidnight: h * 60 + m };
};

const formatSlotLabel = (startISO: string, endISO: string, timeZone?: string): string => {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone ?? undefined
  };
  const startLabel = start.toLocaleString('en-US', { ...opts, timeZone });
  const endLabel = end.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timeZone ?? undefined });
  return `${startLabel} – ${endLabel}`;
};

export type GetPickupSlotsParams = {
  onlineOrderingHoursJson: RawHours;
  timezone?: string | null;
  leadTimeMinutes: number;
  leadDays: number;
  slotMinutes: number;
};

/**
 * Generate available pickup slots for the next `leadDays` days.
 * Iterates over candidate UTC times and checks each against operating hours in the target timezone.
 */
export function getPickupSlots(params: GetPickupSlotsParams): PickupSlot[] {
  const {
    onlineOrderingHoursJson,
    timezone,
    leadTimeMinutes,
    leadDays,
    slotMinutes
  } = params;

  const intervals = parseHoursJson(onlineOrderingHoursJson);
  if (intervals.length === 0) return [];

  const tz = timezone ?? 'UTC';
  const now = new Date();
  const minStartMs = now.getTime() + leadTimeMinutes * 60 * 1000;
  const maxEndMs = now.getTime() + leadDays * 24 * 60 * 60 * 1000;
  const slotMs = slotMinutes * 60 * 1000;

  const slots: PickupSlot[] = [];
  const maxSlots = 100;

  for (let t = Math.ceil(minStartMs / slotMs) * slotMs; t < maxEndMs && slots.length < maxSlots; t += slotMs) {
    const startDate = new Date(t);
    const endDate = new Date(t + slotMs);
    const { dayOfWeek, minutesSinceMidnight: startMinutes } = getZonedParts(startDate, tz);
    const { minutesSinceMidnight: endMinutes } = getZonedParts(endDate, tz);

    const dayIntervals = intervals.filter((i) => i.day === dayOfWeek);
    const inRange = dayIntervals.some(
      (iv) => startMinutes >= iv.openMinutes && endMinutes <= iv.closeMinutes
    );
    if (!inRange) continue;

    slots.push({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      label: formatSlotLabel(startDate.toISOString(), endDate.toISOString(), tz)
    });
  }

  return slots;
}
