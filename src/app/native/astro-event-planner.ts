/**
 * Pure native-event planning contracts. No notification is scheduled and no
 * calendar entry is written by this module.
 *
 * Future native adapters must enforce explicit consent and display the OS
 * scheduling result. A planned reminder is not a delivered notification.
 */

export type AstroEventKind =
  | 'lunar-phase'
  | 'planetary-ingress'
  | 'station'
  | 'transit'
  | 'solar-return'
  | 'planetary-hour'
  | 'consultation';

export type EventProvenance = 'verified-ephemeris' | 'user-entry';

export interface AstrologerEvent {
  /** Private internal identifier: never include in lock-screen notifications. */
  id: string;
  kind: AstroEventKind;
  /** A real, UTC instant from a verified engine or an explicit user entry. */
  eventAtUtc: string;
  /** Named zone used only for UI/calendar display; never to calculate the instant. */
  displayTimeZone: string;
  provenance: EventProvenance;
}

export interface ReminderPreferences {
  /** Never infer opt-in from the presence of an event. */
  enabled: boolean;
  /** Whole minutes, from 0 to 7 days before the event. */
  leadMinutes: number;
}

export interface ReminderPlan {
  eventId: string;
  eventKind: AstroEventKind;
  eventAtUtc: string;
  triggerAtUtc: string;
  displayTimeZone: string;
  /** Meaning: eligible to request native scheduling; not scheduled or delivered. */
  state: 'ready-to-request' | 'expired';
  delivery: 'best-effort';
  privacy: 'generic-lock-screen-text';
  title: 'VirgoStars';
  body: 'Apri VirgoStars per consultare un evento astrologico.';
}

export interface CalendarEventDraft {
  eventId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  timeZone: string;
  /** No sensitive astrology or consultation information by default. */
  title: string;
  requiresUserConfirmation: true;
  savedToDeviceCalendar: false;
}

const EVENT_KINDS: readonly string[] = [
  'lunar-phase', 'planetary-ingress', 'station', 'transit',
  'solar-return', 'planetary-hour', 'consultation'
];

function parseUtcInstant(value: string): number {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error('expected-UTC-instant');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error('invalid-UTC-instant');
  }
  return timestamp;
}

function validateEvent(event: AstrologerEvent): number {
  if (!event || typeof event.id !== 'string' || !event.id.trim() ||
      event.id.length > 128 || !EVENT_KINDS.includes(event.kind)) {
    throw new Error('invalid-event');
  }
  if (event.provenance !== 'verified-ephemeris' && event.provenance !== 'user-entry') {
    throw new Error('missing-event-provenance');
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: event.displayTimeZone });
  } catch {
    throw new Error('invalid-timezone');
  }
  return parseUtcInstant(event.eventAtUtc);
}

/**
 * Generates an in-memory scheduling plan only, never performs OS operations.
 * Compare using UTC milliseconds to stay correct across DST transitions.
 */
export function planAstrologyReminder(
  event: AstrologerEvent,
  prefs: ReminderPreferences,
  now: Date = new Date()
): ReminderPlan | null {
  if (!prefs || prefs.enabled !== true) return null;
  if (!Number.isSafeInteger(prefs.leadMinutes) ||
      prefs.leadMinutes < 0 || prefs.leadMinutes > 10_080) {
    throw new Error('invalid-reminder-lead');
  }
  const eventMs = validateEvent(event);
  if (!Number.isFinite(now.getTime())) throw new Error('invalid-device-clock');
  const triggerAtUtc = new Date(eventMs - prefs.leadMinutes * 60_000).toISOString();
  return {
    eventId: event.id,
    eventKind: event.kind,
    eventAtUtc: new Date(eventMs).toISOString(),
    triggerAtUtc,
    displayTimeZone: event.displayTimeZone,
    state: Date.parse(triggerAtUtc) > now.getTime() ? 'ready-to-request' : 'expired',
    delivery: 'best-effort',
    privacy: 'generic-lock-screen-text',
    title: 'VirgoStars',
    body: 'Apri VirgoStars per consultare un evento astrologico.'
  };
}

/**
 * Prepares data for an *explicit* native calendar insert dialog. No calendar
 * read/write permission is needed until a native integration is chosen.
 * A user must approve the event in their calendar app.
 */
export function makeCalendarEventDraft(
  event: AstrologerEvent,
  details: { revealEventKind?: boolean } = {}
): CalendarEventDraft {
  const eventMs = validateEvent(event);
  return {
    eventId: event.id,
    startsAtUtc: new Date(eventMs).toISOString(),
    endsAtUtc: new Date(eventMs + 15 * 60_000).toISOString(),
    timeZone: event.displayTimeZone,
    title: details.revealEventKind ? `VirgoStars · ${event.kind}` : 'VirgoStars · Evento',
    requiresUserConfirmation: true,
    savedToDeviceCalendar: false
  };
}
