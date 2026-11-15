import test from 'node:test';
import assert from 'node:assert/strict';
import { planAstrologyReminder, makeCalendarEventDraft } from '../src/app/native/astro-event-planner.ts';

const event = {
  id: 'fictional-event-1',
  kind: 'lunar-phase',
  eventAtUtc: '2026-11-15T12:30:00.000Z',
  displayTimeZone: 'Europe/Rome',
  provenance: 'verified-ephemeris'
};

test('reminders are disabled by default and return no plan', () => {
  assert.equal(planAstrologyReminder(event, { enabled: false, leadMinutes: 15 }), null);
  assert.equal(planAstrologyReminder(event, { enabled: false, leadMinutes: -1 }), null);
});

test('plan respects exact UTC event instant and lead time', () => {
  const reminder = planAstrologyReminder(event, { enabled: true, leadMinutes: 30 },
    new Date('2026-11-15T10:00:00.000Z'));
  assert.equal(reminder.eventAtUtc, '2026-11-15T12:30:00.000Z');
  assert.equal(reminder.triggerAtUtc, '2026-11-15T12:00:00.000Z');
  assert.equal(reminder.state, 'ready-to-request');
  assert.equal(reminder.delivery, 'best-effort');
  assert.equal(reminder.privacy, 'generic-lock-screen-text');
  assert.ok(!JSON.stringify(reminder.body).includes('lunar-phase'));
});

test('expired reminders are not presented as scheduled or delivered', () => {
  const reminder = planAstrologyReminder(event, { enabled: true, leadMinutes: 30 },
    new Date('2026-11-15T12:00:00.000Z'));
  assert.equal(reminder.state, 'expired');
});

test('DST transition does not shift UTC trigger by an hour', () => {
  const overlap = {
    ...event, eventAtUtc: '2026-10-25T01:30:00.000Z', displayTimeZone: 'Europe/Rome'
  };
  const reminder = planAstrologyReminder(overlap, { enabled: true, leadMinutes: 30 },
    new Date('2026-10-24T23:00:00.000Z'));
  assert.equal(reminder.triggerAtUtc, '2026-10-25T01:00:00.000Z');
  assert.equal(reminder.displayTimeZone, 'Europe/Rome');
});

test('unvalidated date, malformed UTC or bad timezone fails closed', () => {
  for (const badTime of [
    '2026-11-15T12:30:00+01:00', '2026-02-31T12:30:00.000Z',
    'not-a-time', '2026-11-15T12:30:60Z'
  ]) {
    assert.throws(() => planAstrologyReminder({ ...event, eventAtUtc: badTime },
      { enabled: true, leadMinutes: 5 }), /UTC-instant/);
  }
  assert.throws(() => planAstrologyReminder({ ...event, displayTimeZone: 'Moon/Sea' },
    { enabled: true, leadMinutes: 5 }), /invalid-timezone/);
});

test('bad lead times are rejected, not silently rounded', () => {
  for (const leadMinutes of [-1, 10_081, 0.5, Number.NaN]) {
    assert.throws(() => planAstrologyReminder(event, { enabled: true, leadMinutes }),
      /invalid-reminder-lead/);
  }
});

test('calendar drafts need explicit user confirmation and hide details by default', () => {
  const draft = makeCalendarEventDraft(event);
  assert.equal(draft.title, 'VirgoStars · Evento');
  assert.equal(draft.requiresUserConfirmation, true);
  assert.equal(draft.savedToDeviceCalendar, false);
  assert.equal(draft.startsAtUtc, event.eventAtUtc);
  assert.equal(draft.endsAtUtc, '2026-11-15T12:45:00.000Z');
  assert.equal(makeCalendarEventDraft(event, { revealEventKind: true }).title,
    'VirgoStars · lunar-phase');
});

test('unknown event kinds and unsupported provenance are rejected', () => {
  assert.throws(() => makeCalendarEventDraft({ ...event, kind: 'pseudo-chart' }),
    /invalid-event/);
  assert.throws(() => makeCalendarEventDraft({ ...event, provenance: 'guessed' }),
    /missing-event-provenance/);
});
