import { AppConfig, AppAvailability, ServiceWindow } from './types';

function toLocalTime(date: Date, timezone: string): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    day: dayMap[get('weekday')] ?? 0,
    hour: parseInt(get('hour'), 10) % 24,
    minute: parseInt(get('minute'), 10),
  };
}

function minutesFromMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function isInWindow(window: ServiceWindow, now: Date): boolean {
  const local = toLocalTime(now, window.timezone);
  if (!window.days.includes(local.day)) return false;

  const current = minutesFromMidnight(local.hour, local.minute);
  const start = minutesFromMidnight(window.startHour, window.startMinute);
  const end = minutesFromMidnight(window.endHour, window.endMinute);

  if (end > start) {
    // Same-day window e.g. 19:00–23:00
    return current >= start && current < end;
  } else {
    // Crosses midnight e.g. 19:00–01:00 → current >= 19:00 OR current < 01:00
    return current >= start || current < end;
  }
}

export function checkAvailability(app: AppConfig, now = new Date()): { available: boolean; reason?: string } {
  const { availability } = app;
  if (!availability) return { available: true };

  if (availability.serviceWindows && availability.serviceWindows.length > 0) {
    const inService = availability.serviceWindows.some(w => isInWindow(w, now));
    if (!inService) {
      const windows = availability.serviceWindows
        .map(w => `days [${w.days.join(',')}] ${w.startHour}:${String(w.startMinute).padStart(2,'0')}–${w.endHour}:${String(w.endMinute).padStart(2,'0')} ${w.timezone}`)
        .join('; ');
      return { available: false, reason: `Outside service hours. Windows: ${windows}` };
    }
  }

  return { available: true };
}
