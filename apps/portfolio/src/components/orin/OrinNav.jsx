import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive, ArrowUpRight, Bell, Bookmark, BookOpen, Brain, Command, Compass,
  FileText, FlaskConical, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen,
  Plus, Search, Share2, Sparkles, Video, X
} from 'lucide-react';
import './OrinNav.css';

// One source of truth for ORIN destinations. `group` is the rail heading and
// the palette category; `short` is the mobile label; `primary` pins an item to
// the mobile bar. Adding a tab here is enough to make it appear everywhere.
export const ORIN_TABS = [
  { value: 'ask', label: 'Ask ORIN', short: 'Ask', group: 'Today', icon: Sparkles, primary: true },
  { value: 'digest', label: 'Daily digest', short: 'Today', group: 'Today', icon: Compass, primary: true },
  { value: 'archive', label: 'Archive', group: 'Today', icon: Archive },
  { value: 'saved', label: 'Reading list', short: 'Saved', group: 'Today', icon: Bookmark, primary: true },
  { value: 'projects', label: 'Reference Projects', group: 'Library', icon: LayoutGrid },
  { value: 'books', label: 'Books', group: 'Library', icon: BookOpen },
  { value: 'videos', label: 'Videos', group: 'Library', icon: Video },
  { value: 'research', label: 'Investigations', short: 'Research', group: 'Research', icon: FlaskConical, primary: true },
  { value: 'notes', label: 'Notes', group: 'Research', icon: FileText },
  { value: 'reminders', label: 'Reminders', group: 'Research', icon: Bell },
  { value: 'brain', label: 'Live brain', short: 'Brain', group: 'Brain', icon: Brain },
  { value: 'share', label: 'Save a source', group: 'Capture', icon: Share2 }
];

const GROUPS = ['Today', 'Library', 'Research', 'Brain'];
const PRIMARY = ORIN_TABS.filter(tab => tab.primary);
const STORAGE_KEY = 'orin-rail-collapsed';

export default function OrinNav({ active, onSelect, onSignOut, researchCount = 0 }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const paletteInput = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* Rail still works without storage. */ }
  }, [collapsed]);

  // Cmd/Ctrl+K is the fast path to any section; Escape closes every overlay.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery('');
    const frame = requestAnimationFrame(() => paletteInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [paletteOpen]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ORIN_TABS;
    return ORIN_TABS.filter(tab => `${tab.label} ${tab.group}`.toLowerCase().includes(needle));
  }, [query]);

  function choose(value) {
    onSelect(value);
    setPaletteOpen(false);
    setMoreOpen(false);
  }

  const link = (tab, className = 'orin-rail-link') => {
    const Icon = tab.icon;
    return <button key={tab.value} type="button" className={className}
      aria-current={active === tab.value ? 'page' : undefined}
      title={tab.label} onClick={() => choose(tab.value)}>
      <Icon size={17} strokeWidth={1.6}/>
      <span>{tab.label}</span>
      {tab.value === 'research' && researchCount > 0 && <em className="orin-rail-badge">{researchCount}</em>}
    </button>;
  };

  return <>
    <aside className={`orin-rail ${collapsed ? 'is-collapsed' : ''}`} aria-label="ORIN sections">
      <div className="orin-rail-top">
        <Link to="/orin" className="orin-rail-brand" aria-label="ORIN home" onClick={() => choose('digest')}>{collapsed ? <>O<span>.</span></> : <>ORIN<span>.</span></>}</Link>
        <button type="button" className="orin-rail-collapse" aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>
          {collapsed ? <PanelLeftOpen size={16}/> : <PanelLeftClose size={16}/>}
        </button>
      </div>

      <button type="button" className="orin-rail-capture" onClick={() => choose('share')} title="Save a source">
        <Plus size={16}/><span>Save a source</span>
      </button>

      <nav className="orin-rail-nav">
        {GROUPS.map(group => {
          const tabs = ORIN_TABS.filter(tab => tab.group === group);
          if (!tabs.length) return null;
          return <div className="orin-rail-group" key={group}>
            <span className="orin-rail-label">{group}</span>
            <ul>{tabs.map(tab => <li key={tab.value}>{link(tab)}</li>)}</ul>
          </div>;
        })}
      </nav>

      <div className="orin-rail-foot">
        <Link to="/" className="orin-rail-link" title="Sahil Faizal portfolio">
          <ArrowUpRight size={17} strokeWidth={1.6}/><span>Portfolio</span>
        </Link>
        <button type="button" className="orin-rail-link" onClick={onSignOut} title="Sign out">
          <LogOut size={17} strokeWidth={1.6}/><span>Sign out</span>
        </button>
        <span className="orin-rail-hint"><Command size={11}/> K to jump</span>
      </div>
    </aside>

    <nav className="orin-mobilebar" aria-label="ORIN sections">
      {PRIMARY.map(tab => {
        const Icon = tab.icon;
        return <button key={tab.value} type="button" aria-current={active === tab.value ? 'page' : undefined}
          onClick={() => choose(tab.value)}>
          <Icon size={19} strokeWidth={1.6}/><span>{tab.short}</span>
        </button>;
      })}
      <button type="button" aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
        <Menu size={19} strokeWidth={1.6}/><span>More</span>
      </button>
    </nav>

    {moreOpen && <div className="orin-overlay" onClick={() => setMoreOpen(false)}>
      <div className="orin-sheet" role="dialog" aria-modal="true" aria-label="All ORIN sections" onClick={event => event.stopPropagation()}>
        <header>
          <span className="eyebrow">ORIN</span>
          <button type="button" className="orin-overlay-close" onClick={() => setMoreOpen(false)} aria-label="Close sections"><X size={18}/></button>
        </header>
        <div className="orin-sheet-grid">
          {ORIN_TABS.map(tab => {
            const Icon = tab.icon;
            return <button key={tab.value} type="button" aria-current={active === tab.value ? 'page' : undefined} onClick={() => choose(tab.value)}>
              <Icon size={18} strokeWidth={1.6}/><span>{tab.label}</span><small>{tab.group}</small>
            </button>;
          })}
        </div>
        <footer>
          <Link to="/" onClick={() => setMoreOpen(false)}><ArrowUpRight size={16}/> Portfolio</Link>
          <button type="button" onClick={onSignOut}><LogOut size={16}/> Sign out</button>
        </footer>
      </div>
    </div>}

    {paletteOpen && <div className="orin-overlay orin-overlay--palette" onClick={() => setPaletteOpen(false)}>
      <div className="orin-palette" role="dialog" aria-modal="true" aria-label="Jump to an ORIN section" onClick={event => event.stopPropagation()}>
        <label className="orin-palette-search">
          <Search size={16}/>
          <input ref={paletteInput} type="search" value={query} maxLength={60} placeholder="Jump to a section…"
            aria-label="Search ORIN sections" onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && results.length) { event.preventDefault(); choose(results[0].value); }
            }}/>
          <kbd>Esc</kbd>
        </label>
        {results.length ? <ul>
          {results.map(tab => {
            const Icon = tab.icon;
            return <li key={tab.value}>
              <button type="button" aria-current={active === tab.value ? 'page' : undefined} onClick={() => choose(tab.value)}>
                <Icon size={16} strokeWidth={1.6}/><span>{tab.label}</span><small>{tab.group}</small>
              </button>
            </li>;
          })}
        </ul> : <p className="orin-palette-empty">No sections match “{query.trim()}”.</p>}
      </div>
    </div>}
  </>;
}
