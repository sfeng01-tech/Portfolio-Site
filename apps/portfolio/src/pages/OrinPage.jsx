import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, Check, Compass, FileText, Github, Lock, LogOut, RefreshCw, Search, Share2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OrinBrain from '../components/orin/OrinBrain';
import OrinCategoryManager from '../components/orin/OrinCategoryManager';
import OrinCategoryPicker from '../components/orin/OrinCategoryPicker';
import OrinNotes from '../components/orin/OrinNotes';
import OrinReminders from '../components/orin/OrinReminders';
import { BooksCollection, ReferenceProjectsCollection } from '../components/orin/OrinCollections';
import { displaySource } from '../components/orin/brainGraph';
import OrinItemControls from '../components/orin/OrinItemControls';
import { OrinVideosShelf } from './OrinVideosPage';
import './orin.css';

const MAX_PDF_BYTES = 40_000_000;
const loadPdfTools = () => import('../components/orin/pdfText');
const collectionCategories = { projects: 'Reference Projects', books: 'Books' };

const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
const displayDay = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const safeUrl = (url) => { try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; } };
// Chat share links keep their original URL for identity; the repaired destination
// is what a reader wants to open.
const itemLink = (item) => safeUrl(item?.resolvedUrl) || safeUrl(item?.url);
const monthLabel = month => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

function OrinExcerpt({ text, itemId, condensed }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  if (!condensed || text.length <= 360) return <p>{text}</p>;
  const cut = text.slice(0, 320);
  const preview = cut.slice(0, cut.lastIndexOf(' ') > 240 ? cut.lastIndexOf(' ') : 320).trimEnd();
  return <div className="orin-excerpt">
    <p id={`orin-excerpt-${itemId}`}>{expanded ? text : `${preview}…`}</p>
    <button type="button" aria-expanded={expanded} aria-controls={`orin-excerpt-${itemId}`} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Show full summary'}</button>
  </div>;
}

async function request(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...options?.headers } });
  const payload = await response.json().catch(() => ({ error: 'ORIN needs the server API. Run npm run build, then npm run dev:server for local development.' }));
  if (!response.ok || payload.error) {
    const error = new Error(payload.error || (response.status === 403 ? 'This GitHub account does not have access to ORIN.' : 'Unable to load ORIN.'));
    error.status = response.status;
    throw error;
  }
  return payload;
}

