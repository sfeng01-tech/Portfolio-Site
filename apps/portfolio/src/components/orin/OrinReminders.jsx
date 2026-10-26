import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Bell, BellOff, Check, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './notesEditor.css';

// Weekday keys are timezone-neutral and shared with the database check.
const DAYS = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']
];

// ORIN's clock is Pacific, matching the digest labels.
const clock = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date());
const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
const weekdayKey = (iso = todayKey()) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${iso}T12:00:00`).getDay()];

async function request(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...options?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const error = new Error(payload.error || 'The reminders editor needs the server API.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export default function OrinReminders() {
  const { expireSession } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState(DAYS.map(([key]) => key));
  const [busy, setBusy] = useState(false);
  const [fired, setFired] = useState(new Set());
  const firing = useRef(new Set());

  const report = useCallback(err => {
    if (err?.status === 401) { expireSession(); return; }
    setError(err.message);
  }, [expireSession]);

  useEffect(() => {
    request('/api/orin/reminders')
      .then(payload => setReminders(payload.reminders || []))
      .catch(report);
  }, [report]);

  // Fire each reminder when its clock time arrives on an enabled weekday. The
  // server's last_fired_at is the durable record; the in-memory set keeps the
  // same minute from double-firing while the PATCH is in flight.
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return undefined;
    const check = async () => {
      const now = clock();
      const day = weekdayKey();
      for (const reminder of reminders) {
        if (!reminder.enabled || !reminder.days?.includes(day) || reminder.time !== now) continue;
        const key = `${reminder.id}-${todayKey()}`;
        if (fired.has(key) || firing.current.has(key)) continue;
        if (reminder.lastFiredAt && reminder.lastFiredAt.slice(0, 10) === todayKey()) continue;
        firing.current.add(key);
        try {
          new Notification('ORIN reminder', { body: reminder.label, tag: key });
          setFired(previous => new Set(previous).add(key));
          await request('/api/orin/reminders', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: reminder.id, firedAt: new Date().toISOString() })
          });
          setReminders(previous => previous.map(item => item.id === reminder.id ? { ...item, lastFiredAt: new Date().toISOString() } : item));
        } catch (err) { report(err); }
        finally { firing.current.delete(key); }
      }
    };
    check();
    const timer = setInterval(check, 20_000);
    return () => clearInterval(timer);
  }, [reminders, fired, report]);

  const create = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = await request('/api/orin/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, time, days })
      });
      setReminders(previous => [...previous, payload.reminder].sort((a, b) => a.time.localeCompare(b.time)));
      setLabel('');
      setMessage(`Reminder set for ${payload.reminder.time}`);
    } catch (err) { report(err); }
    finally { setBusy(false); }
  };

  const patch = async (id, updates) => {
    try {
      const payload = await request('/api/orin/reminders', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });
      setReminders(previous => previous.map(item => item.id === id ? { ...item, ...payload.reminder } : item));
    } catch (err) { report(err); }
  };

  const remove = async id => {
    try {
      await request(`/api/orin/reminders?id=${id}`, { method: 'DELETE' });
      setReminders(previous => previous.filter(item => item.id !== id));
    } catch (err) { report(err); }
  };

  const toggleDay = key => {
    const next = new Set(days);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size) setDays(DAYS.map(([candidate]) => candidate).filter(candidate => next.has(candidate)));
  };

  const now = clock();
  const today = weekdayKey();
  const clockLabel = `${now} PT`;
  const allDays = useMemo(() => DAYS.map(([key]) => key), []);

  const sortKey = item => `${item.time || '99:99'}-${item.label || ''}`;
  const enabled = useMemo(() => reminders.filter(item => item.enabled).sort((a, b) => sortKey(a).localeCompare(sortKey(b))), [reminders]);

  // "Ringing today" = it is this minute right now, or it already rang today.
  const dueNow = useMemo(() => enabled.filter(item => {
    if (!item.days?.includes(today)) return false;
    const rangToday = Boolean(item.lastFiredAt && item.lastFiredAt.slice(0, 10) === todayKey());
    return rangToday || item.time === now;
  }), [enabled, today, now]);

  const paused = useMemo(() => reminders.filter(item => !item.enabled).sort((a, b) => sortKey(a).localeCompare(sortKey(b))), [reminders]);
  const dueNowIds = useMemo(() => new Set(dueNow.map(item => item.id)), [dueNow]);
  const upcoming = useMemo(() => enabled.filter(item => !dueNowIds.has(item.id)), [enabled, dueNowIds]);

  const daySummary = item => {
    const picked = item.days || [];
    if (!picked.length) return 'No days';
    if (allDays.every(day => picked.includes(day))) return 'Every day';
    return picked.map(key => DAYS.find(([candidate]) => candidate === key)?.[1]).join(' ');
  };

  const reminderRow = item => <li key={item.id} className={item.enabled ? '' : 'is-off'}>
    <button className="orin-reminders-toggle" onClick={() => patch(item.id, { enabled: !item.enabled })}
      aria-pressed={item.enabled} aria-label={item.enabled ? 'Pause reminder' : 'Resume reminder'}>
      {item.enabled ? <Bell size={15}/> : <BellOff size={15}/>}
    </button>
    <div className="orin-reminders-body">
      <span className="orin-reminders-time">{item.time}</span>
      <span className="orin-reminders-label">{item.label}</span>
      <span className="orin-reminders-days-list">{daySummary(item)}</span>
    </div>
    {item.lastFiredAt && <span className="orin-reminders-last" title={item.lastFiredAt}>Last rang {item.lastFiredAt.slice(0, 10)}</span>}
    {dueNowIds.has(item.id) && <span className="orin-reminders-now"><Check size={13}/> now</span>}
    <button className="orin-icon" onClick={() => remove(item.id)} aria-label="Delete reminder"><Trash2 size={15}/></button>
  </li>;

  return <section className="orin-reminders" aria-label="Daily reminders">
    <div className="orin-editor-head">
      <div className="eyebrow"><AlarmClock size={13}/> EVERY DAY, ON TIME</div>
      <h2>Ask ORIN to nudge you.</h2>
      <p>Set a time and weekdays; a notification rings while this page is open.</p>
      {permission !== 'granted' && <button className="orin-reminders-permission" onClick={async () => {
        if (typeof Notification === 'undefined') return setError('This browser does not support notifications.');
        const decision = await Notification.requestPermission();
        setPermission(decision);
        if (decision === 'granted') new Notification('ORIN reminder', { body: 'Notifications are on. Reminders will ring here.' });
      }}><Bell size={15}/> Turn on notifications</button>}
      {permission === 'granted' && <p className="orin-reminders-on"><Bell size={14}/> Notifications are on</p>}
      {permission === 'denied' && <p className="orin-reminders-on is-muted"><BellOff size={14}/> Blocked in the browser — enable them in site settings</p>}
    </div>

    <form className="orin-reminders-form" onSubmit={create}>
      <div className="orin-reminders-composer">
        <label className="orin-reminders-field is-wide">
          <span>Remind me to</span>
          <input required maxLength={200} value={label} onChange={event => setLabel(event.target.value)} placeholder="review the daily digest"/>
        </label>
        <label className="orin-reminders-field is-time">
          <span>At</span>
          <input required type="time" value={time} onChange={event => setTime(event.target.value)}/>
        </label>
        <fieldset className="orin-reminders-days">
          <legend className="orin-reminders-days-caption">Repeats</legend>
          <div className="orin-reminders-days-row">
            {DAYS.map(([key, short]) => <button type="button" key={key} aria-pressed={days.includes(key)} onClick={() => toggleDay(key)}>{short}</button>)}
          </div>
        </fieldset>
        <button className="button-primary orin-reminders-add" disabled={busy || !label.trim()}><Plus size={15}/>{busy ? 'Setting…' : 'Add'}</button>
      </div>
      <p className="orin-reminders-form-hint">A notification rings at this time while this page is open, on the days you picked.</p>
    </form>

    {error && <div role="alert" className="orin-error">{error}</div>}
    {message && <p role="status" className="orin-reminders-note-message">{message}</p>}

    {reminders.length === 0
      ? <div className="orin-editor-empty"><AlarmClock size={26} strokeWidth={1.3}/><strong>No reminders yet</strong><p>The first one takes a minute — pick a time above.</p></div>
      : <>
        {dueNow.length > 0 && <section className="orin-reminders-section">
          <div className="orin-reminders-section-head"><span className="eyebrow">RINGING TODAY · {clockLabel}</span></div>
          <ul className="orin-reminders-list">{dueNow.map(reminderRow)}</ul>
        </section>}
        {upcoming.length > 0 && <section className="orin-reminders-section">
          <div className="orin-reminders-section-head"><span className="eyebrow">SCHEDULED · {upcoming.length}</span></div>
          <ul className="orin-reminders-list">{upcoming.map(reminderRow)}</ul>
        </section>}
        {paused.length > 0 && <section className="orin-reminders-section">
          <div className="orin-reminders-section-head"><span className="eyebrow">PAUSED · {paused.length}</span></div>
          <ul className="orin-reminders-list">{paused.map(reminderRow)}</ul>
        </section>}
        <p className="orin-reminders-count" role="status">{enabled.filter(item => item.days?.includes(today)).length} due today · {reminders.length} total</p>
      </>}
  </section>;
}
