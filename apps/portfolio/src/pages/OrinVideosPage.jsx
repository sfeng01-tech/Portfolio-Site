import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Compass, ExternalLink, Lock, Play, Youtube as YoutubeIcon } from 'lucide-react';
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

export default function OrinVideosPage() {
  const { user, loading, error: authError, login } = useAuth();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'ORIN — YouTube videos';
    return () => { document.title = 'Sahil Faizal — Software Engineer & AI Systems'; };
  }, []);

  useEffect(() => {
    if (!user) { setItems([]); setBusy(false); return undefined; }
    const controller = new AbortController();
    setBusy(true); setError('');
    fetch('/api/orin/digest?kind=video', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({ error: 'Unable to load videos.' }));
        if (!response.ok || payload.error) throw new Error(payload.error || 'Unable to load videos.');
        setItems(payload.items || []);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [user]);

  const tiles = useMemo(
    () => items.map(item => ({ ...item, videoId: youtubeId(item.url), link: safeUrl(item.url) })),
    [items]
  );

  return (
    <div className="orin-shell">
      <div className="orin-topbar">
        <Link className="orin-icon" to="/orin" aria-label="Back to ORIN"><ArrowLeft size={17} /></Link>
        <span className="orin-private"><Lock size={12} /> PERSONAL SPACE</span>
      </div>
      <main id="main-content" className="orin-main">
        <section className="orin-videos">
          <div className="eyebrow"><YoutubeIcon size={15} /> YOUTUBE VIDEOS</div>
          <h2>Video shelf</h2>
          <p>Every YouTube link you save, in a tile view.</p>
          {loading ? <div className="orin-state" role="status">Opening your videos…</div> : !user ? (
            <section className="orin-gate">
              <div className="orin-lock"><Lock size={25} strokeWidth={1.4} /></div>
              <div className="eyebrow">JUST FOR YOU</div>
              <h2>Sign in to see your video shelf.</h2>
              <button className="button-primary" onClick={() => login('/orin/videos')}><YoutubeIcon size={17} /> Sign in with GitHub</button>
              {authError && <p role="alert" className="orin-error">{authError}</p>}
            </section>
          ) : (
            <>
              {error && <div role="alert" className="orin-error">{error}</div>}
              {busy ? <div className="orin-state" role="status">Loading videos…</div> : tiles.length ? (
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
                        <OrinItemControls item={item} captionOnly onUpdate={updated => setItems(previous => previous.map(current => current.id === updated.id ? updated : current))} onDelete={id => setItems(previous => previous.filter(current => current.id !== id))}/>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="orin-state"><Compass size={27} strokeWidth={1.2} /><h3>No videos yet.</h3><p>Share a YouTube link from the ORIN Share tab and it will appear here.</p></div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
