import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bookmark, Check, Compass, FileText, Github, Lock, LogOut, RefreshCw, Search, Share2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OrinBrain from '../components/orin/OrinBrain';
import OrinCategoryManager from '../components/orin/OrinCategoryManager';
import OrinCategoryPicker from '../components/orin/OrinCategoryPicker';
import OrinNotes from '../components/orin/OrinNotes';
import OrinReminders from '../components/orin/OrinReminders';
import { displaySource } from '../components/orin/brainGraph';
import './orin.css';

const MAX_PDF_BYTES = 40_000_000;
const loadPdfTools = () => import('../components/orin/pdfText');

const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
const displayDay = day => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const safeUrl = (url) => { try { const parsed = new URL(url); return parsed.protocol === 'https:' ? parsed.href : null; } catch { return null; } };

async function request(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...options?.headers } });
  const payload = await response.json().catch(() => ({ error: 'ORIN needs the server API. Run npm run build, then npm run dev:server for local development.' }));
  if (!response.ok || payload.error) throw new Error(payload.error || 'Unable to load ORIN.');
  return payload;
}

export default function OrinPage() {
  const { user, loading: authLoading, error: authError, login, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [archiveDay, setArchiveDay] = useState(null);
  const [source, setSource] = useState('All');
  const [tab, setTab] = useState('digest');
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
  const lastLoaded = useRef(0);
  useEffect(() => {
    document.title = 'ORIN — A world of exploration & study';
    return () => { document.title = 'Sahil Faizal — Software Engineer & AI Systems'; };
  }, []);
  useEffect(() => {
    if (!user) { setData(null); return; }
    // Notes and reminders are private panels of their own; the digest fetch is
    // not needed while either view is open.
    if (tab === 'notes' || tab === 'reminders') { setBusy(false); return; }
    const controller = new AbortController();
    setBusy(true); setError('');
    // The archive opens its own day without touching the digest tab's date,
    // so the daily digest always comes back to the latest one.
    const activeDate = tab === 'archive' ? (archiveDay || '') : date;
    const params = new URLSearchParams();
    if (activeDate) params.set('date', activeDate);
    if (tab === 'saved') params.set('saved', 'true');
    request(`/api/orin/digest?${params}`, { signal: controller.signal })
      .then(payload => { lastLoaded.current = Date.now(); setData(payload); })
      .catch(err => { if (err.name !== 'AbortError') { setData(null); setError(err.message); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [user, date, archiveDay, tab, revision]);

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
  const filtered = useMemo(() => items.filter(item =>
    (source === 'All' || item.source === source) &&
    `${item.title} ${item.excerpt} ${item.category || ''} ${(item.topics || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  ), [items, source, search]);

  async function updateItem(item, field, value = !item[field]) {
    if (pending.has(item.id)) return;
    setPending(previous => new Set(previous).add(item.id));
    try {
      await request('/api/orin/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, [field]: value }) });
      setData(previous => ({ ...previous, items: previous.items.map(current => current.id === item.id ? { ...current, [field]: value } : current).filter(current => tab !== 'saved' || current.saved) }));
    } catch (err) { setError(err.message); }
    finally { setPending(previous => { const next = new Set(previous); next.delete(item.id); return next; }); }
  }

  // Category edits stamp `categorySource: user` server-side, which both marks
  // the item as owner-curated and keeps a later model run from replacing it.
  async function updateCategory(item, value) {
    if (value === item.category) return;
    await updateItem(item, 'category', value);
    setData(previous => ({ ...previous, items: previous.items.map(current => current.id === item.id ? { ...current, category: value === null ? undefined : value, categorySource: value === null ? undefined : 'user' } : current).filter(current => tab !== 'saved' || current.saved) }));
  }

  async function createCategory(label) {
    const payload = await request('/api/orin/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label }) });
    setCategories(previous => previous.some(category => category.label === payload.label) ? previous : [...previous, { label: payload.label, items: 0 }].sort((a, b) => a.label.localeCompare(b.label)));
    return payload.label;
  }

  // Taxonomy deletions can act on the affected items server-side (unfile or
  // reassign); the revision bump refetches both the digest items and the
  // taxonomy so cleared mappings show immediately.
  async function categoryAction(label, action, to) {
    try {
      await request('/api/orin/categories', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, ...(action ? { action } : {}), ...(to ? { to } : {}) }) });
    } catch (err) { setError(err.message); }
    finally { setRevision(value => value + 1); }
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
    setShareBusy(true);
    setShareMessage('');
    try {
      const payload = await request('/api/orin/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sharePdf
          ? { pdf: sharePdf, note: shareNote, category: shareCategory || null, date: shareDay }
          : { url: shareUrl, note: shareNote, category: shareCategory || null, date: shareDay })
      });
      setShareUrl('');
      setSharePdf(null);
      setShareNote('');
      setShareCategory('');
      setArchiveDay(null);
      setTab('digest');
      setDate(payload.date);
      setShareMessage(`Saved to the ${displayDay(payload.date)} digest.`);
      setRevision(value => value + 1);
    } catch (err) {
      setShareMessage(err.message);
    } finally {
      setShareBusy(false);
    }
  }

  // The digest threads are shared by the daily digest tab and the archive
  // day view, so both render the same set of groups.
  const digestGroups = data?.digest?.groups?.length > 0 && <div className="orin-groups">{data.digest.groups.map((group,index)=><article key={`${group.title}-${index}`}><div className="eyebrow">THREAD {String(index+1).padStart(2,'0')}</div><h3>{group.title}</h3><p>{group.summary}</p><div>{group.urls?.map((url,i)=> safeUrl(url) && <a key={url} href={safeUrl(url)} target="_blank" rel="noopener noreferrer">Source {i+1} <ArrowUpRight size={12}/></a>)}</div></article>)}</div>;

  return <div className="orin-shell">
    <div className="orin-topbar"><span className="orin-private"><Lock size={12}/> PERSONAL SPACE</span>{user && <button onClick={logout} className="orin-icon" aria-label="Sign out"><LogOut size={17}/></button>}</div>
    <main id="main-content" className="orin-main">
      <div className="orin-intro"><div className="eyebrow"><Compass size={15}/> A WORLD OF EXPLORATION & STUDY</div><h1>ORIN<span>.</span></h1><p>A quieter place to follow your curiosity.</p></div>
      {authLoading ? <div className="orin-state" role="status">Opening your space…</div> : !user ? <section className="orin-gate"><div className="orin-lock"><Lock size={25} strokeWidth={1.4}/></div><div className="eyebrow">JUST FOR YOU</div><h2>Your daily window into<br/>what’s worth understanding.</h2><p>Research, ideas, and conversations from across AI and systems. Gathered in one private reading space.</p><button className="button-primary" disabled={Boolean(authError)} onClick={() => login('/orin')}><Github size={17}/> Sign in with GitHub <ArrowUpRight size={16}/></button><small>Access is restricted to approved GitHub accounts.</small>{authError && <p role="alert" className="orin-error">{authError}</p>}</section> : <>
        <div className="orin-toolbar"><div className="orin-tabs" role="tablist" aria-label="Reading view">{[['digest','Daily digest'],['archive','Archive'],['share','Share'],['brain','Live brain'],['saved','Reading list'],['notes','Notes'],['reminders','Reminders']].map(([value,label]) => <button key={value} role="tab" aria-selected={tab===value} onClick={() => {setTab(value);setArchiveDay(null);setSource('All');setShareMessage('');setError('');}}>{label}</button>)}</div><label className="orin-date">{(tab === 'digest' || tab === 'brain') && <><span className="sr-only">Digest date</span><input type="date" value={date || data?.date || localDate()} max={localDate()} onChange={event => setDate(event.target.value)}/></>}</label><button className="orin-icon" disabled={busy} onClick={() => setRevision(v=>v+1)} aria-label={tab === 'notes' ? '' : 'Reload digest'}><RefreshCw size={17} className={busy ? 'animate-spin' : ''}/></button></div>
        {error && <div role="alert" className="orin-error">{error}</div>}
        {tab === 'notes' ? <OrinNotes/> : tab === 'reminders' ? <OrinReminders/> : busy ? <div className="orin-state" role="status">Gathering your reading list…</div> : data && <>
          {tab==='archive' && <section className="orin-archive"><div className="eyebrow">DIGEST ARCHIVE</div>{archiveDay ? <>
            <button type="button" className="orin-archive-back" onClick={() => setArchiveDay(null)}>← Back to archive</button>
            <h2>{displayDay(archiveDay)} digest</h2>
            <p>{sources.length} source{sources.length === 1 ? '' : 's'} gathered this day.</p>
            {digestGroups}
          </> : <>
            <h2>{data.date ? `${displayDay(data.date)} digest` : 'No digests yet'}</h2>
            <p>Open a day to review every source gathered that day.</p>
            {data.availableDates?.length ? <ul>{data.availableDates.map(day=><li key={day}><button type="button" aria-current={day === data.date} onClick={() => {setArchiveDay(day);setSource('All');}}><span>{displayDay(day)}</span><span>{day === data.date ? `${sources.length} source${sources.length === 1 ? '' : 's'}` : 'Open'}</span></button></li>)}</ul> : <p className="orin-archive-empty">The first collector run will add dates here.</p>}
          </>}</section>}
          {tab==='digest' && <section className="orin-brief"><div className="eyebrow">THE DAILY BRIEF · {data.date || 'NO DIGEST YET'}</div><h2>{data.digest?.title || 'A little space for discovery.'}</h2><p>{data.digest?.summary || 'Your first digest will appear here after the collector completes a run.'}</p><div className="orin-counts"><span>{items.length} finds</span><span>{sources.length} sources</span><span>{items.filter(item=>!item.read).length} unread</span></div></section>}
          {tab==='digest' && digestGroups}
          {tab==='brain' ? <OrinBrain items={items} groups={data.digest?.groups || []} date={data.date || ''} sourceStatus={data.sourceStatus || []} availableDates={data.availableDates || []}/> : tab==='share' ? <section className="orin-share"><div className="eyebrow"><Share2 size={15}/> SHARE A SOURCE</div><h2>Add a link or a PDF to today’s digest.</h2><form onSubmit={submitShare}><label>Source URL{sharePdf && ' (optional when a PDF is selected)'}<input type="url" required={!sharePdf} value={shareUrl} placeholder="https://www.youtube.com/watch?v=…" onChange={event => setShareUrl(event.target.value)}/></label><div className="orin-share-pdf"><label>Source PDF<span className="orin-share-pdf-hint">Text is read in your browser; the file itself is never uploaded.</span><input type="file" accept="application/pdf,.pdf" disabled={sharePdfBusy} aria-label="Upload a PDF" onChange={handleSharePdf}/></label>{sharePdfBusy && <p role="status">Reading PDF…</p>}{sharePdf && <div className="orin-share-pdf-file"><FileText size={15}/><span>{sharePdf.name} · {sharePdf.text.length.toLocaleString()} characters</span><button type="button" onClick={clearSharePdf}>Remove</button></div>}</div><label>Digest date<input type="date" required value={shareDay} max={localDate()} onChange={event => setShareDay(event.target.value)}/></label><label>Category or segment<select value={shareCategory} onChange={event => setShareCategory(event.target.value)}><option value="">No category</option>{categories.map(category => <option key={category.label} value={category.label}>{category.label}</option>)}</select></label><label>Note<textarea value={shareNote} maxLength={4000} placeholder="What is this, and why could it be useful?" onChange={event => setShareNote(event.target.value)}/></label><button className="button-primary" type="submit" disabled={shareBusy || sharePdfBusy || (!shareUrl && !sharePdf)}><Share2 size={15}/>{shareBusy ? 'Saving…' : 'Add to digest'}</button></form><p role="status">{shareMessage}</p></section> : <>
        <div className="orin-filterbar"><div className="orin-source-filters">{['All',...sources].map(value=><button key={value} aria-pressed={source===value} onClick={()=>setSource(value)}>{displaySource(value)}</button>)}</div><label className="orin-search"><Search size={15}/><input placeholder="Find an idea…" aria-label="Search digest" value={search} onChange={event=>setSearch(event.target.value)}/></label><OrinCategoryManager categories={categories.filter(category => typeof category.label === 'string')} onAction={categoryAction}/></div>
          <div className="orin-items">{filtered.map(item=><article key={item.id} className={`orin-item ${item.read ? 'is-read' : ''}`}><div className="orin-item-meta"><span>{displaySource(item.source)}</span>{item.author && <span>{item.author}</span>}{item.publishedAt && <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString()}</time>}</div><h3>{safeUrl(item.url) ? <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={18}/></a> : item.title}</h3><p>{item.excerpt}</p>{item.ranking && <p className="orin-ranking"><span>{item.ranking.discovery ? 'Discovery' : 'Why this fits'}</span> {item.ranking.reason}</p>}{Object.keys(item.metrics || {}).length > 0 && <div className="orin-metrics">{Object.entries(item.metrics).map(([metric, value]) => <span key={metric}>{Number(value).toLocaleString()} {metric}</span>)}<span>observed at collection</span></div>}<div className="orin-item-bottom"><div className="orin-item-file"><OrinCategoryPicker item={item} categories={categories.map(category => category.label)} disabled={pending.has(item.id)} onSetCategory={value => { updateCategory(item, value); }} onCreateCategory={createCategory}/><div className="orin-topics">{item.topics?.map(topic=><span key={topic}>{topic}</span>)}</div></div><div className="orin-item-actions"><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'feedback',item.feedback===1 ? 0 : 1)} aria-pressed={item.feedback===1} aria-label="Recommend more like this"><ThumbsUp size={15}/>More like this</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'feedback',item.feedback===-1 ? 0 : -1)} aria-pressed={item.feedback===-1} aria-label="Recommend fewer like this"><ThumbsDown size={15}/>Less relevant</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'read')} aria-pressed={item.read} aria-label={item.read ? 'Mark unread' : 'Mark read'}><Check size={15}/>{item.read ? 'Read' : 'Mark read'}</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'saved')} aria-pressed={item.saved} aria-label={item.saved ? 'Remove from reading list' : 'Save to reading list'}><Bookmark size={15} fill={item.saved ? 'currentColor' : 'none'}/></button></div></div></article>)}</div>
          {!filtered.length && <div className="orin-state"><Compass size={27} strokeWidth={1.2}/><h3>{tab==='saved' ? 'Keep the ideas you want to return to.' : 'Nothing on the horizon just yet.'}</h3><p>{search || source!=='All' ? 'Try another search or source.' : tab==='saved' ? 'Save a find from your daily digest to add it here.' : 'The next completed collection will fill this space.'}</p></div>}
          {data.sourceStatus?.length > 0 && <details className="orin-source-status"><summary>Collection notes</summary>{data.digest?.rankingStatus && <p><strong>Selection</strong> — {data.digest.rankingStatus.message}</p>}{data.sourceStatus.map((status,index)=><p key={index}><strong>{displaySource(status.source)}</strong> — {status.message || status.status}</p>)}</details>}
        </>}
        </>}
      </>}
      <footer className="orin-footer"><span>Follow the interesting threads.</span><span>AI systems / Research / Engineering</span></footer>
    </main>
  </div>;
}
