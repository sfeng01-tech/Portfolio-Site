import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Bookmark, Check, Compass, Github, Lock, LogOut, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from '../components/ThemeToggle';
import './orin.css';

const sourceLabels = { x: 'X / Twitter', twitter: 'X / Twitter', linkedin: 'LinkedIn', reddit: 'Reddit', arxiv: 'arXiv', hackernews: 'Hacker News', google_news: 'Google News', threads: 'Threads', rss: 'Articles' };
const displaySource = (source) => sourceLabels[source] || source;
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
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
  const [source, setSource] = useState('All');
  const [tab, setTab] = useState('digest');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(new Set());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    document.title = 'ORIN — A world of exploration & study';
    return () => { document.title = 'Sahil Faizal — Software Engineer & AI Systems'; };
  }, []);
  useEffect(() => {
    if (!user) { setData(null); return; }
    const controller = new AbortController();
    setBusy(true); setError('');
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (tab === 'saved') params.set('saved', 'true');
    request(`/api/orin/digest?${params}`, { signal: controller.signal })
      .then(setData)
      .catch(err => { if (err.name !== 'AbortError') { setData(null); setError(err.message); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [user, date, tab, revision]);

  const items = data?.items || [];
  const sources = [...new Set(items.map(item => item.source))];
  const filtered = useMemo(() => items.filter(item =>
    (source === 'All' || item.source === source) &&
    `${item.title} ${item.excerpt} ${(item.topics || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  ), [items, source, search]);

  async function updateItem(item, field) {
    if (pending.has(item.id)) return;
    setPending(previous => new Set(previous).add(item.id));
    try {
      await request('/api/orin/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, [field]: !item[field] }) });
      setData(previous => ({ ...previous, items: previous.items.map(current => current.id === item.id ? { ...current, [field]: !current[field] } : current).filter(current => tab !== 'saved' || current.saved) }));
    } catch (err) { setError(err.message); }
    finally { setPending(previous => { const next = new Set(previous); next.delete(item.id); return next; }); }
  }

  return <div className="orin-shell">
    <header className="orin-header"><Link to="/" className="orin-back"><ArrowLeft size={15}/> Portfolio</Link><span className="orin-private"><Lock size={12}/> PERSONAL SPACE</span><ThemeToggle/>{user && <button onClick={logout} className="orin-icon" aria-label="Sign out"><LogOut size={17}/></button>}</header>
    <main id="main-content" className="orin-main">
      <div className="orin-intro"><div className="eyebrow"><Compass size={15}/> A WORLD OF EXPLORATION & STUDY</div><h1>ORIN<span>.</span></h1><p>A quieter place to follow your curiosity.</p></div>
      {authLoading ? <div className="orin-state" role="status">Opening your space…</div> : !user ? <section className="orin-gate"><div className="orin-lock"><Lock size={25} strokeWidth={1.4}/></div><div className="eyebrow">JUST FOR YOU</div><h2>Your daily window into<br/>what’s worth understanding.</h2><p>Research, ideas, and conversations from across AI and systems. Gathered in one private reading space.</p><button className="button-primary" disabled={Boolean(authError)} onClick={() => login('/orin')}><Github size={17}/> Sign in with GitHub <ArrowUpRight size={16}/></button><small>Access is restricted to the portfolio owner’s GitHub account.</small>{authError && <p role="alert" className="orin-error">{authError}</p>}</section> : <>
        <div className="orin-toolbar"><div className="orin-tabs" role="tablist" aria-label="Reading view">{[['digest','Daily digest'],['saved','Reading list']].map(([value,label]) => <button key={value} role="tab" aria-selected={tab===value} onClick={() => {setTab(value);setSource('All');}}>{label}</button>)}</div><label className="orin-date">{tab === 'digest' && <><span className="sr-only">Digest date</span><input type="date" value={date || data?.date || localDate()} max={localDate()} onChange={event => setDate(event.target.value)}/></>}</label><button className="orin-icon" disabled={busy} onClick={() => setRevision(v=>v+1)} aria-label="Reload digest"><RefreshCw size={17} className={busy ? 'animate-spin' : ''}/></button></div>
        {error && <div role="alert" className="orin-error">{error}</div>}
        {busy ? <div className="orin-state" role="status">Gathering your reading list…</div> : data && <>
          {tab==='digest' && <section className="orin-brief"><div className="eyebrow">THE DAILY BRIEF · {data.date || 'NO DIGEST YET'}</div><h2>{data.digest?.title || 'A little space for discovery.'}</h2><p>{data.digest?.summary || 'Your first digest will appear here after the collector completes a run.'}</p><div className="orin-counts"><span>{items.length} finds</span><span>{sources.length} sources</span><span>{items.filter(item=>!item.read).length} unread</span></div></section>}
          {tab==='digest' && data.digest?.groups?.length > 0 && <div className="orin-groups">{data.digest.groups.map((group,index)=><article key={`${group.title}-${index}`}><div className="eyebrow">THREAD {String(index+1).padStart(2,'0')}</div><h3>{group.title}</h3><p>{group.summary}</p><div>{group.urls?.map((url,i)=> safeUrl(url) && <a key={url} href={safeUrl(url)} target="_blank" rel="noopener noreferrer">Source {i+1} <ArrowUpRight size={12}/></a>)}</div></article>)}</div>}
        <div className="orin-filterbar"><div className="orin-source-filters">{['All',...sources].map(value=><button key={value} aria-pressed={source===value} onClick={()=>setSource(value)}>{displaySource(value)}</button>)}</div><label className="orin-search"><Search size={15}/><input placeholder="Find an idea…" aria-label="Search digest" value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
          <div className="orin-items">{filtered.map(item=><article key={item.id} className={`orin-item ${item.read ? 'is-read' : ''}`}><div className="orin-item-meta"><span>{displaySource(item.source)}</span>{item.author && <span>{item.author}</span>}{item.publishedAt && <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString()}</time>}</div><h3>{safeUrl(item.url) ? <a href={safeUrl(item.url)} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={18}/></a> : item.title}</h3><p>{item.excerpt}</p>{Object.keys(item.metrics || {}).length > 0 && <div className="orin-metrics">{Object.entries(item.metrics).map(([metric, value]) => <span key={metric}>{Number(value).toLocaleString()} {metric}</span>)}<span>observed at collection</span></div>}<div className="orin-item-bottom"><div className="orin-topics">{item.topics?.map(topic=><span key={topic}>{topic}</span>)}</div><div className="orin-item-actions"><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'read')} aria-pressed={item.read} aria-label={item.read ? 'Mark unread' : 'Mark read'}><Check size={15}/>{item.read ? 'Read' : 'Mark read'}</button><button disabled={pending.has(item.id)} onClick={()=>updateItem(item,'saved')} aria-pressed={item.saved} aria-label={item.saved ? 'Remove from reading list' : 'Save to reading list'}><Bookmark size={15} fill={item.saved ? 'currentColor' : 'none'}/></button></div></div></article>)}</div>
          {!filtered.length && <div className="orin-state"><Compass size={27} strokeWidth={1.2}/><h3>{tab==='saved' ? 'Keep the ideas you want to return to.' : 'Nothing on the horizon just yet.'}</h3><p>{search || source!=='All' ? 'Try another search or source.' : tab==='saved' ? 'Save a find from your daily digest to add it here.' : 'The next completed collection will fill this space.'}</p></div>}
          {data.sourceStatus?.length > 0 && <details className="orin-source-status"><summary>Collection notes</summary>{data.sourceStatus.map((status,index)=><p key={index}><strong>{displaySource(status.source)}</strong> — {status.message || status.status}</p>)}</details>}
        </>}
      </>}
      <footer className="orin-footer"><span>Follow the interesting threads.</span><span>AI systems / Research / Engineering</span></footer>
    </main>
  </div>;
}
