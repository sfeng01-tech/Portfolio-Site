import test from 'node:test';
import assert from 'node:assert/strict';
import notesHandler from '../../../api/orin/notes.js';
import remindersHandler from '../../../api/orin/reminders.js';
import {
  NOTE_EXCERPT_LENGTH, noteExcerpt, noteWordCount,
  validateNoteContent, validateNoteId, validateNotePatch, validateNoteTitle,
  validateReminderCreate, validateReminderDays, validateReminderPatch, validateReminderTime
} from '../server/orin-notes.js';
import { ownerHeaders } from './session-helper.js';

const response = () => ({ headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const noteId = '4f2b9a5c-0000-4000-8000-abcdefabcdef';
const unsetDatabase = () => { delete process.env.ORIN_DATABASE_URL; };

test('note ids are strictly version-4-shaped uuids', () => {
  assert.equal(validateNoteId(noteId), noteId);
  for (const broken of [undefined, '', '4f2b', '00000000-0000-1000-8000-abcdefabcdef', `${noteId}A`]) assert.throws(() => validateNoteId(broken), /Invalid note id/);
});

test('note titles and content enforce size budgets', () => {
  validateNoteTitle('Draft: inference kernels');
  validateNoteTitle('');
  assert.equal(validateNoteTitle(undefined), undefined);
  for (const title of ['x'.repeat(201), 'bad\u0007x', 41]) assert.throws(() => validateNoteTitle(title), /Invalid note title/);
  validateNoteContent('<p>ok</p>');
  assert.equal(validateNoteContent(undefined), undefined);
  assert.throws(() => validateNoteContent('x'.repeat(512_001)), /Invalid note content/);
});

test('note patches require an edit, a manual snapshot flag, or a restore', () => {
  const patch = validateNotePatch({ id: noteId, content: '<p>updated</p>', wordCount: 1, snapshot: true });
  assert.equal(patch.snapshot, true);
  assert.equal(validateNotePatch({ id: noteId, title: 'Renamed' }).wordCount, undefined);
  assert.equal(validateNotePatch({ id: noteId, restoreVersionId: noteId }).restoreVersionId, noteId);
  for (const broken of [
    null, {}, [noteId], { id: 'bad' }, { id: noteId },
    { id: noteId, content: {} }, { id: noteId, wordCount: -3 },
    { id: noteId, content: '<p>new</p>', restoreVersionId: noteId }, { id: noteId, snapshot: 'yes' }
  ]) assert.throws(() => validateNotePatch(broken), /Invalid|empty|mixed/);
});

test('excerpts strip markup and collapse whitespace with an ellipsis tail', () => {
  const html = '<h2>  RoPE &amp; memory </h2><p>First&nbsp;line</p><p>Second line</p>';
  assert.equal(noteExcerpt(html), 'RoPE & memory First line Second line');
  const long = `<p>${'word '.repeat(NOTE_EXCERPT_LENGTH)}</p>`;
  const excerpt = noteExcerpt(long);
  assert.ok(excerpt.length <= NOTE_EXCERPT_LENGTH);
  assert.ok(excerpt.endsWith('…'));
  assert.equal(noteExcerpt(''), '');
  assert.equal(noteWordCount(html), 7);
  assert.equal(noteWordCount(''), 0);
});

test('reminders accept a fixed clock time and a unique weekday subset', () => {
  const created = validateReminderCreate({ label: ' Review the digest ', time: '07:30' });
  assert.deepEqual(created, {
    label: 'Review the digest',
    time: '07:30',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    enabled: true
  });
  assert.deepEqual(validateReminderDays(['sat', 'sun']), ['sat', 'sun']);
  for (const broken of [[], ['mon', 'mon'], ['weekend'], ['sun', 'satfriday']]) assert.throws(() => validateReminderDays(broken), /Invalid reminder days/);
  for (const time of ['7:30', '24:00', '07:60', 730, '']) assert.throws(() => validateReminderTime(time), /Invalid reminder time/);
  assert.throws(() => validateReminderCreate({ label: '', time: '07:30' }), /Invalid reminder text/);
});

test('reminder patches accept label, time, days, enabled, and fired stamps', () => {
  const patch = validateReminderPatch({ id: noteId, enabled: false });
  assert.equal(patch.enabled, false);
  assert.equal(validateReminderPatch({ id: noteId, firedAt: '2026-10-25T07:30:00.000Z' }).firedAt, '2026-10-25T07:30:00.000Z');
  for (const broken of [null, {}, { id: 'bad' }, { id: noteId }, { id: noteId, label: 'x'.repeat(201) }, { id: noteId, time: '07:60' }, { id: noteId, firedAt: 'not-a-time' }]) {
    assert.throws(() => validateReminderPatch(broken), /Invalid|empty/);
  }
});

test('notes and reminders endpoints reject anonymous and unconfigured access', async () => {
  for (const [handler, method] of [[notesHandler, 'GET'], [notesHandler, 'PATCH'], [remindersHandler, 'POST'], [remindersHandler, 'DELETE']]) {
    const res = response();
    await handler({ method, headers: {}, query: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
  }
});

test('notes endpoints answer with the explicit database-configuration error', async () => {
  const originalUrl = process.env.ORIN_DATABASE_URL;
  delete process.env.ORIN_DATABASE_URL;
  const headers = await ownerHeaders({ 'x-forwarded-proto': 'https', origin: 'https://portfolio.example' });
  try {
    unsetDatabase();
    for (const [handler, method, extra] of [[notesHandler, 'GET', {}], [notesHandler, 'POST', { body: {} }], [remindersHandler, 'GET', {}]]) {
      const isWrite = method !== 'GET';
      const res = response();
      await handler({ method, headers: isWrite ? { ...headers, origin: 'https://portfolio.example', 'content-type': 'application/json' } : headers, query: {}, ...extra }, res);
      assert.equal(res.statusCode, 503, `${method} ${handler?.name || ''}`);
      assert.equal(res.body.error, 'ORIN database is not configured');
    }
  } finally {
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});

test('notes write methods validate immediately before any storage', async () => {
  const originalUrl = process.env.ORIN_DATABASE_URL;
  try {
    unsetDatabase();
    const headers = await ownerHeaders({ 'x-forwarded-proto': 'http', origin: 'http://portfolio.example' });
    for (const [handler, method, input, message] of [
      [notesHandler, 'PATCH', { id: 'bad' }, 'Invalid note id'],
      [remindersHandler, 'POST', { label: 'ok', time: '25:00' }, 'Invalid reminder time'],
      [remindersHandler, 'PATCH', { id: 'bad' }, 'Invalid note id'],
      [notesHandler, 'DELETE', null, 'Invalid note id']
    ]) {
      const res = response();
      await handler({ method, headers, query: { id: 'bad' }, body: input }, res);
      assert.equal(res.statusCode, 400, `${method} should reject invalid input`);
      assert.equal(res.body.error, message);
    }
  } finally {
    if (originalUrl === undefined) delete process.env.ORIN_DATABASE_URL; else process.env.ORIN_DATABASE_URL = originalUrl;
  }
});
