import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight, BookmarkPlus, Check, Copy, CornerDownLeft, MessageSquarePlus,
  Search, Sparkles, Trash2, AlertTriangle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './OrinAsk.css';

const MAX_QUESTION = 2000;
const SUGGESTIONS = [
  'Summarize the key ideas I saved this week.',
  'What have I saved about AI agents?',
  'Compare the arguments across my saved research.',
  'What open questions keep appearing in my notes?'
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

export default function OrinAsk() {
  const { expireSession } = useAuth();
  const [thread, setThread] = useState([]);
  const [question, setQuestion] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
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

  const report = useCallback(err => {
    if (err?.status === 401) { expireSession(); return; }
    setError(err.message);
  }, [expireSession]);

  const loadConversations = useCallback(async () => {
    try {
      const payload = await json('/api/orin/ask');
      setConversations(payload.conversations || []);
      setMigrationRequired(Boolean(payload.migrationRequired));
    } catch (err) {
      // History is optional; a missing table must not block asking.
      if (err.status === 401) report(err);
    }
  }, [report]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => () => abort.current?.abort(), []);

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
          done: true
        });
      }
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
    const prompt = (preset ?? question).trim();
    if (!prompt || busy) return;
    if (prompt.length > MAX_QUESTION) { setError(`Questions are limited to ${MAX_QUESTION} characters.`); return; }

    const stamp = Date.now();
    const userKey = `u-${stamp}`;
    const answerKey = `a-${stamp}`;
    setThread(current => [
      ...current,
      { key: userKey, role: 'user', content: prompt },
      { key: answerKey, role: 'assistant', content: '', sources: [], citations: [], invalidCitations: [], method: '', done: false }
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
        body: JSON.stringify({ question: prompt, mode: 'library', conversationId })
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
      const content = [
        '<h2>Question</h2>', `<p>${escapeHtml(asked.content)}</p>`,
        '<h2>Answer</h2>', paragraphs || '<p></p>',
        sources ? `<h2>Sources</h2><ol>${sources}</ol>` : '',
        '<p><em>Saved from Ask ORIN. Answers are grounded in the library at the time of asking.</em></p>'
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

  return <section className="orin-ask" aria-labelledby="orin-ask-heading">
    <div className="orin-ask-main">
      <header className={`orin-ask-intro ${isEmpty ? '' : 'is-compact'}`}>
        <div className="eyebrow"><Sparkles size={14}/> ASK YOUR LIBRARY</div>
        <h2 id="orin-ask-heading" className={isEmpty ? '' : 'sr-only'}>Answers grounded in what you saved.</h2>
        {isEmpty && <p>ORIN reads your saved items and notes, answers with citations, and shows exactly where each claim came from. Web search is not enabled yet.</p>}
        <div className="orin-ask-badges">
          <span><Search size={12}/> Library only</span>
          <span>Citations required</span>
          {!migrationRequired && conversations.length > 0 && <span>{conversations.length} recent conversation{conversations.length === 1 ? '' : 's'}</span>}
        </div>
      </header>

      {migrationRequired && <p className="orin-ask-hint" role="status">Conversation history needs the ask migration. Answers still work and are not saved.</p>}
      {error && <div className="orin-error" role="alert">{error}</div>}

      <div className="orin-ask-thread" role="log" aria-live="polite" aria-relevant="additions text">
        {isEmpty ? <div className="orin-ask-empty">
          <div className="orin-ask-empty-mark"><Sparkles size={22} strokeWidth={1.4}/></div>
          <h3>Start with a question about your reading.</h3>
          <p>Try one of these, or ask in your own words.</p>
          <div className="orin-ask-prompts">
            {SUGGESTIONS.map(prompt => <button key={prompt} type="button" onClick={event => send(event, prompt)}>
              <span>{prompt}</span><CornerDownLeft size={14}/>
            </button>)}
          </div>
        </div> : thread.map(message => message.role === 'user'
          ? <article key={message.key} className="orin-ask-turn orin-ask-turn--user">
            <span className="orin-ask-role">You</span>
            <p>{message.content}</p>
          </article>
          : <article key={message.key} className="orin-ask-turn orin-ask-turn--answer">
            <div className="orin-ask-answer-head">
              <span className="orin-ask-role"><Sparkles size={13}/> ORIN</span>
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
                  <button type="button" disabled={savingKey === message.key} onClick={() => saveAsNote(message)}>
                    {savingKey === message.key ? <span className="orin-ask-spinner" aria-hidden="true"/> : <BookmarkPlus size={14}/>} Save as note
                  </button>
                </div>}
              </>}
          </article>)}
        <div ref={threadEnd}/>
      </div>

      <form className="orin-ask-composer" onSubmit={event => send(event)}>
        <label htmlFor="orin-ask-input" className="sr-only">Ask your library</label>
        <textarea id="orin-ask-input" ref={composer} rows={2} maxLength={MAX_QUESTION} value={question}
          placeholder="Ask about anything you have saved…"
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(event); }
          }}/>
        <div className="orin-ask-composer-foot">
          <span><Search size={12}/> Searching saved items and notes</span>
          <div>
            {thread.length > 0 && <button type="button" className="orin-ask-secondary" onClick={reset} disabled={busy}>
              <MessageSquarePlus size={14}/> New
            </button>}
            <button type="submit" className="orin-ask-send" disabled={busy || !question.trim()}>
              {busy ? <span className="orin-ask-spinner" aria-hidden="true"/> : <CornerDownLeft size={15}/>}
              {busy ? 'Answering…' : 'Ask'}
            </button>
          </div>
        </div>
      </form>
      <p className="orin-ask-footnote">Answers are generated from your library and can be wrong. Follow the citations before relying on a claim.</p>
      {notice && <p className="orin-ask-notice" role="status"><Check size={13}/> {notice}</p>}
    </div>

    <aside className="orin-ask-side" aria-label="Recent conversations">
      <div className="orin-ask-side-head">
        <span className="eyebrow">RECENT</span>
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