export default function OrinPage() {
  const { user, loading: authLoading, error: authError, login, logout, expireSession } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [archiveDay, setArchiveDay] = useState(null);
  const [archiveJump, setArchiveJump] = useState('');
  const [source, setSource] = useState('All');
  const [tab, setTab] = useState('digest');
  const [showAllThreads, setShowAllThreads] = useState(false);
  const [showAllFinds, setShowAllFinds] = useState(false);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(new Set());
  const [revision, setRevision] = useState(0);
  const [categories, setCategories] = useState([]);
  const [shareUrl, setShareUrl] = useState('');
  const [shareNote, setShareNote] = useState('');
  const [shareCategory, setShareCategory] = useState('');
  const [shareDay, setShareDay] = useState(localDate());
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [sharePdf, setSharePdf] = useState(null);
  const [sharePdfBusy, setSharePdfBusy] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [focusItem, setFocusItem] = useState(null);
  const lastLoaded = useRef(0);
  // Digests are immutable once published, so keep each view keyed by tab/date.
  // Switching back to a visited tab is instant; a revision bump refreshes in
  // place without blanking what the reader is looking at.
  const cache = useRef(new Map());
  const lastView = useRef('');

  function reportError(err) {
    if (err?.status === 401) { expireSession(); return; }
    setError(err?.status === 403 ? 'This GitHub account does not have access to ORIN.' : (err?.message || 'Something went wrong.'));
  }

  useEffect(() => {
    document.title = 'ORIN — A world of exploration & study';
    return () => { document.title = 'Sahil Faizal — Software Engineer & AI Systems'; };
  }, []);
  useEffect(() => {
    if (!user) { setData(null); lastView.current = ''; cache.current.clear(); setBusy(false); return undefined; }
    // These private panels fetch their own content when opened.
    if (tab === 'notes' || tab === 'reminders' || tab === 'videos') { setBusy(false); return undefined; }
    // The archive opens its own day without touching the digest tab's date,
    // so the daily digest always comes back to the latest one.
    const isCollection = tab in collectionCategories;
    const activeDate = tab === 'archive' ? (archiveDay || '') : date;
    const viewKey = isCollection ? `collection:${tab}` : tab === 'saved' ? 'saved' : tab === 'archive' ? `archive:${activeDate}` : `digest:${activeDate}`;
    const cached = cache.current.get(viewKey);
    const sameView = lastView.current === viewKey;
    lastView.current = viewKey;

    if (cached && cached.revision === revision) {
      setData(cached.payload);
      setBusy(false);
      setError('');
      return undefined;
    }

    if (cached) setData(cached.payload);
    else if (!sameView) setData(null);

    const controller = new AbortController();
    setBusy(true); setError('');
    const params = new URLSearchParams();
    if (isCollection) params.set('category', collectionCategories[tab]);
    else if (activeDate) params.set('date', activeDate);
    if (tab === 'saved') params.set('saved', 'true');
    request(`/api/orin/digest?${params}`, { signal: controller.signal })
      .then(payload => { lastLoaded.current = Date.now(); cache.current.set(viewKey, { revision, payload }); setData(payload); })
      .catch(err => {
        if (err.name === 'AbortError') return;
        if (err.status === 401) { expireSession(); return; }
        setError(err.status === 403 ? 'This GitHub account does not have access to ORIN.' : err.message);
      })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [user, date, archiveDay, tab, revision, expireSession]);

  // The collector publishes once a day; poll gently, and only while visible, so a
  // tab left open overnight picks up the new digest without a manual reload.
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') setRevision(value => value + 1); }, 15 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoaded.current > 2 * 60 * 1000) setRevision(value => value + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [user]);

  // The editable taxonomy drives the item category picker and regrouping; its
  // counts also change when a model run or an edit assigns labels.
  useEffect(() => {
    if (!user) { setCategories([]); return undefined; }
    const controller = new AbortController();
    request('/api/orin/categories', { signal: controller.signal })
      .then(payload => { if (Array.isArray(payload.categories)) setCategories(payload.categories); })
      .catch(() => setCategories([]));
    return () => controller.abort();
  }, [user, revision]);

  const items = data?.items || [];
  const sources = [...new Set(items.map(item => item.source))];
  const shareCategoryOptions = [...new Set([...categories.map(category => category.label), ...Object.values(collectionCategories)])].sort((a, b) => a.localeCompare(b));
  const filtered = useMemo(() => items.filter(item =>
    (source === 'All' || item.source === source) &&
    `${item.title} ${item.excerpt} ${item.category || ''} ${(item.topics || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  ), [items, source, search]);
  const archiveDates = data?.availableDates || [];
  const archiveMonths = useMemo(() => {
    const groups = new Map();
    for (const day of archiveDates) {
      const month = day.slice(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(day);
    }
    return [...groups].map(([month, days]) => ({ month, label: monthLabel(month), days }));
  }, [data?.availableDates]);

  useEffect(() => {
    if (!focusItem || tab !== 'digest' || !showAllFinds || busy || data?.date !== focusItem.date || !data.items.some(item => item.id === focusItem.id)) return;
    const item = document.getElementById(`orin-item-${focusItem.id}`);
    if (!item) return;
    item.scrollIntoView({ block: 'start' });
    item.focus({ preventScroll: true });
    setFocusItem(null);
  }, [focusItem, tab, showAllFinds, busy, data]);

  function openDigestItem(id, day) {
    setTab('digest');
    setDate(day);
    setArchiveDay(null);
    setSource('All');
    setSearch('');
    setShowAllFinds(true);
    setFocusItem({ id, date: day });
  }

  function openSavedItem() {
    if (saveNotice) openDigestItem(saveNotice.id, saveNotice.date);
  }

  function openArchiveDay(day) {
    setArchiveDay(day);
    setArchiveJump(day);
    setSource('All');
    setSearch('');
  }

  function contentChanged(updated, deletedId) {
    cache.current.clear();
    setData(previous => previous && ({ ...previous, items: previous.items.filter(item => item.id !== deletedId).map(item => item.id === updated?.id ? updated : item) }));
    setRevision(value => value + 1);
  }

  async function updateItem(item, field, value = !item[field], patch = null) {
    if (pending.has(item.id)) return false;
    setPending(previous => new Set(previous).add(item.id));
    try {
      await request('/api/orin/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, [field]: value }) });
      cache.current.clear();
      setData(previous => previous && ({ ...previous, items: previous.items.map(current => current.id === item.id ? { ...current, [field]: value, ...(patch || {}) } : current).filter(current => tab !== 'saved' || current.saved) }));
      return true;
    } catch (err) {
      reportError(err);
      return false;
    } finally { setPending(previous => { const next = new Set(previous); next.delete(item.id); return next; }); }
  }

  // Category edits stamp `categorySource: user` server-side, which both marks
  // the item as owner-curated and keeps a later model run from replacing it.
  // The item is only updated after the request succeeds, so a failed edit
  // leaves the current category visible.
  async function updateCategory(item, value) {
    if (value === item.category) return true;
    const patch = value === null ? { categorySource: undefined } : { categorySource: 'user' };
    return updateItem(item, 'category', value, patch);
  }

  async function createCategory(label) {
    try {
      const payload = await request('/api/orin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) });
      setCategories(previous => previous.some(category => category.label === payload.label) ? previous : [...previous, { label: payload.label, items: 0 }].sort((a, b) => a.label.localeCompare(b.label)));
      return payload.label;
    } catch (err) {
      reportError(err);
      throw err;
    }
  }

  // Taxonomy deletions can act on the affected items server-side (unfile or
  // reassign); the revision bump refetches both the digest items and the
  // taxonomy so cleared mappings show immediately.
  async function categoryAction(label, action, to) {
    try {
      await request('/api/orin/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, ...(action ? { action } : {}), ...(to ? { to } : {}) }) });
    } catch (err) { reportError(err); }
    finally { cache.current.clear(); setRevision(value => value + 1); }
  }

  async function handleSharePdf(event) {
    const file = event.target.files?.[0];
    // Clear the input so picking the same file again still fires a change event.
    event.target.value = '';
    if (!file) return;
    setShareMessage('');
    if (file.size > MAX_PDF_BYTES) { setShareMessage('That PDF is too large — the limit is 40 MB.'); return; }
    if ((file.type && file.type !== 'application/pdf') || (!file.type && !file.name.toLowerCase().endsWith('.pdf'))) { setShareMessage('Only PDF files are supported.'); return; }
    setSharePdf(null);
    setSharePdfBusy(true);
    try {
      const { extractPdfText } = await loadPdfTools();
      const { title, text } = await extractPdfText(file);
      if (!text || text.length < 80) {
        setShareMessage('No readable text found in that PDF — scanned pages are not supported.');
        return;
      }
      setShareUrl('');
      setSharePdf({ name: title, text });
      setShareMessage(`Read “${title}” — ${text.length.toLocaleString()} characters of text captured. Add a note and save it below.`);
    } catch (err) {
      setShareMessage('Could not read that PDF. Try another file.');
    } finally {
      setSharePdfBusy(false);
    }
  }

  function clearSharePdf() {
    setSharePdf(null);
    setShareMessage('');
  }

  async function submitShare(event) {
    event.preventDefault();
    if (shareBusy || sharePdfBusy) return;
    if (!shareUrl && !sharePdf) { setShareMessage('Add a link or a PDF to share.'); return; }
    if (!sharePdf && !safeUrl(shareUrl)) { setShareMessage('Use a valid HTTPS source URL.'); return; }
    setShareBusy(true);
    setShareMessage('');
    try {
      let category = shareCategory;
      if (category && !categories.some(current => current.label.toLowerCase() === category.toLowerCase())) {
        category = await createCategory(category);
      }
      const payload = await request('/api/orin/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sharePdf
          ? { pdf: sharePdf, note: shareNote, category: category || null, date: shareDay }
          : { url: shareUrl, note: shareNote, category: category || null, date: shareDay })
      });
      setShareUrl('');
      setSharePdf(null);
      setShareNote('');
      setShareCategory('');
      setArchiveDay(null);
      setTab('digest');
      setDate(payload.date);
      setShowAllThreads(false);
      setShowAllFinds(false);
      setSaveNotice({ id: payload.id, date: payload.date });
      cache.current.clear();
      setRevision(value => value + 1);
    } catch (err) {
      if (err?.status === 401) { expireSession(); return; }
      setShareMessage(err.message);
    } finally {
      setShareBusy(false);
    }
  }

  const digestGroups = data?.digest?.groups || [];
  const featuredItems = items.slice(0, 4); // The API sorts finds by ranking score.
  const renderDigestGroups = groups => groups.length > 0 && <div className="orin-groups">{groups.map((group,index)=><article key={`${group.title}-${index}`}><div className="eyebrow">THREAD {String(index+1).padStart(2,'0')}</div><h3>{group.title}</h3><p>{group.summary}</p><div>{group.urls?.map((url,i)=> safeUrl(url) && <a key={url} href={safeUrl(url)} target="_blank" rel="noopener noreferrer">Source {i+1} <ArrowUpRight size={12}/></a>)}</div></article>)}</div>;

  return <div className="orin-shell">
    <div className="orin-topbar"><span className="orin-private"><Lock size={12}/> PERSONAL SPACE</span>{user && <button onClick={logout} className="orin-icon" aria-label="Sign out"><LogOut size={17}/></button>}</div>
    <main id="main-content" className="orin-main">
      <div className={`orin-intro ${user ? 'is-compact' : ''}`}><div className="eyebrow"><Compass size={15}/> A WORLD OF EXPLORATION & STUDY</div><h1>ORIN<span>.</span></h1><p>A quieter place to follow your curiosity.</p></div>
      {authLoading ? <div className="orin-state" role="status">Opening your space…</div> : !user ? <section className="orin-gate orin-gate--landing"><div className="orin-gate-copy"><div className="eyebrow">JUST FOR YOU</div><h2>Your daily window into what’s worth understanding.</h2><p>Research, ideas, and conversations from across AI and systems. Gathered in one private reading space.</p></div><div className="orin-gate-action"><div className="orin-lock"><Lock size={25} strokeWidth={1.4}/></div><button className="button-primary" onClick={() => login('/orin')}><Github size={17}/> Sign in with GitHub <ArrowUpRight size={16}/></button><small>Access is restricted to approved GitHub accounts.</small>{authError && <p role="alert" className="orin-error">{authError}</p>}</div></section> : <>
        <div className="orin-toolbar">
          <div className="orin-tabs" role="tablist" aria-label="Reading view">
            {[['digest','Daily digest'],['archive','Archive'],['share','Share'],['projects','Reference Projects'],['books','Books'],['videos','Videos'],['brain','Live brain'],['saved','Reading list'],['notes','Notes'],['reminders','Reminders']].map(([value,label]) =>
              <button key={value} role="tab" aria-selected={tab===value} onClick={() => {setTab(value);setArchiveDay(null);setSource('All');setShareMessage('');setShowAllThreads(false);setShowAllFinds(false);setFocusItem(null);setError('');}}>{label}</button>
            )}
          </div>
          {(tab === 'digest' || tab === 'brain') && <label className="orin-date"><span className="sr-only">Digest date</span><input type="date" value={date || data?.date || localDate()} max={localDate()} onChange={event => {setDate(event.target.value);setShowAllThreads(false);setShowAllFinds(false);}}/></label>}
          {tab !== 'notes' && tab !== 'reminders' && tab !== 'videos' && <button className="orin-icon" disabled={busy} onClick={() => setRevision(v=>v+1)} aria-label="Refresh content"><RefreshCw size={17} className={busy ? 'animate-spin' : ''}/></button>}
        </div>
        {saveNotice && <div className="orin-save-notice" role="status">
          <span>Your source is in the {displayDay(saveNotice.date)} digest.</span>
          <button type="button" onClick={openSavedItem}>View saved item</button>
          <button type="button" onClick={() => setSaveNotice(null)} aria-label="Dismiss save confirmation">Dismiss</button>
        </div>}
        {error && <div role="alert" className="orin-error">{error}</div>}
        {tab === 'notes' ? <OrinNotes/> : tab === 'reminders' ? <OrinReminders/> : tab === 'videos' ? <OrinVideosShelf embedded/> : !data && busy ? <div className="orin-state" role="status">Gathering your reading list…</div> : data && <>
          {busy && <div className="orin-refreshing" role="status">Refreshing…</div>}
          {tab==='archive' && <section className="orin-archive"><div className="eyebrow">DIGEST ARCHIVE</div>{archiveDay ? <>
            <button type="button" className="orin-archive-back" onClick={() => setArchiveDay(null)}>← Back to archive</button>
            <h2>{displayDay(archiveDay)} digest</h2>
            <p>{sources.length} source{sources.length === 1 ? '' : 's'} gathered this day.</p>
            {renderDigestGroups(digestGroups)}
          </> : <>
            <h2>{data.date ? `${displayDay(data.date)} digest` : 'No digests yet'}</h2>
            <p>Open a day to review every source gathered that day.</p>
            {archiveDates.length ? <>
              <div className="orin-archive-tools">
                <label htmlFor="orin-archive-jump">Jump to a date</label>
                <input id="orin-archive-jump" type="date" value={archiveJump} min={archiveDates[archiveDates.length - 1]} max={archiveDates[0]} onChange={event => setArchiveJump(event.target.value)}/>
                <button type="button" disabled={!archiveDates.includes(archiveJump)} onClick={() => openArchiveDay(archiveJump)}>Open digest</button>
                {archiveJump && !archiveDates.includes(archiveJump) && <span role="status">No digest for that date.</span>}
              </div>
              <div className="orin-archive-months">{archiveMonths.map(({month,label,days},index) => <details key={month} open={index === 0}>
                <summary><span>{label}</span><span>{days.length} digest{days.length === 1 ? '' : 's'}</span></summary>
                <ul>{days.map(day => <li key={day}><button type="button" aria-current={day === data.date} onClick={() => openArchiveDay(day)}><span>{displayDay(day)}</span><span>{day === data.date ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : 'Open'}</span></button></li>)}</ul>
              </details>)}</div>
            </> : <p className="orin-archive-empty">The first collector run will add dates here.</p>}
          </>}</section>}
          {tab==='digest' && <section className="orin-brief"><div className="eyebrow">THE DAILY BRIEF · {data.date || 'NO DIGEST YET'}</div><h2>{data.digest?.title || 'A little space for discovery.'}</h2><p>{data.digest?.summary || (items.length ? `Explore ${items.length} finds from ${sources.length} sources below.` : 'Your first digest will appear here after the collector completes a run.')}</p>{data.digestStatus && data.digestStatus.status !== 'ok' && <p className="orin-digest-status" role="status">{data.digestStatus.message}</p>}<div className="orin-counts"><span>{items.length} finds</span><span>{sources.length} sources</span><span>{items.filter(item=>!item.read).length} unread</span></div></section>}
          {tab==='digest' && featuredItems.length > 0 && <section className="orin-featured" aria-labelledby="orin-featured-heading">
            <div className="eyebrow">START HERE</div>
            <h3 id="orin-featured-heading">{featuredItems.length === 4 ? 'Four' : featuredItems.length} {featuredItems.length === 1 ? 'find' : 'finds'} to start with.</h3>
            <p>Selected from this digest by relevance. Open a source, or read its full entry in ORIN.</p>
            <div className="orin-featured-grid">{featuredItems.map(item => {
              const preview = item.ranking?.reason || item.excerpt || '';
              const summary = preview.length > 220 ? `${preview.slice(0, 217).trimEnd()}…` : preview;
              return <article key={item.id} className="orin-featured-card">
                <div className="eyebrow">{displaySource(item.source)}</div>
                <h4>{itemLink(item) ? <a href={itemLink(item)} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={15}/></a> : item.title}</h4>
                {summary && <p>{summary}</p>}
                <button type="button" onClick={() => openDigestItem(item.id, data.date)}>Read in ORIN</button>
              </article>;
            })}</div>
          </section>}
          {tab==='digest' && digestGroups.length > 0 && <section className="orin-disclosure" aria-labelledby="orin-threads-heading">
            <div><div className="eyebrow">THE THEMES</div><h3 id="orin-threads-heading">{digestGroups.length} threads connecting the finds.</h3></div>
            <button type="button" aria-expanded={showAllThreads} onClick={() => setShowAllThreads(value => !value)}>{showAllThreads ? 'Hide threads' : `Explore all ${digestGroups.length} threads`}</button>
            {showAllThreads && renderDigestGroups(digestGroups)}
          </section>}
          {tab==='digest' && <section className="orin-disclosure" aria-labelledby="orin-all-finds-heading">
            <div><div className="eyebrow">FULL COLLECTION</div><h3 id="orin-all-finds-heading">All {items.length} finds.</h3></div>
            {items.length > 0 && <button type="button" aria-expanded={showAllFinds} onClick={() => setShowAllFinds(value => !value)}>{showAllFinds ? 'Hide full collection' : `Browse all ${items.length} finds`}</button>}
            {!items.length && <p>The next completed collection will fill this space.</p>}
          </section>}
          {tab==='saved' && <section className="orin-saved-intro"><div className="eyebrow">READING LIST</div><h2>{items.length} saved {items.length === 1 ? 'find' : 'finds'}</h2><p>Ideas you kept for a closer look.</p></section>}
          {tab==='projects' ? <ReferenceProjectsCollection items={items} onShare={() => { setShareCategory(collectionCategories.projects); setShareDay(localDate()); setTab('share'); }}/> : tab==='books' ? <BooksCollection items={items} onShare={() => { setShareCategory(collectionCategories.books); setShareDay(localDate()); setTab('share'); }}/> : tab==='brain' ? <OrinBrain items={items} groups={data.digest?.groups || []} date={data.date || ''} sourceStatus={data.sourceStatus || []} availableDates={data.availableDates || []}/> : tab==='share' ? <section className="orin-share"><div className="eyebrow"><Share2 size={15}/> SHARE A SOURCE</div><h2>Save a link or PDF to ORIN.</h2><form onSubmit={submitShare}><label>Source URL<input type="url" disabled={sharePdfBusy || Boolean(sharePdf)} required={!sharePdf} value={shareUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={event => setShareUrl(event.target.value)}/></label><div className="orin-share-pdf"><label>Source PDF<span className="orin-share-pdf-hint">Text is extracted in your browser. Saving sends the text to your private ORIN space; the PDF file itself is not uploaded.</span><input type="file" accept="application/pdf,.pdf" disabled={sharePdfBusy} aria-label="Choose a PDF" onChange={handleSharePdf}/></label>{sharePdfBusy && <p role="status">Reading PDF…</p>}{sharePdf && <div className="orin-share-pdf-file"><FileText size={15}/><span>{sharePdf.name} · {sharePdf.text.length.toLocaleString()} characters</span><button type="button" onClick={clearSharePdf}>Remove</button></div>}</div><label>Digest date<input type="date" required value={shareDay} max={localDate()} onChange={event => setShareDay(event.target.value)}/></label><label>Category or segment<select value={shareCategory} onChange={event => setShareCategory(event.target.value)}><option value="">No category</option>{shareCategoryOptions.map(label => <option key={label} value={label}>{label}</option>)}</select></label><label>Note<textarea value={shareNote} maxLength={4000} placeholder="What is this, and why could it be useful?" onChange={event => setShareNote(event.target.value)}/></label><button className="button-primary" type="submit" disabled={shareBusy || sharePdfBusy || (!shareUrl && !sharePdf)}><Share2 size={15}/>{shareBusy ? 'Saving…' : 'Save source'}</button></form><p role="status">{shareMessage}</p></section> : <>
        {(tab === 'saved' || (tab === 'archive' && archiveDay) || (tab === 'digest' && showAllFinds)) && <>
        <div className="orin-filterbar"><div className="orin-source-filters">{['All',...sources].map(value=><button key={value} aria-pressed={source===value} onClick={()=>setSource(value)}>{displaySource(value)}</button>)}</div><label className="orin-search"><Search size={15}/><input placeholder="Find an idea…" aria-label="Search digest" value={search} onChange={event=>setSearch(event.target.value)}/></label><OrinCategoryManager categories={categories.filter(category => typeof category.label === 'string')} onAction={categoryAction}/></div>
          <div className="orin-items">{filtered.map(item=><article key={item.id} id={`orin-item-${item.id}`} tabIndex={-1} className={`orin-item ${item.read ? 'is-read' : ''}`}><div className="orin-item-meta"><span>{displaySource(item.source)}</span>{item.author && <span>{item.author}</span>}{item.publishedAt && <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString()}</time>}</div><h3>{itemLink(item) ? <a href={itemLink(item)} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={18}/></a> : item.title}</h3><OrinExcerpt text={item.excerpt} itemId={item.id} condensed={tab==="saved"}/>{item.ranking && <p className="orin-ranking"><span>{item.ranking.discovery ? 'Discovery' : 'Why this fits'}</span> {item.ranking.reason}</p>}{Object.keys(item.metrics || {}).length > 0 && <div className="orin-metrics">{Object.entries(item.metrics).map(([metric, value]) => <span key={metric}>{Number(value).toLocaleString()} {metric}</span>)}<span>observed at collection</span></div>}<div className="orin-item-bottom"><div className="orin-item-file"><OrinCategoryPicker item={item} categories={categories.map(category => category.label)} disabled={pending.has(item.id)} onSetCategory={value => { updateCategory(item, value); }} onCreateCategory={createCategory}/><div className="orin-topics">{item.topics?.map(topic=><span key={topic}>{topic}</span>)}</div></div><div className="orin-item-actions"><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'feedback',item.feedback===1 ? 0 : 1)} aria-pressed={item.feedback===1} aria-label="Recommend more like this"><ThumbsUp size={15}/>More like this</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'feedback',item.feedback===-1 ? 0 : -1)} aria-pressed={item.feedback===-1} aria-label="Recommend fewer like this"><ThumbsDown size={15}/>Less relevant</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'read')} aria-pressed={item.read} aria-label={item.read ? 'Mark unread' : 'Mark read'}><Check size={15}/>{item.read ? 'Read' : 'Mark read'}</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'saved')} aria-pressed={item.saved} aria-label={item.saved ? 'Remove from reading list' : 'Save to reading list'}><Bookmark size={15} fill={item.saved ? 'currentColor' : 'none'}/></button></div></div><OrinItemControls item={item} onUpdate={updated => contentChanged(updated)} onDelete={id => contentChanged(null, id)}/></article>)}</div>
          {!filtered.length && <div className="orin-state"><Compass size={27} strokeWidth={1.2}/><h3>{tab==='saved' ? 'Keep the ideas you want to return to.' : 'Nothing on the horizon just yet.'}</h3><p>{search || source!=='All' ? 'Try another search or source.' : tab==='saved' ? 'Save a find from your daily digest to add it here.' : 'The next completed collection will fill this space.'}</p></div>}
          {data.sourceStatus?.length > 0 && <details className="orin-source-status"><summary>Collection notes</summary>{data.digest?.rankingStatus && <p><strong>Selection</strong> — {data.digest.rankingStatus.message}</p>}{data.sourceStatus.map((status,index)=><p key={index}><strong>{displaySource(status.source)}</strong> — {status.message || status.status}</p>)}</details>}
        </>}
        </>}
        </>}
      </>}
      <footer className="orin-footer"><span>Follow the interesting threads.</span><span>AI systems / Research / Engineering</span></footer>
    </main>
  </div>;
}
