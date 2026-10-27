import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Compass, ExternalLink, Lock, Play, Search, Youtube as YoutubeIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OrinItemControls from '../components/orin/OrinItemControls';
import { youtubeId } from '../../server/youtube.js';
import './orin.css';

const safeUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
};

const thumbUrl = (id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null);

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function OrinVideosShelf({ embedded = false }) {
  const { user, loading, error: authError, login } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [total, setTotal] = useState(0);
  const [revision, setRevision] = useState(0);
  const browseRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setQuery(search.trim()); }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user) { setItems([]); setTotal(0); setBusy(false); return undefined; }
    const controller = new AbortController();
    setBusy(true); setError('');
    const params = new URLSearchParams({ kind: 'video', page: String(page) });
    if (query) params.set('q', query);
    fetch(`/api/orin/digest?${params}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({ error: 'Unable to load videos.' }));
        if (!response.ok || payload.error) throw new Error(payload.error || 'Unable to load videos.');
        if (page > 1 && payload.total <= (page - 1) * payload.pageSize) {
          setPage(page - 1);
          return;
        }
        setItems(payload.items || []);
        setTotal(payload.total || 0);
        setPageSize(payload.pageSize || 24);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [user, query, page, revision]);

  const tiles = useMemo(
    () => items.map(item => ({ ...item, videoId: youtubeId(item.url), link: safeUrl(item.url) })),
    [items]
  );
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const changePage = nextPage => {
    setPage(nextPage);
    browseRef.current?.scrollIntoView({ block: 'start' });
  };

  return <section className="orin-videos">
          <div className="eyebrow"><YoutubeIcon size={15} /> YOUTUBE VIDEOS</div>
          <h2>Video shelf</h2>
          <p>Every YouTube link you save, in a tile view.</p>
          {loading ? <div className="orin-state" role="status">Opening your videos…</div> : !user ? (
            <section className="orin-gate">
              <div className="orin-lock"><Lock size={25} strokeWidth={1.4} /></div>
              <div className="eyebrow">JUST FOR YOU</div>
              <h2>Sign in to see your video shelf.</h2>
              <button className="button-primary" onClick={() => login(embedded ? '/orin' : '/orin/videos')}><YoutubeIcon size={17} /> Sign in with GitHub</button>
              {authError && <p role="alert" className="orin-error">{authError}</p>}
            </section>
          ) : (
            <>
              <div className="orin-video-tools" ref={browseRef}>
                <label className="orin-video-search"><Search size={17} /><input type="search" aria-label="Search videos" placeholder="Search titles or creators…" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} /></label>
                <p role="status">{busy ? 'Searching videos…' : error ? 'Results unavailable' : total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} videos` : query ? 'No matching videos' : 'No videos yet'}</p>
              </div>
              {error && <div role="alert" className="orin-error">{error}</div>}
              {busy ? <div className="orin-state" role="status">Loading videos…</div> : error ? null : tiles.length ? (
                <div className="orin-video-grid">
                  {tiles.map(item => (
                    <article key={item.id} className="orin-video-tile">
                      <a className="orin-video-thumb" href={item.link || '#'} target={item.link ? '_blank' : undefined} rel={item.link ? 'noopener noreferrer' : undefined} aria-label={item.title}>
                        {item.videoId ? <img src={thumbUrl(item.videoId)} alt="" loading="lazy" /> : <Compass size={27} strokeWidth={1.2} />}
                        <span><Play size={22} /></span>
                      </a>
                      <div className="orin-video-copy">
                        <h3><a href={item.link || '#'} target={item.link ? '_blank' : undefined} rel={item.link ? 'noopener noreferrer' : undefined}>{item.title}</a></h3>
                        <p>{item.author || 'Shared by you'}</p>
                        <div className="orin-video-meta">
                          <span><Calendar size={14} />{formatDate(item.publishedAt || item.collectedAt)}</span>
                          {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer">Open <ExternalLink size={14} /></a>}
                        </div>
                        <OrinItemControls item={item} captionOnly onUpdate={updated => { setItems(previous => previous.map(current => current.id === updated.id ? updated : current)); setRevision(value => value + 1); }} onDelete={id => { setItems(previous => previous.filter(current => current.id !== id)); setRevision(value => value + 1); }}/>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="orin-state"><Compass size={27} strokeWidth={1.2} /><h3>{query ? 'No videos match that search.' : 'No videos yet.'}</h3><p>{query ? 'Try another title or creator.' : 'Share a YouTube link from the ORIN Share tab and it will appear here.'}</p>{query && <button type="button" onClick={() => setSearch('')}>Clear search</button>}</div>
              )}
              {!busy && !error && total > pageSize && <nav className="orin-video-pages" aria-label="Video pages"><button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1}><ChevronLeft size={16} /> Previous</button><span>Page {page} of {pageCount}</span><button type="button" onClick={() => changePage(page + 1)} disabled={page >= pageCount}>Next <ChevronRight size={16} /></button></nav>}
            </>
          )}
  </section>;
}

export default function OrinVideosPage() {
  useEffect(() => {
    document.title = 'ORIN — YouTube videos';
    return () => { document.title = 'Sahil Faizal — Software Engineer & AI Systems'; };
  }, []);

  return <div className="orin-shell">
    <div className="orin-topbar orin-topbar--videos">
      <Link className="orin-icon" to="/orin" aria-label="Back to ORIN"><ArrowLeft size={17} /></Link>
      <span className="orin-private"><Lock size={12} /> PERSONAL SPACE</span>
    </div>
    <main id="main-content" className="orin-main"><OrinVideosShelf /></main>
  </div>;
}
