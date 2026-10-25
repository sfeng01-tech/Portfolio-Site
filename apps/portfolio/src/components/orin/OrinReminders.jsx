import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Bell, BellOff, Check, Plus, Trash2 } from 'lucide-react';
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
  if (!response.ok || payload.error) throw new Error(payload.error || 'The reminders editor needs the server API.');
  return payload;
}

export default function OrinReminders() {
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

  useEffect(() => {
    request('/api/orin/reminders')
      .then(payload => setReminders(payload.reminders || []))
      .catch(err => setError(err.message));
  }, []);

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
        } catch (err) { setError(err.message); }
        finally { firing.current.delete(key); }
      }
    };
    check();
    const timer = setInterval(check, 20_000);
    return () => clearInterval(timer);
  }, [reminders, fired]);

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
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const patch = async (id, updates) => {
    try {
      const payload = await request('/api/orin/reminders', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      });
      setReminders(previous => previous.map(item => item.id === id ? { ...item, ...payload.reminder } : item));
    } catch (err) { setError(err.message); }
  };

  const remove = async id => {
    try {
      await request(`/api/orin/reminders?id=${id}`, { method: 'DELETE' });
      setReminders(previous => previous.filter(item => item.id !== id));
    } catch (err) { setError(err.message); }
  };

  const toggleDay = key => {
    const next = new Set(days);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size) setDays(DAYS.map(([candidate]) => candidate).filter(candidate => next.has(candidate)));
  };

  const now = clock();
  const today = weekdayKey();
  const dueToday = useMemo(() => reminders.filter(item => item.days?.includes(today)), [reminders, today]);
  const sorted = useMemo(() => [...reminders].sort((a, b) => (a.time || '').localeCompare(b.time || '')), [reminders]);

  return <section className="orin-reminders" aria-label="Daily reminders">
    <div className="orin-reminders-head">
      <div className="eyebrow"><AlarmClock size={15}/> EVERY DAY, ON TIME</div>
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
      <label>Remind me to
        <input required maxLength={200} value={label} onChange={event => setLabel(event.target.value)} placeholder="review the daily digest"/>
      </label>
      <label>At
        <input required type="time" value={time} onChange={event => setTime(event.target.value)}/>
      </label>
      <fieldset className="orin-reminders-days">
        <legend className="sr-only">Days</legend>
        {DAYS.map(([key, short]) => <button type="button" key={key} aria-pressed={days.includes(key)} onClick={() => toggleDay(key)}>{short}</button>)}
      </fieldset>
      <button className="button-primary" disabled={busy || !label.trim()}><Plus size={15}/>{busy ? 'Setting…' : 'Add reminder'}</button>
    </form>

    {error && <div role="alert" className="orin-error">{error}</div>}
    {message && <p role="status">{message}</p>}

    <ul className="orin-reminders-list">
      {sorted.map(item => <li key={item.id} className={item.enabled ? '' : 'is-off'}>
        <button className="orin-reminders-toggle" onClick={() => patch(item.id, { enabled: !item.enabled })}
          aria-pressed={item.enabled} aria-label={item.enabled ? 'Pause reminder' : 'Resume reminder'}>
          {item.enabled ? <Bell size={15}/> : <BellOff size={15}/>}
        </button>
        <div className="orin-reminders-body">
          <span className="orin-reminders-time">{item.time}</span>
          <span className="orin-reminders-label">{item.label}</span>
          <span className="orin-reminders-days-list">{item.days?.map(key => DAYS.find(([candidate]) => candidate === key)?.[1]).join(' ')}</span>
        </div>
        {item.lastFiredAt && <span className="orin-reminders-last" title={item.lastFiredAt}>Last rang {item.lastFiredAt.slice(0, 10)}</span>}
        {item.days?.includes(today) && item.time === now && <span className="orin-reminders-now"><Check size={13}/> now</span>}
        <button className="orin-icon" onClick={() => remove(item.id)} aria-label="Delete reminder"><Trash2 size={15}/></button>
      </li>)}
    </ul>
    {reminders.length === 0 && <p className="orin-reminders-empty">No reminders yet. The first one takes a minute.</p>}
    {dueToday.length > 0 && <p className="orin-reminders-count" role="status">{dueToday.filter(item => item.enabled).length} scheduled today · {reminders.length} total</p>}
  </section>;
}
