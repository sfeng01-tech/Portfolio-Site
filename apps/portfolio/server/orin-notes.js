// Validators for the ORIN private notes editor and daily reminders. Pure
// functions so tests cover them without a database; handlers stay thin.
import { fail } from './validation-helpers.js';
export { fail };

export const REMINDER_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const NOTE_VERSION_REASONS = ['save', 'restore', 'create'];
export const MAX_NOTE_CONTENT_BYTES = 512_000;
export const MAX_NOTE_VERSIONS = 50;
// A version row is only worth keeping when the document meaningfully settled:
// the first entry, an explicit save, or a change after a quiet stretch.
export const VERSION_SNAPSHOT_MINUTES = 15;
export const NOTE_EXCERPT_LENGTH = 160;

// Word count for version rows and the editor footer, matching how the editor
// counts words in its plain-text projection.
export function noteWordCount(content) {
  const text = noteExcerpt(content, Infinity);
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}


// gen_random_uuid() always writes version-4, rfc-variant ids, so the check can
// stay exact without a round-trip for existence.
export function validateNoteId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw fail('Invalid note id');
  return value;
}

export function validateNoteTitle(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f]/.test(value)) throw fail('Invalid note title');
  return value.trim();
}

// Content arrives as the sanitized HTML the editor produces. The browser strips
// scripts, event handlers, and unlisted markup before sending; the server only
// enforces a length budget so a runaway paste cannot thrash the database.
export function validateNoteContent(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_NOTE_CONTENT_BYTES) throw fail('Invalid note content');
  return value;
}

export function validateNotePatch(body) {
  if (!body || typeof body !== 'object') throw fail('Invalid note payload');
  const id = validateNoteId(body.id);
  const title = validateNoteTitle(body.title);
  const content = validateNoteContent(body.content);
  if (title === undefined && content === undefined && body.restoreVersionId === undefined) {
    throw fail('An empty note update');
  }
  if (body.restoreVersionId !== undefined) {
    if (title !== undefined || content !== undefined) throw fail('Restore cannot be mixed with edits');
    validateNoteId(body.restoreVersionId);
  }
  if (body.wordCount !== undefined && (!Number.isInteger(body.wordCount) || body.wordCount < 0 || body.wordCount > 1e6)) {
    throw fail('Invalid word count');
  }
  return {
    id,
    ...(title === undefined ? {} : { title }),
    ...(content === undefined ? {} : { content }),
    ...(body.wordCount === undefined ? {} : { wordCount: body.wordCount }),
    ...(body.snapshot === true ? { snapshot: true } : {}),
    ...(body.restoreVersionId === undefined ? {} : { restoreVersionId: body.restoreVersionId })
  };
}

// Short plain-text lines accept any content the owner typed; the editor renders
// them with textContent only, so no HTML trust boundary applies.
export function validateReminderLabel(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001f]/.test(value)) throw fail('Invalid reminder text');
  return value.trim();
}

export function validateReminderTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw fail('Invalid reminder time');
  return value;
}

export function validateReminderDays(value) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > REMINDER_DAYS.length
      || !value.every(day => REMINDER_DAYS.includes(day)) || new Set(value).size !== value.length) {
    throw fail('Invalid reminder days');
  }
  return value;
}

export function validateReminderCreate(body) {
  if (!body || typeof body !== 'object') throw fail('Invalid reminder payload');
  const label = validateReminderLabel(body.label);
  const time = validateReminderTime(body.time);
  const days = validateReminderDays(body.days) ?? [...REMINDER_DAYS];
  if (body.enabled !== undefined && typeof body.enabled !== 'boolean') throw fail('Invalid reminder enabled');
  return { label, time, days, enabled: body.enabled ?? true };
}

export function validateReminderPatch(body) {
  if (!body || typeof body !== 'object' || typeof body.id !== 'string') throw fail('Invalid reminder payload');
  const id = validateNoteId(body.id);
  const label = body.label === undefined ? undefined : validateReminderLabel(body.label);
  const time = body.time === undefined ? undefined : validateReminderTime(body.time);
  const days = body.days === undefined ? undefined : validateReminderDays(body.days);
  const enabled = body.enabled === undefined ? undefined : Boolean(body.enabled);
  let firedAt;
  if (body.firedAt !== undefined) {
    if (typeof body.firedAt !== 'string' || !body.firedAt || body.firedAt.length > 40 || Number.isNaN(Date.parse(body.firedAt))) {
      throw fail('Invalid reminder timestamp');
    }
    firedAt = new Date(body.firedAt).toISOString();
  }
  if (label === undefined && time === undefined && days === undefined && enabled === undefined && firedAt === undefined) {
    throw fail('An empty reminder update');
  }
  return { id, ...(label === undefined ? {} : { label }), ...(time === undefined ? {} : { time }), ...(days === undefined ? {} : { days }), ...(enabled === undefined ? {} : { enabled }), ...(firedAt === undefined ? {} : { firedAt }) };
}

// Plain-text excerpt for list views; the richest formatting collapses into
// spaces rather than concatenated words.
export function noteExcerpt(content, length = NOTE_EXCERPT_LENGTH) {
  const text = String(content || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}
