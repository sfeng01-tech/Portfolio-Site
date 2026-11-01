import React, { useEffect, useRef, useState } from 'react';

// Owner-facing source manager: soft-delete every item ORIN collected from one
// source. Items disappear from the library immediately but stay recoverable in
// the database for 30 days, after which retention removes them permanently.
export default function OrinSourceManager({ onAction }) {
  const [sources, setSources] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const active = useRef(null);

  useEffect(() => () => active.current?.abort(), []);

  async function load() {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    setError('');
    try {
      const response = await fetch('/api/orin/sources', { credentials: 'same-origin', signal: controller.signal, headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || payload.error) throw new Error(payload.error || 'Unable to list sources.');
      setSources(payload.sources || []);
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
  }

  async function remove(name) {
    if (pending) return;
    setPending(name); setConfirming(null); setError('');
    try {
      const response = await fetch('/api/orin/sources', {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ source: name }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'Unable to delete the source.');
      setMessage(`${payload.source}: ${payload.deleted} item${payload.deleted === 1 ? '' : 's'} removed. Recoverable for ${payload.retentionDays} days.`);
      await load();
      onAction?.(payload);
    } catch (err) { if (err.name !== 'AbortError') setError(err.message); }
    finally { setPending(null); }
  }

  const rows = sources || [];
  return <details className="orin-category-manage orin-source-manage" onToggle={event => { if (event.target.open && !sources) load(); }}>
    <summary>Sources</summary>
    <ul>
      {error && <li className="orin-source-manage-note" role="alert">{error}</li>}
      {message && <li className="orin-source-manage-note" role="status">{message}</li>}
      {!rows.length && <li className="orin-source-manage-note">{sources === null ? 'Loading sources…' : 'No sources collected yet.'}</li>}
      {rows.filter(row => row.items > 0 || row.deleted > 0).map(row => {
        const recoverable = row.items > 0 && row.deleted > 0;
        return <li key={row.source}>
          <span className="orin-category-manage-label">{row.source}<em> · {row.items}</em>{row.deleted > 0 && <em> · {row.deleted} removed</em>}</span>
          {pending === row.source ? <em className="orin-category-manage-working">working…</em>
            : confirming === row.source
              ? <span className="orin-source-manage-confirm">
                  <em>{recoverable ? `incl. ${row.deleted} already removed` : 'all items'}· 30 day recovery</em>
                  <button onClick={() => remove(row.source)} disabled={Boolean(pending)}>Confirm</button>
                  <button onClick={() => setConfirming(null)} disabled={Boolean(pending)}>Cancel</button>
                </span>
              : <button disabled={Boolean(pending)} title="Soft-delete every item of this source; removed items stay recoverable for 30 days and are then permanently deleted" onClick={() => setConfirming(row.source)}>Delete</button>}
        </li>;
      })}
    </ul>
  </details>;
}
