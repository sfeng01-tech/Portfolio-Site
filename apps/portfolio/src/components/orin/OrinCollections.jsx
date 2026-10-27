import React, { useMemo, useState } from 'react';
import { BookOpen, Calendar, ExternalLink, FileText, Github } from 'lucide-react';

const safeUrl = (value) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
};

const formatDate = (value) => {
  if (!value) return 'Added recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Added recently';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const repositoryName = (url) => {
  try {
    const parsed = new URL(url);
    const [owner, repository] = parsed.pathname.split('/').filter(Boolean);
    return owner && repository ? `${owner}/${repository.replace(/\.git$/, '')}` : parsed.hostname;
  } catch {
    return 'Reference project';
  }
};

export function ReferenceProjectsCollection({ items = [], onShare }) {
  if (!items.length) {
    return (
      <section className="orin-collection">
        <div className="eyebrow">REFERENCE PROJECTS</div>
        <h2>GitHub projects you want to keep close.</h2>
        <p>Share a repository link and tag it as “Reference Projects” to build this page.</p>
        {onShare && <button className="button-primary" type="button" onClick={onShare}>Add a project</button>}
      </section>
    );
  }

  return (
    <section className="orin-collection">
      <div className="eyebrow">REFERENCE PROJECTS</div>
      <h2>GitHub projects worth returning to.</h2>
      <div className="orin-collection-grid">
        {items.map((item) => {
          const link = safeUrl(item.url);
          return (
            <article key={item.id} className="orin-collection-card">
              <div className="orin-collection-card-head">
                <Github size={20} />
                <span>{repositoryName(item.url)}</span>
              </div>
              <h3>{item.title || 'Untitled reference'}</h3>
              <p>{item.excerpt}</p>
              <footer>
                <span><Calendar size={14} />{formatDate(item.publishedAt)}</span>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer">
                    Open <ExternalLink size={14} />
                  </a>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function BooksCollection({ items = [], onShare }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id || null);
  const selected = useMemo(
    () => items.find(item => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  );

  if (!items.length) {
    return (
      <section className="orin-collection">
        <div className="eyebrow">BOOKS</div>
        <h2>A quiet shelf for things you are reading.</h2>
        <p>Share a Google Drive link or PDF and tag it as “Books” to start the shelf.</p>
        {onShare && <button className="button-primary" type="button" onClick={onShare}>Add a book</button>}
      </section>
    );
  }

  return (
    <section className="orin-collection">
      <div className="eyebrow">BOOKS</div>
      <h2>Reading shelf</h2>
      <div className="orin-reader">
        <aside className="orin-reader-list" aria-label="Book list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected?.id === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <BookOpen size={16} />
              <span>{item.title || 'Untitled book'}</span>
            </button>
          ))}
        </aside>
        <article className="orin-reader-panel">
          <header>
            <div>
              <h3>{selected?.title || 'Untitled book'}</h3>
              <span><Calendar size={14} />{formatDate(selected?.publishedAt)}</span>
            </div>
            {safeUrl(selected?.url) && (
              <a href={safeUrl(selected.url)} target="_blank" rel="noopener noreferrer">
                Open source <ExternalLink size={14} />
              </a>
            )}
          </header>
          <p>{selected?.excerpt}</p>
          {selected?.contribution?.characters && (
            <footer>
              <FileText size={14} />
              <span>{selected.contribution.characters.toLocaleString()} characters captured</span>
            </footer>
          )}
        </article>
      </div>
    </section>
  );
}
