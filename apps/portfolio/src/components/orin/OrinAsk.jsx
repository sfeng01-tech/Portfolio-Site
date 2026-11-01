import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, BookmarkPlus, Check, Copy, CornerDownLeft, MessageSquarePlus,
  Search, Sparkles, Trash2, AlertTriangle, History, FlaskConical, Paperclip, X, ChevronDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OrinAsk.css';
import { researchHandoff } from './exploration';
import { filterSearchResults, publicationDay, searchPreview } from './searchResults';

const MAX_QUESTION = 2000;
const TIER_ORDER = ['custom', 'value', 'balanced', 'fast', 'premium'];
const TIER_LABELS = {
  custom: 'Configured', value: 'Best value', balanced: 'Balanced', fast: 'Fast', premium: 'Premium'
};
const EFFORT_LABELS = {
  auto: 'Auto', none: 'None', minimal: 'Minimal', low: 'Low',
  medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max'
};
const formatPrice = value => Number.isFinite(value) ? `$${value.toFixed(value < 0.1 ? 3 : 2)}` : null;
const formatContext = value => {
  if (!Number.isFinite(value)) return null;
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions < 1.05 ? Math.round(millions) : millions.toFixed(1)}M`;
  }
  return `${Math.round(value / 1000)}K`;
};
const SUGGESTIONS = [
  'Summarize the key ideas I saved this week.',
  'What have I saved about AI agents?',
  'Compare the arguments across my saved research.',
];

const safeUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
};
const escapeHtml = value => String(value || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const titleFrom = question => (question.length > 90 ? `${question.slice(0, 87).trimEnd()}…` : question);
const relative = iso => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const methodLabel = method => ({
  selected: 'Selected sources',
  hybrid: 'Semantic + keyword search',
  lexical: 'Keyword search',
  fallback: 'Library scan',
  empty: 'No searchable words'
}[method] || 'Library search');

async function json(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...options?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw Object.assign(new Error(payload.error || 'ORIN could not complete that request.'), { status: response.status });
  }
  return payload;
}

// Read the server's SSE frames without assuming one network chunk equals one
// event. Anything that is not a data line is ignored, so comments and blank
// keep-alives are harmless.
async function readEvents(response, onEvent) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The answer stream was empty.');
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('');
      if (!data) continue;
      try { onEvent(JSON.parse(data)); } catch { /* Ignore a malformed frame and keep the stream alive. */ }
    }
  }
}

function CitationText({ text, sources, invalid, onCite }) {
  const pieces = useMemo(() => String(text || '').split(/(\[\d{1,2}\])/g), [text]);
  const available = new Set((sources || []).map(source => source.ref));
  return <>{pieces.map((piece, index) => {
    const match = piece.match(/^\[(\d{1,2})\]$/);
    if (!match) return <React.Fragment key={index}>{piece}</React.Fragment>;
    const ref = Number(match[1]);
    const missing = invalid.includes(ref) || !available.has(ref);
    return <button key={index} type="button" className={`orin-ask-cite ${missing ? 'is-invalid' : ''}`}
      title={missing ? `Source ${ref} was not in the retrieved library` : `Jump to source ${ref}`}
      aria-label={`Source ${ref}${missing ? ' (unavailable)' : ''}`}
      onClick={() => !missing && onCite(ref)}>{ref}</button>;
  })}</>;
}

function SourceCards({ message, onCite }) {
  if (!message.sources?.length) return null;
  return <ol className="orin-ask-sources" aria-label="Sources used in this answer">
    {message.sources.map(source => {
      const link = safeUrl(source.url);
      return <li key={source.ref} id={`orin-ask-source-${message.key}-${source.ref}`} tabIndex={-1}
        className={message.highlight === source.ref ? 'is-highlighted' : ''}>
        <span className="orin-ask-source-ref">{source.ref}</span>
        <div className="orin-ask-source-body">
          <div className="orin-ask-source-meta">
            <span>{source.kind === 'note' ? 'Your note' : (source.origin || 'Saved item')}</span>
            {source.category && <span>{source.category}</span>}
          </div>
          {link
            ? <a href={link} target="_blank" rel="noopener noreferrer">{source.title || 'Untitled source'}<ArrowUpRight size={13}/></a>
            : <span className="orin-ask-source-title">{source.title || 'Untitled note'}</span>}
          {source.snippet && <p>{source.snippet}</p>}
        </div>
        <button type="button" className="orin-ask-source-jump" onClick={() => onCite(source.ref)} aria-label={`Show citation ${source.ref}`}>
          <CornerDownLeft size={13}/>
        </button>
      </li>;
    })}
  </ol>;
}

export default function OrinAsk({ workspace, onWorkspaceChange, onResearch }) {
  const { expireSession } = useAuth();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const { question, mode, sources: selectedSources } = workspace;
  const setQuestion = value => onWorkspaceChange(current => ({ ...current, question: value }));
  const setMode = value => { cancelSearch(); setError(''); onWorkspaceChange(current => ({ ...current, mode: value })); };
  const [searchResult, setSearchResult] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const searchAbort = useRef(null);
  const [searchMode, setSearchMode] = useState('hybrid');
  const [searchDelayed, setSearchDelayed] = useState(false);
  const [searchStatus, setSearchStatus] = useState('');
  const [resultFilters, setResultFilters] = useState({ source: '', after: '', before: '', sort: 'relevance' });
  const [visibleResults, setVisibleResults] = useState(20);
  const resultItems = searchResult?.items || [];
  const matchingResults = useMemo(() => filterSearchResults(resultItems, resultFilters), [resultItems, resultFilters]);
  const resultSources = [...new Set(resultItems.map(item => item.source).filter(Boolean))].sort();
  function changeResultFilter(key, value) {
    setResultFilters(current => ({ ...current, [key]: value })); setVisibleResults(20);
  }
  function cancelSearch() {
    if (!searchAbort.current) return;
    searchAbort.current?.abort(); searchAbort.current = null;
    setSearchBusy(false); setSearchDelayed(false); setSearchStatus('Search canceled.');
  }
  useEffect(() => {
    if (!searchBusy) return undefined;
    const timer = setTimeout(() => setSearchDelayed(true), 5000);
    return () => clearTimeout(timer);
  }, [searchBusy]);
  const isSearching = mode === 'search';
  const isResearching = mode === 'research';
  function toggleSource(item) {
    onWorkspaceChange(current => ({ ...current, sources: current.sources.some(source => source.id === item.id)
      ? current.sources.filter(source => source.id !== item.id)
      : current.sources.length < 10 ? [...current.sources, item] : current.sources }));
  }
  function researchFrom(message) {
    const index = thread.findIndex(entry => entry.key === message.key);
    const prompt = [...thread.slice(0, index)].reverse().find(entry => entry.role === 'user')?.content || question;
    onResearch(researchHandoff(prompt, message.sources || []));
  }
  async function searchLibrary() {
    const query = question.trim();
    if (query.length < 2 || query.length > 200) { setError('Search must be 2–200 characters.'); return; }
    searchAbort.current?.abort();
    const controller = new AbortController(); searchAbort.current = controller;
    setSearchBusy(true); setSearchDelayed(false); setSearchStatus(''); setError(''); setSearchResult(null); setSearchedQuery(query);
    setVisibleResults(20); setResultFilters({ source: '', after: '', before: '', sort: 'relevance' });
    try {
      const result = await json('/api/orin/search', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, searchMode }) });
      if (searchAbort.current === controller && !controller.signal.aborted) setSearchResult(result);
    } catch (err) { if (searchAbort.current === controller && !controller.signal.aborted && err.name !== 'AbortError') report(err); }
    finally { if (searchAbort.current === controller) { searchAbort.current = null; setSearchBusy(false); setSearchDelayed(false); } }
  }
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [capabilities, setCapabilities] = useState(null);
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('auto');
  const [modelOpen, setModelOpen] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingKey, setSavingKey] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [activeConversation, setActiveConversation] = useState('');
  const abort = useRef(null);
  const threadEnd = useRef(null);
  const composer = useRef(null);
  const modelBar = useRef(null);
  const modelTrigger = useRef(null);
  const modelPopover = useRef(null);

  const report = useCallback(err => {
    if (err?.status === 401) { expireSession(); return; }
    setError(err.message);
  }, [expireSession]);

  const loadConversations = useCallback(async () => {
    try {
      const payload = await json('/api/orin/ask');
      setConversations(payload.conversations || []);
      setMigrationRequired(Boolean(payload.migrationRequired));
      if (payload.capabilities) setCapabilities(payload.capabilities);
    } catch (err) {
      // History is optional; a missing table must not block asking.
      if (err.status === 401) report(err);
    }
  }, [report]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => () => { abort.current?.abort(); searchAbort.current?.abort(); }, []);

  // Restore the last model/effort choice, but only after the server tells us
  // which models this deployment allows.
  useEffect(() => {
    if (!capabilities?.models?.length) return;
    let savedModel = '';
    let savedEffort = 'auto';
    try {
      savedModel = localStorage.getItem('orin-ask-model') || '';
      savedEffort = localStorage.getItem('orin-ask-effort') || 'auto';
    } catch { /* Selection still works without storage. */ }
    const chosen = capabilities.models.find(entry => entry.id === savedModel)
      || capabilities.models.find(entry => entry.id === capabilities.defaultModel)
      || capabilities.models[0];
    setModel(current => current || chosen.id);
    setEffort(current => {
      if (current !== 'auto') return current;
      return ['auto', ...(chosen.efforts || [])].includes(savedEffort) ? savedEffort : 'auto';
    });
  }, [capabilities]);

  useEffect(() => {
    try { if (model) localStorage.setItem('orin-ask-model', model); } catch { /* Non-fatal. */ }
  }, [model]);
  useEffect(() => {
    try { localStorage.setItem('orin-ask-effort', effort); } catch { /* Non-fatal. */ }
  }, [effort]);

  // The model menu is a non-modal popover: outside click closes it, Escape
  // returns focus to the trigger, and the selected option receives focus.
  useEffect(() => {
    if (!modelOpen) return undefined;
    const onPointerDown = event => {
      if (!modelBar.current?.contains(event.target)) setModelOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setModelOpen(false);
        modelTrigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    const frame = requestAnimationFrame(() => {
      const active = modelPopover.current?.querySelector('.orin-ask-model-option.is-active');
      const first = modelPopover.current?.querySelector('button');
      (active || first)?.focus();
    });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [modelOpen]);

  const selectedModel = useMemo(
    () => capabilities?.models?.find(entry => entry.id === model) || capabilities?.models?.[0] || null,
    [capabilities, model]
  );
  const modelsByTier = useMemo(() => TIER_ORDER
    .map(tier => ({ tier, label: TIER_LABELS[tier], models: (capabilities?.models || []).filter(entry => entry.tier === tier) }))
    .filter(group => group.models.length), [capabilities]);
  const effortChoices = selectedModel?.efforts || [];
  const modelName = useCallback(id => capabilities?.models?.find(entry => entry.id === id)?.label || id, [capabilities]);
  const effortName = value => EFFORT_LABELS[value] || value;
  const effectiveEffort = effort === 'auto' ? selectedModel?.defaultEffort : effort;
  const compactPriceLabel = selectedModel && Number.isFinite(selectedModel.promptPerM)
    ? `${formatPrice(selectedModel.promptPerM)} / ${formatPrice(selectedModel.completionPerM)} per 1M`
    : null;
  const contextLabel = formatContext(selectedModel?.context);

  function chooseModel(id) {
    setModel(id);
    const next = capabilities?.models?.find(entry => entry.id === id);
    if (effort !== 'auto' && !next?.efforts?.includes(effort)) setEffort('auto');
  }

  function closeModelMenu() {
    setModelOpen(false);
    modelTrigger.current?.focus();
  }

  const updateAssistant = useCallback((key, patch) => {
    setThread(current => current.map(message => message.key === key ? { ...message, ...patch } : message));
  }, []);

  function reset() {
    abort.current?.abort();
    setThread([]);
    setConversationId(null);
    setActiveConversation('');
    setError('');
    setNotice('');
    setBusy(false);
    setModelOpen(false);
    onWorkspaceChange(current => ({ ...current, question: '', sources: [] }));
    composer.current?.focus();
  }

  async function openConversation(id) {
    if (busy) abort.current?.abort();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload = await json(`/api/orin/ask?conversationId=${encodeURIComponent(id)}`);
      const messages = [];
      for (const message of payload.messages || []) {
        messages.push({
          key: message.id,
          role: message.role,
          content: message.content || '',
          sources: message.sources || [],
          citations: Array.isArray(message.citations) ? message.citations : [],
          invalidCitations: [],
          model: message.model || '',
          effort: message.reasoningEffort || '',
          done: true
        });
      }
      onWorkspaceChange(current => ({ ...current, mode: 'ask', sources: [], question: '' }));
      setHistoryOpen(false);
      setThread(messages);
      setConversationId(payload.conversation?.id || id);
      setActiveConversation(payload.conversation?.id || id);
      requestAnimationFrame(() => threadEnd.current?.scrollIntoView({ block: 'end' }));
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeConversation(id, event) {
    event.stopPropagation();
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await json(`/api/orin/ask?conversationId=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      setConversations(current => current.filter(conversation => conversation.id !== id));
      if (conversationId === id) reset();
    } catch (err) { report(err); }
  }

  async function send(event, preset) {
    event?.preventDefault();
    setModelOpen(false);
    if (isSearching) { if (!searchBusy) await searchLibrary(); return; }
    if (isResearching) {
      if (question.trim().length > 1500) { setError('Research questions are limited to 1500 characters. Shorten the question before continuing.'); return; }
      if (question.trim()) onResearch(researchHandoff(question.trim(), selectedSources));
      return;
    }
    const prompt = (preset ?? question).trim();
    if (!prompt || busy) return;
    if (prompt.length > MAX_QUESTION) { setError(`Questions are limited to ${MAX_QUESTION} characters.`); return; }

    const stamp = Date.now();
    const userKey = `u-${stamp}`;
    const answerKey = `a-${stamp}`;
    setThread(current => [
      ...current,
      { key: userKey, role: 'user', content: prompt },
      { key: answerKey, role: 'assistant', content: '', sources: [], citations: [], invalidCitations: [], method: '', model: selectedModel?.id || '', effort: '', done: false }
    ]);
    setQuestion('');
    setError('');
    setNotice('');
    setBusy(true);
    if (preset) setActiveConversation('');
    requestAnimationFrame(() => threadEnd.current?.scrollIntoView({ block: 'end' }));

    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch('/api/orin/ask', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: prompt,
          mode: 'library',
          conversationId,
          ...(selectedSources.length ? { sourceIds: selectedSources.map(source => source.id) } : {}),
          model: selectedModel?.id || undefined,
          effort
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw Object.assign(new Error(payload.error || 'Ask could not start.'), { status: response.status });
      }
      await readEvents(response, event => {
        if (event.type === 'sources') {
          if (event.conversationId) { setConversationId(event.conversationId); setActiveConversation(event.conversationId); }
          updateAssistant(answerKey, {
            sources: event.sources || [],
            method: event.method || '',
            model: event.model || selectedModel?.id || '',
            effort: event.effort || '',
            persisted: event.persisted !== false
          });
        } else if (event.type === 'delta') {
          setThread(current => current.map(message => message.key === answerKey
            ? { ...message, content: message.content + event.text }
            : message));
        } else if (event.type === 'done') {
          if (event.conversationId) { setConversationId(event.conversationId); setActiveConversation(event.conversationId); }
          updateAssistant(answerKey, {
            citations: event.citations || [],
            invalidCitations: event.invalidCitations || [],
            method: event.method || '',
            model: event.model || selectedModel?.id || '',
            effort: event.effort || '',
            persisted: event.persisted !== false,
            done: true
          });
          loadConversations();
        } else if (event.type === 'error') {
          updateAssistant(answerKey, { error: event.message, done: true });
        }
      });
      updateAssistant(answerKey, { done: true });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (err.status === 401) { expireSession(); return; }
      updateAssistant(answerKey, { error: err.message, done: true });
    } finally {
      abort.current = null;
      setBusy(false);
      requestAnimationFrame(() => threadEnd.current?.scrollIntoView({ block: 'end' }));
    }
  }

  function highlight(message, ref) {
    setThread(current => current.map(entry => entry.key === message.key ? { ...entry, highlight: ref } : entry));
    requestAnimationFrame(() => {
      document.getElementById(`orin-ask-source-${message.key}-${ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    window.setTimeout(() => {
      setThread(current => current.map(entry => entry.key === message.key ? { ...entry, highlight: null } : entry));
    }, 1600);
  }

  async function copy(message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedKey(message.key);
      window.setTimeout(() => setCopiedKey(''), 1600);
    } catch { setError('Copying needs clipboard permission in this browser.'); }
  }

  // Save the answer as a normal ORIN note: create the document, then write the
  // sanitized HTML body. The note is editable like anything else in Notes.
  async function saveAsNote(message) {
    const index = thread.findIndex(entry => entry.key === message.key);
    const asked = [...thread.slice(0, Math.max(0, index))].reverse().find(entry => entry.role === 'user');
    if (!asked) return;
    setSavingKey(message.key);
    setError('');
    try {
      const created = await json('/api/orin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleFrom(asked.content) })
      });
      const sources = (message.sources || []).map(source => {
        const link = safeUrl(source.url);
        const label = escapeHtml(source.title || 'Untitled source');
        return `<li>${link ? `<a href="${escapeHtml(link)}">${label}</a>` : label}${source.origin ? ` — ${escapeHtml(source.origin)}` : ''}</li>`;
      }).join('');
      const paragraphs = String(message.content || '').split(/\n{2,}/).filter(Boolean)
        .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');
      const used = [
        message.model ? `Model: ${modelName(message.model)}` : null,
        message.effort ? `Reasoning: ${effortName(message.effort)}` : null
      ].filter(Boolean).join(' · ');
      const content = [
        '<h2>Question</h2>', `<p>${escapeHtml(asked.content)}</p>`,
        '<h2>Answer</h2>', paragraphs || '<p></p>',
        sources ? `<h2>Sources</h2><ol>${sources}</ol>` : '',
        `<p><em>Saved from Ask ORIN.${used ? ` ${escapeHtml(used)}.` : ''} Answers are grounded in the library at the time of asking.</em></p>`
      ].join('');
      await json('/api/orin/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.note.id, content, snapshot: true })
      });
      setNotice('Saved to Notes.');
      window.setTimeout(() => setNotice(''), 2400);
    } catch (err) {
      report(err);
    } finally {
      setSavingKey('');
    }
  }

  const lastAssistant = [...thread].reverse().find(message => message.role === 'assistant');
  const isEmpty = thread.length === 0;

  return <section className={`orin-ask ${isEmpty || mode !== 'ask' ? 'is-empty' : 'has-thread'} ${historyOpen ? 'has-history' : ''}`} aria-labelledby="orin-ask-heading">
    <div className="orin-ask-main">
      <header className={`orin-ask-intro ${isEmpty ? '' : 'is-compact'}`}>
        <div className="eyebrow"><Sparkles size={14}/> ASK YOUR LIBRARY</div>
        <h2 id="orin-ask-heading" className={isEmpty || mode !== 'ask' ? '' : 'sr-only'}>What would you like to explore?</h2>
        {(isEmpty || mode !== 'ask') && <p>{isSearching ? 'Find saved sources, then choose what to explore.' : isResearching ? 'Start with a question. Review the plan before research begins.' : 'Explore your library with answers you can trace back to the source.'}</p>}
        <button type="button" className="orin-ask-history-toggle" aria-expanded={historyOpen} aria-controls="orin-ask-history" onClick={() => { setHistoryOpen(value => !value); if (!historyOpen && window.matchMedia('(max-width:1040px)').matches) requestAnimationFrame(() => document.getElementById('orin-ask-history')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }}><History size={15}/> History{conversations.length > 0 ? ` · ${conversations.length}` : ''}</button>
      </header>

      {migrationRequired && <p className="orin-ask-hint" role="status">Conversation history needs the ask migration. Answers still work and are not saved.</p>}
      {capabilities && !capabilities.library && <p className="orin-ask-hint" role="status">{capabilities.message}</p>}
      {error && <div className="orin-error" role="alert">{error}</div>}

      <div className="orin-ask-thread" hidden={mode !== 'ask'} role="log" aria-live="polite" aria-relevant="additions text">
        {thread.map(message => message.role === 'user'
          ? <article key={message.key} className="orin-ask-turn orin-ask-turn--user">
            <span className="orin-ask-role">You</span>
            <p>{message.content}</p>
          </article>
          : <article key={message.key} className="orin-ask-turn orin-ask-turn--answer">
            <div className="orin-ask-answer-head">
              <span className="orin-ask-role"><Sparkles size={13}/> ORIN</span>
              {message.model && <span className="orin-ask-model">{modelName(message.model)}{message.effort ? ` · ${effortName(message.effort)}` : ''}</span>}
              {message.method && <span className="orin-ask-method">{methodLabel(message.method)}</span>}
              {message.persisted === false && <span className="orin-ask-method">Not saved to history</span>}
            </div>
            {message.error
              ? <p className="orin-ask-answer-error" role="alert"><AlertTriangle size={15}/> {message.error}</p>
              : <>
                <div className="orin-ask-answer">
                  {message.content
                    ? <CitationText text={message.content} sources={message.sources} invalid={message.invalidCitations || []} onCite={ref => highlight(message, ref)}/>
                    : <span className="orin-ask-typing" aria-label="ORIN is thinking"><i/><i/><i/></span>}
                  {!message.done && message.content && <span className="orin-ask-caret" aria-hidden="true"/>}
                </div>
                {message.invalidCitations?.length > 0 && <p className="orin-ask-warning"><AlertTriangle size={13}/> The answer cited source{message.invalidCitations.length === 1 ? '' : 's'} {message.invalidCitations.join(', ')}, which were not in your library. Treat those sentences with care.</p>}
                <SourceCards message={message} onCite={ref => highlight(message, ref)}/>
                {message.done && message.content && <div className="orin-ask-actions">
                  <button type="button" onClick={() => copy(message)}>{copiedKey === message.key ? <Check size={14}/> : <Copy size={14}/>} {copiedKey === message.key ? 'Copied' : 'Copy'}</button>
                  <button type="button" onClick={() => researchFrom(message)}><FlaskConical size={14}/> Research this further</button>
                  <button type="button" disabled={savingKey === message.key} onClick={() => saveAsNote(message)}>
                    {savingKey === message.key ? <span className="orin-ask-spinner" aria-hidden="true"/> : <BookmarkPlus size={14}/>} Save as note
                  </button>
                </div>}
              </>}
          </article>)}
        <div ref={threadEnd}/>
      </div>

      <form className={`orin-ask-composer ${modelOpen ? 'has-model-open' : ''}`} onSubmit={event => send(event)}>
        <div className="orin-ask-modes" role="group" aria-label="Explore mode">{[['ask', 'Ask', Sparkles], ['search', 'Search', Search], ['research', 'Research', FlaskConical]].map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={mode === value} disabled={busy} onClick={() => setMode(value)}><Icon size={14}/>{label}</button>)}</div>
        {mode === 'ask' && <div className="orin-ask-modelbar" ref={modelBar}>
          <button type="button" className="orin-ask-model-trigger" ref={modelTrigger}
            aria-haspopup="dialog" aria-expanded={modelOpen} disabled={busy}
            aria-label={`Answer model: ${selectedModel?.label || 'choose'}${effectiveEffort ? `, ${effortName(effectiveEffort)} reasoning` : ''}`}
            onClick={() => setModelOpen(open => !open)}>
            <Sparkles size={14}/>
            <span>{selectedModel?.label || 'Choose model'}</span>
            {effectiveEffort && <span className="orin-ask-model-effort"
              title={effort === 'auto' ? `Auto (default: ${effortName(effectiveEffort)})` : `${effortName(effectiveEffort)} reasoning`}>
              {effortName(effectiveEffort)}
            </span>}
            <ChevronDown size={14} className={modelOpen ? 'is-open' : ''}/>
          </button>
          {compactPriceLabel && <span className="orin-ask-model-caption">{compactPriceLabel}</span>}
          {modelOpen && <div className={`orin-ask-model-popover ${isEmpty ? 'is-down' : 'is-up'}`} ref={modelPopover}
            role="dialog" aria-label="Model and reasoning settings">
            <header className="orin-ask-model-popover-head">
              <span className="eyebrow">MODEL</span>
              <button type="button" className="orin-ask-model-close" onClick={closeModelMenu} aria-label="Close model settings"><X size={15}/></button>
            </header>
            <div className="orin-ask-model-list">
              {modelsByTier.length
                ? modelsByTier.map(group => <section key={group.tier} className="orin-ask-model-group">
                  <span className="orin-ask-model-group-label">{group.label}</span>
                  {group.models.map(entry => {
                    const active = entry.id === selectedModel?.id;
                    return <button key={entry.id} type="button"
                      className={`orin-ask-model-option ${active ? 'is-active' : ''}`}
                      aria-pressed={active} onClick={() => chooseModel(entry.id)}>
                      <span className="orin-ask-model-option-copy">
                        <strong>{entry.label}</strong>
                        <small>{entry.provider}{entry.note ? ` · ${entry.note}` : ''}</small>
                      </span>
                      <span className="orin-ask-model-option-price"
                        title={entry.promptPerM != null ? `Input ${formatPrice(entry.promptPerM)} / output ${formatPrice(entry.completionPerM)} per 1M tokens` : 'Pricing unavailable'}>
                        {entry.promptPerM != null ? `${formatPrice(entry.promptPerM)} / ${formatPrice(entry.completionPerM)}` : '—'}
                      </span>
                      {active && <Check size={15} className="orin-ask-model-check"/>}
                    </button>;
                  })}
                </section>)
                : <p className="orin-ask-model-loading">Loading models…</p>}
            </div>
            <div className="orin-ask-reasoning">
              <span className="orin-ask-model-group-label">Reasoning effort</span>
              {effortChoices.length
                ? <div className="orin-ask-effort-options" role="group" aria-label="Reasoning effort">
                  <button type="button" aria-pressed={effort === 'auto'} onClick={() => setEffort('auto')}
                    title={selectedModel?.defaultEffort ? `Model default: ${effortName(selectedModel.defaultEffort)}` : 'Model default'}>Auto</button>
                  {effortChoices.map(value => <button key={value} type="button" aria-pressed={effort === value}
                    onClick={() => setEffort(value)}>{effortName(value)}</button>)}
                </div>
                : <p className="orin-ask-model-fixed">This model does not expose reasoning effort.</p>}
            </div>
            <footer className="orin-ask-model-popover-foot">
              <span>{contextLabel ? `${contextLabel} context · ` : ''}USD per 1M tokens</span>
              <button type="button" onClick={closeModelMenu}>Done</button>
            </footer>
          </div>}
        </div>}
        {selectedSources.length > 0 && mode !== 'search' && <div className="orin-ask-selected" aria-label="Selected sources">{selectedSources.map(source => <button type="button" key={source.id} disabled={busy} onClick={() => toggleSource(source)} aria-label={`Remove ${source.title}`}><span>{source.title}</span><X size={13}/></button>)}</div>}
        {isSearching && <label className="orin-ask-search-mode">Match type <select value={searchMode} disabled={searchBusy} onChange={event => setSearchMode(event.target.value)}><option value="hybrid">Semantic + keyword</option><option value="keyword">Keywords only</option></select></label>}
        <label htmlFor="orin-ask-input" className="sr-only">{isSearching ? 'Search saved sources' : isResearching ? 'Investigation question' : 'Ask your library'}</label>
        <textarea id="orin-ask-input" ref={composer} rows={2} maxLength={isSearching ? 200 : isResearching ? 1500 : MAX_QUESTION} value={question}
          placeholder={isSearching ? 'Search a topic, title, model or GPU…' : isResearching ? 'What would you like to investigate?' : 'Ask about anything you have saved…'}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event); }
          }}/>
        <div className="orin-ask-composer-foot">
          <span>{isSearching ? 'Saved source items · up to 100 results' : isResearching ? 'Review scope, depth and budget next' : selectedSources.length ? `${selectedSources.length} selected source${selectedSources.length === 1 ? '' : 's'} only` : 'Saved items and notes · cited answers'}</span>
          <div>
            {mode !== 'search' && <button type="button" className="orin-ask-secondary" disabled={busy} onClick={() => setMode('search')}><Paperclip size={14}/> Attach sources</button>}
            {thread.length > 0 && mode === 'ask' && <button type="button" className="orin-ask-secondary" onClick={reset} disabled={busy}>
              <MessageSquarePlus size={14}/> New
            </button>}
            <button type="submit" className="orin-ask-send" disabled={busy || searchBusy || !question.trim() || (isSearching && question.trim().length < 2)}>
              {busy ? <span className="orin-ask-spinner" aria-hidden="true"/> : <CornerDownLeft size={15}/>}
              {busy ? 'Answering…' : searchBusy ? 'Searching…' : isSearching ? 'Search' : isResearching ? 'Review plan' : 'Ask'}
            </button>
          </div>
        </div>
      </form>
      {isEmpty && mode === 'ask' && <div className="orin-ask-empty">
          <div className="orin-ask-prompts">
            {SUGGESTIONS.map(prompt => <button key={prompt} type="button" onClick={() => { setQuestion(prompt); composer.current?.focus(); }}>
              <span>{prompt}</span><CornerDownLeft size={14}/>
            </button>)}
          </div>
        </div>}
      {isSearching && <div className="orin-ask-search-results" aria-live="polite">
        <p className="orin-ask-search-disclosure">{searchMode === 'keyword' ? 'Keywords only searches saved source text without sending your query to an embedding provider.' : 'Search covers saved source items. Your query may be sent to the embedding provider. Keyword search is used when semantic search is unavailable.'}</p>
        {searchBusy && <div className="orin-ask-search-status"><p role="status">{searchDelayed ? 'Still searching. You can cancel and try keywords only for a faster search.' : 'Searching your library…'}</p><button type="button" onClick={cancelSearch}>Cancel search</button></div>}
        {!searchBusy && searchStatus && <p role="status">{searchStatus}</p>}
        {selectedSources.length > 0 && <div className="orin-ask-selection-bar"><span>{selectedSources.length}/10 sources selected</span><button type="button" onClick={() => { setMode('ask'); setQuestion(selectedSources.length === 1 ? 'Explain the key ideas and limitations in the selected source.' : 'Compare the selected sources. Where do they agree and disagree?'); }}>Ask about selected</button><button type="button" onClick={() => { setMode('research'); setQuestion('What unresolved question is worth investigating across these sources?'); }}>Research selected</button><button type="button" onClick={() => onWorkspaceChange(current => ({ ...current, sources: [] }))}>Clear</button></div>}
        {searchResult && <>
          <h3>{searchResult.items.length >= 100 ? 'Top 100 matches' : `${searchResult.items.length} matches`} for “{searchedQuery}”</h3>
          <p>{searchResult.method === 'hybrid' ? 'Semantic + keyword matches' : 'Keyword matches'}</p>
          <div className="orin-ask-result-filters" aria-label="Filter returned matches">
            <label>Source<select value={resultFilters.source} onChange={event => changeResultFilter('source', event.target.value)}><option value="">All sources</option>{resultSources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
            <label>Published from<input type="date" value={resultFilters.after} max={resultFilters.before || undefined} onChange={event => changeResultFilter('after', event.target.value)}/></label>
            <label>Published through<input type="date" value={resultFilters.before} min={resultFilters.after || undefined} onChange={event => changeResultFilter('before', event.target.value)}/></label>
            <label>Sort<select value={resultFilters.sort} onChange={event => changeResultFilter('sort', event.target.value)}><option value="relevance">Relevance</option><option value="newest">Newest published</option><option value="oldest">Oldest published</option></select></label>
            <button type="button" onClick={() => { setResultFilters({ source: '', after: '', before: '', sort: 'relevance' }); setVisibleResults(20); }}>Reset filters</button>
          </div>
          <p>Filters and sorting apply to these returned matches. Date filters exclude sources without a publication date.</p>
          {resultFilters.after && resultFilters.before && resultFilters.after > resultFilters.before && <p role="status">Choose an end date on or after the start date.</p>}
          <p role="status">Showing {Math.min(visibleResults, matchingResults.length)} of {matchingResults.length} matching sources.</p>
          <ul>{matchingResults.slice(0, visibleResults).map(item => {
            const selected = selectedSources.some(source => source.id === item.id);
            const link = safeUrl(item.resolvedUrl) || safeUrl(item.url);
            const day = publicationDay(item);
            const preview = searchPreview(item);
            return <li key={item.id}>
              <small>{[item.source || 'Saved source', item.author, link ? new URL(link).hostname.replace(/^www\./, '') : null].filter(Boolean).join(' · ')}{day && <> · <time dateTime={item.publishedAt}>{day}</time></>}</small>
              <h4>{link ? <a href={link} target="_blank" rel="noopener noreferrer">{item.title || 'Untitled source'}<ArrowUpRight size={14}/></a> : item.title || 'Untitled source'}</h4>
              {preview.excerpt && <p>{preview.excerpt}</p>}
              {preview.limited && <p className="orin-ask-limited">Limited archived content · open the original for details.</p>}
              <button type="button" aria-pressed={selected} aria-label={`${selected ? 'Deselect' : 'Select'} ${item.title || 'untitled source'}`} disabled={!selected && selectedSources.length >= 10} onClick={() => toggleSource(item)}>{selected ? 'Selected' : 'Select source'}</button>
            </li>;
          })}</ul>
          {matchingResults.length > visibleResults && <button type="button" onClick={() => setVisibleResults(count => count + 20)}>Show 20 more</button>}
          {!matchingResults.length && <p>{searchResult.items.length ? 'No sources match these filters. Reset filters or run a narrower search.' : 'No matching sources. Try a broader topic or a different title.'}</p>}
        </>}
      </div>}
      {mode === 'ask' && <p className="orin-ask-footnote">Answers can be wrong. Follow the citations before relying on a claim.</p>}
      {notice && <p className="orin-ask-notice" role="status"><Check size={13}/> {notice}</p>}
    </div>

    <aside id="orin-ask-history" className="orin-ask-side" hidden={!historyOpen} aria-label="Recent conversations">
      <div className="orin-ask-side-head">
        <span className="eyebrow">RECENT</span><button type="button" aria-label="Close history" onClick={() => setHistoryOpen(false)}><X size={15}/></button>
        {thread.length > 0 && <button type="button" onClick={reset} disabled={busy} aria-label="Start a new conversation"><MessageSquarePlus size={15}/></button>}
      </div>
      {conversations.length === 0
        ? <p className="orin-ask-side-empty">{migrationRequired ? 'History is unavailable until the migration is applied.' : 'Your conversations will appear here.'}</p>
        : <ul className="orin-ask-conversations">
          {conversations.map(conversation => <li key={conversation.id}>
            <button type="button" className={activeConversation === conversation.id ? 'is-active' : ''}
              aria-current={activeConversation === conversation.id ? 'true' : undefined}
              onClick={() => openConversation(conversation.id)} disabled={busy}>
              <span className="orin-ask-conversation-title">{conversation.title || 'Untitled question'}</span>
              <small>{relative(conversation.updatedAt)}{conversation.messageCount ? ` · ${Math.ceil(conversation.messageCount / 2)} exchange${Math.ceil(conversation.messageCount / 2) === 1 ? '' : 's'}` : ''}</small>
            </button>
            <button type="button" className="orin-ask-delete" aria-label={`Delete ${conversation.title || 'conversation'}`}
              onClick={event => removeConversation(conversation.id, event)}><Trash2 size={13}/></button>
          </li>)}
        </ul>}
      {lastAssistant?.persisted === false && <p className="orin-ask-side-note">The last answer was not written to history.</p>}
    </aside>
  </section>;
}
