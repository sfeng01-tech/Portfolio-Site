import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bold, ChevronLeft, Clock3, Eraser, History, Italic, Link2,
  List, ListOrdered, Plus, Quote, Redo2, Trash2, Type, Underline as UnderlineIcon, Undo2
} from 'lucide-react';
import { countWords, notePlainText, sanitizeNoteHtml, titleFromHtml } from '../../utils/noteSanitizer';
import './notesEditor.css';

const displaySaved = iso => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function request(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...options?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || 'The notes editor needs the server API.');
  return payload;
}

const STYLES = [
  ['paragraph', 'Normal text'],
  ['heading1', 'Heading 1'], ['heading2', 'Heading 2'], ['heading3', 'Heading 3'],
  ['quote', 'Quote'], ['code', 'Code block']
];
const STYLE_BLOCK = { paragraph: 'p', heading1: 'h1', heading2: 'h2', heading3: 'h3', quote: 'blockquote', code: 'pre' };
const SAVE_DEBOUNCE_MS = 900;

export default function OrinNotes() {
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState('');
  const [note, setNote] = useState(null);
  const [versions, setVersions] = useState([]);
  const [saveState, setSaveState] = useState('saved');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' is the landing view; the editor opens on demand
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const saving = useRef(false);
  const dirty = useRef('');

  // Document list, styled after Google Docs' "Document tabs" sidebar.
  useEffect(() => {
    request('/api/orin/notes')
      .then(payload => setNotes(payload.notes || []))
      .catch(err => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNote = useCallback(async id => {
    saveTimer.current && clearTimeout(saveTimer.current);
    dirty.current = '';
    saving.current = false;
    setSaveState('saved');
    setMessage('');
    setNote(null);
    setVersions([]);
    setHistoryOpen(false);
    setActiveId(id);
    setView('editor');
    try {
      const payload = await request(`/api/orin/notes?id=${id}`);
      setNote(payload.note);
      setVersions(payload.versions || []);
    } catch (err) { setError(err.message); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mount a note into the editor when its id changes. Keyed on the id (not on
  // every note update) so autosave-driven state never rewrites what you type.
  const loadedId = useRef('');
  useEffect(() => {
    if (!note || loadedId.current === note.id) return;
    loadedId.current = note.id;
    if (editorRef.current) editorRef.current.innerHTML = note.content || '';
  }, [note]);

  const flushSave = useCallback(async ({ snapshot = false } = {}) => {
    const id = activeId;
    const editor = editorRef.current;
    if (!id || !editor || saving.current) return;
    saving.current = true;
    const html = sanitizeNoteHtml(editor.innerHTML);
    const text = notePlainText(html);
    setSaveState('saving');
    try {
      const payload = await request('/api/orin/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: html, wordCount: countWords(text), snapshot })
      });
      dirty.current = '';
      setSaveState('saved');
      const title = payload.note.title || titleFromHtml(html);
      setNote(previous => previous ? { ...previous, ...payload.note, title } : previous);
      setNotes(previous => previous.map(item => item.id === id
        ? { ...item, title: title || item.title, excerpt: text.slice(0, 200), wordCount: payload.note.wordCount, updatedAt: payload.note.updatedAt }
        : item));
    } catch (err) { setSaveState('dirty'); setError(err.message); }
    finally { saving.current = false; }
  }, [activeId]);

  const scheduleSave = useCallback(now => {
    if (!activeId) return;
    dirty.current = activeId;
    setSaveState('dirty');
    if (activeId && !note?.title) {
      setNote(previous => previous ? { ...previous, title: titleFromHtml(editorRef.current?.innerHTML || '', '') || previous.title } : previous);
    }
    if (now) { flushSave(); return; }
    saveTimer.current && clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => flushSave(), SAVE_DEBOUNCE_MS);
  }, [activeId, note, flushSave]);

  useEffect(() => () => saveTimer.current && clearTimeout(saveTimer.current), []);

  // Leaving with unsaved edits should not be silent.
  useEffect(() => {
    const warn = event => { if (dirty.current) { flushSave({ snapshot: true }); event.preventDefault(); } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flushSave]);

  const command = useCallback((name, value) => {
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(name, false, value);
    scheduleSave();
  }, [scheduleSave]);

  // The title field behaves like Google Docs': it holds the stored title,
  // or stays empty with the first document line shown when unrenamed.
  const [titleDraft, setTitleDraft] = useState('');
  useEffect(() => { setTitleDraft(note?.title || ''); }, [note?.id, note?.title]);

  const commitTitle = async () => {
    if (!note) return;
    const next = titleDraft.trim().slice(0, 200);
    if (next === (note.title || '')) { setTitleDraft(note.title || ''); return; }
    setSaveState('saving');
    try {
      const payload = await request('/api/orin/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeId, title: next }) });
      setSaveState('saved');
      setNote(previous => previous ? { ...previous, title: payload.note.title } : previous);
      setNotes(previous => previous.map(item => item.id === activeId
        ? { ...item, title: payload.note.title || titleFromHtml(editorRef.current?.innerHTML || '') }
        : item));
    } catch (err) { setSaveState('dirty'); setError(err.message); }
  };

  const insertLink = () => {
    const href = window.prompt('Link URL (https://…)');
    if (!href) return;
    const url = new URL(href, window.location.origin).href;
    if (!/^https?:/.test(url)) { setMessage('Use an http(s) link.'); return; }
    command('createLink', url);
  };

  const createNote = async () => {
    try {
      const payload = await request('/api/orin/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '' }) });
      const fresh = { id: payload.note.id, title: '', excerpt: '', wordCount: 0, updatedAt: payload.note.createdAt };
      setNotes(previous => [fresh, ...previous]);
      openNote(payload.note.id);
    } catch (err) { setError(err.message); }
  };

  // Going back to the list never loses work: unsaved edits are captured
  // synchronously here, before the editor unmounts.
  const leaveEditor = () => {
    if (dirty.current) flushSave({ snapshot: true });
    setView('list');
  };

  const deleteNote = async id => {
    if (!window.confirm('Delete this note and its version history?')) return;
    try {
      await request(`/api/orin/notes?id=${id}`, { method: 'DELETE' });
      setNotes(previous => previous.filter(item => item.id !== id));
      if (activeId === id) {
        setNote(null);
        setVersions([]);
        setActiveId('');
        setHistoryOpen(false);
        dirty.current = '';
        setView('list');
      }
      setMessage('Note deleted.');
    } catch (err) { setError(err.message); }
  };

  const restoreVersion = async versionId => {
    if (!window.confirm('Restore this version? The current state is kept in history first.')) return;
    dirty.current = '';
    try {
      saveTimer.current && clearTimeout(saveTimer.current);
      const payload = await request('/api/orin/notes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: activeId, restoreVersionId: versionId }) });
      setNote(payload.note);
      setVersions(previous => [{ id: payload.restored, reason: 'restore', wordCount: payload.note.wordCount, createdAt: payload.note.updatedAt }, ...previous]);
      if (editorRef.current) editorRef.current.innerHTML = payload.note.content;
      setNotes(previous => previous.map(item => item.id === activeId ? { ...item, title: payload.note.title, wordCount: payload.note.wordCount, updatedAt: payload.note.updatedAt } : item));
      setMessage('Version restored.');
    } catch (err) { setError(err.message); }
  };

  const refreshVersions = useCallback(async () => {
    if (!activeId) return;
    try {
      const payload = await request(`/api/orin/notes?id=${activeId}`);
      setVersions(payload.versions || []);
      setNote(previous => previous ? { ...previous, updatedAt: payload.note.updatedAt, wordCount: payload.note.wordCount } : previous);
    } catch { /* version list stays as-is when the refresh fails */ }
  }, [activeId]);

  // The version sidebar is open precisely when the timeline matters; refresh it
  // after any save while it is open so the newest mark appears.
  useEffect(() => {
    if (!historyOpen) return undefined;
    const timer = setInterval(refreshVersions, 15_000);
    return () => clearInterval(timer);
  }, [historyOpen, refreshVersions]);

  useEffect(() => { if (historyOpen && saveState === 'saved') refreshVersions(); }, [saveState, historyOpen, refreshVersions]);

  const status = { saving: 'Saving…', saved: 'All changes saved', dirty: 'Editing…' }[saveState] || 'All changes saved';

  const grouped = useMemo(() => {
    const groups = new Map();
    for (const version of versions) {
      const day = version.createdAt.slice(0, 10);
      groups.set(day, [...(groups.get(day) || []), version]);
    }
    return [...groups.entries()];
  }, [versions]);

  if (view === 'list') return <section className="orin-notes-home" aria-label="Notes">
    <div className="orin-editor-head">
      <div className="eyebrow">MY NOTES</div>
      <h2>Write and remember.</h2>
      <p>Every note autosaves as you type, and each settled state keeps a version you can restore.</p>
    </div>
    {error && <div role="alert" className="orin-error">{error}</div>}
    {message && <p role="status" className="orin-docs-note-message">{message}</p>}
    <div className="orin-notes-actions">
      <button className="button-primary orin-reminders-add" onClick={createNote} disabled={saveState === 'saving'}><Plus size={15}/> New note</button>
      {notes.length > 0 && <span className="orin-reminders-count">{notes.length} note{notes.length === 1 ? '' : 's'} · newest first</span>}
    </div>
    {notes.length === 0
      ? <div className="orin-editor-empty"><Type size={26} strokeWidth={1.3}/><strong>No notes yet</strong><p>The first one takes a second — start with an empty page.</p></div>
      : <ul className="orin-notes-cards">
        {notes.map(item => <li key={item.id}>
          <button className="orin-notes-card" onClick={() => openNote(item.id)}>
            <strong>{item.title || 'Untitled note'}</strong>
            {item.title && item.excerpt ? <span>{item.excerpt}</span> : null}
            <small>{item.updatedAt ? displaySaved(item.updatedAt) : ''}{item.wordCount ? ` · ${item.wordCount} words` : ''}</small>
          </button>
          <button className="orin-icon" onClick={() => deleteNote(item.id)} aria-label="Delete note"><Trash2 size={15}/></button>
        </li>)}
      </ul>}
  </section>;

  return <section className="orin-docs" aria-label="Notes">
    <div className="orin-docs-canvas">
      {error && <div role="alert" className="orin-error">{error}</div>}
      {message && <p role="status" className="orin-docs-note-message">{message}</p>}
      {!note ? <div className="orin-docs-editor-state">{error ? 'Open a different note or try again.' : 'Create a note to start writing.'}</div> : <>
        <div className="orin-docs-titlebar">
          <button className="orin-docs-back" onClick={leaveEditor} aria-label="All notes"><ChevronLeft size={18}/></button>
          <input
            className="orin-docs-titleinput"
            value={titleDraft}
            placeholder="Untitled note"
            aria-label="Document title"
            maxLength={200}
            disabled={!note}
            onChange={event => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); }
              if (event.key === 'Escape') { setTitleDraft(note?.title || ''); event.target.blur(); }
            }}
          />
          <div className="orin-docs-title-actions">
            <span className={`orin-docs-saved ${saveState}`} role="status">{status}</span>
            <button className={`orin-docs-history-toggle ${historyOpen ? 'is-active' : ''}`} onClick={() => setHistoryOpen(value => !value)}><History size={15}/> Version history</button>
          </div>
        </div>

        <div className="orin-docs-toolbar" role="toolbar" aria-label="Main">
          <button onClick={() => flushSave({ snapshot: true })} title="Save now (adds a version mark)" aria-label="Save now" disabled={saveState === 'saving' || !dirty.current}><Clock3 size={16}/></button>
          <button onClick={() => command('undo')} aria-label="Undo"><Undo2 size={16}/></button>
          <button onClick={() => command('redo')} aria-label="Redo"><Redo2 size={16}/></button>
          <select className="orin-docs-select" defaultValue="paragraph" aria-label="Text style" onChange={event => command('formatBlock', STYLE_BLOCK[event.target.value])}>
            {STYLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="orin-docs-sep" aria-hidden="true"/>
          <button onClick={() => command('bold')} aria-label="Bold"><Bold size={16}/></button>
          <button onClick={() => command('italic')} aria-label="Italic"><Italic size={16}/></button>
          <button onClick={() => command('underline')} aria-label="Underline"><UnderlineIcon size={16}/></button>
          <button onClick={() => command('strikeThrough')} aria-label="Strikethrough"><s aria-hidden="true">S</s></button>
          <span className="orin-docs-sep" aria-hidden="true"/>
          <button onClick={() => command('insertUnorderedList')} aria-label="Bulleted list"><List size={16}/></button>
          <button onClick={() => command('insertOrderedList')} aria-label="Numbered list"><ListOrdered size={16}/></button>
          <button onClick={() => command('formatBlock', 'blockquote')} aria-label="Quote"><Quote size={16}/></button>
          <span className="orin-docs-sep" aria-hidden="true"/>
          <button onClick={insertLink} aria-label="Insert link"><Link2 size={16}/></button>
          <button onClick={() => command('removeFormat')} aria-label="Clear formatting"><Eraser size={16}/></button>
        </div>

        <div className="orin-docs-content" onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); flushSave({ snapshot: true }); }
        }} onBlur={() => { if (dirty.current) flushSave(); }}>
          <article
            className="orin-docs-page"
            contentEditable
            suppressContentEditableWarning
            ref={editorRef}
            aria-label="Note body"
            onInput={() => scheduleSave()}
            onPaste={event => {
              event.preventDefault();
              document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
              scheduleSave();
            }}
          />
        </div>

        <div className="orin-docs-footer">
          <span>{note.wordCount ?? 0} words</span>
          <span>Edits save automatically · ⌘S keeps a version mark</span>
        </div>
      </>}

      {historyOpen && note && <aside className="orin-docs-history" aria-label="Version history">
        <div className="orin-docs-history-head">
          <strong>Version history</strong>
          <button className="orin-icon" onClick={() => setHistoryOpen(false)} aria-label="Close version history">✕</button>
        </div>
        <p className="orin-docs-history-hint">Restoring always keeps the current state in history first.</p>
        {grouped.length === 0 && <p className="orin-docs-empty">No versions yet. Edits and ⌘S create them.</p>}
        {grouped.map(([day, dayVersions]) => <div key={day} className="orin-docs-history-day">
          <span className="eyebrow">{new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          <ul>{dayVersions.map(version => version.id && <li key={version.id}>
            <span>{displaySaved(version.createdAt)}</span>
            <small>{version.reason === 'restore' ? 'Restored' : 'Saved'}{version.wordCount ? ` · ${version.wordCount} words` : ''}</small>
            <button onClick={() => restoreVersion(version.id)}>Restore</button>
          </li>)}</ul>
        </div>)}
      </aside>}
    </div>
  </section>;
}
