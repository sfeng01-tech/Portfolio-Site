import React, { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

export default function OrinItemControls({ item, captionOnly = false, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [excerpt, setExcerpt] = useState(item.excerpt || '');
  const [url, setUrl] = useState(item.url || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editable = captionOnly || item.source === 'shared';

  async function mutate(method, patch = {}) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/orin/items', { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ id: item.id, ...patch }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to save changes.');
      if (method === 'DELETE') onDelete(item.id);
      else { onUpdate(data.item); setEditing(false); }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="orin-content-controls">
    <div className="orin-content-buttons">
      {editable && <button type="button" disabled={busy} onClick={() => { setTitle(item.title); setExcerpt(item.excerpt || ''); setUrl(item.url || ''); setEditing(true); setError(''); }}><Pencil size={14}/>{captionOnly ? 'Edit caption' : 'Edit share'}</button>}
      <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete “${item.title}” from ORIN? This removes it from the video shelf, digests, and saved items.`)) mutate('DELETE'); }}><Trash2 size={14}/>{busy && !editing ? 'Deleting…' : 'Delete'}</button>
    </div>
    {editing && <form className="orin-content-editor" onSubmit={event => { event.preventDefault(); mutate('PATCH', { title, ...(!captionOnly ? { excerpt, ...(item.url ? { url } : {}) } : {}) }); }}>
      <label>{captionOnly ? 'Thumbnail caption' : 'Title'}<input required maxLength={500} value={title} disabled={busy} onChange={event => setTitle(event.target.value)}/></label>
      {!captionOnly && <>
        {item.url && <label>Source URL<input required type="url" value={url} maxLength={2048} disabled={busy} onChange={event => setUrl(event.target.value)}/></label>}
        <label>Content / note<textarea maxLength={12000} value={excerpt} disabled={busy} onChange={event => setExcerpt(event.target.value)}/></label>
      </>}
      <div className="orin-content-buttons"><button type="submit" disabled={busy || !title.trim()}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></div>
    </form>}
    {error && <p className="orin-error" role="alert">{error}</p>}
  </div>;
}
