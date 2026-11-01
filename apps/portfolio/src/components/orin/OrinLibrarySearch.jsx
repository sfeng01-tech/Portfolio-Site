import React, { useEffect, useRef, useState } from 'react';
import { Search, ArrowUpRight } from 'lucide-react';
import './OrinLibrarySearch.css';

function safeLink(value) {
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export default function OrinLibrarySearch({ onAddResearch, selectedIds = [] }) {
  const [query,setQuery]=useState('');
  const [result,setResult]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const active=useRef(null);
  useEffect(()=>()=>active.current?.abort(),[]);
  async function submit(event) {
    event.preventDefault();
    const text=query.trim(); if(text.length<2) return;
    active.current?.abort();
    const controller=new AbortController(); active.current=controller;
    setBusy(true);setError('');setResult(null);
    try {
      const response=await fetch('/api/orin/search',{method:'POST',credentials:'same-origin',signal:controller.signal,
        headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query:text})});
      const payload=await response.json();
      if(!response.ok || payload.error) throw new Error(payload.error || 'Search is temporarily unavailable.');
      if(!controller.signal.aborted) setResult(payload);
    } catch(e){if(e.name!=='AbortError') setError(e.message || 'Search is temporarily unavailable.');}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  return <details className="orin-library-search">
    <summary><Search size={15}/> Search your whole library</summary>
    <form onSubmit={submit}>
      <label htmlFor="orin-library-query">Search all source items</label>
      <div><input id="orin-library-query" type="search" value={query} minLength={2} maxLength={200} placeholder="Try a topic, question, model or GPU" onChange={event=>{active.current?.abort();setBusy(false);setResult(null);setError('');setQuery(event.target.value);}}/><button type="submit" disabled={busy || query.trim().length<2}>{busy?'Searching…':'Search'}</button></div>
      <small>Your query may be sent to the embedding provider. Results include keyword matches when semantic search is unavailable.</small>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite"><p>{result.method==='hybrid'?'Semantic and keyword results':'Keyword results'} · {result.items.length} found{result.items.length===100?' (first 100)':''}</p>
      <ul>{result.items.map(item=>{const url=safeLink(item.resolvedUrl)||safeLink(item.url);const selected=selectedIds.includes(item.id);return <li key={item.id}>
        <strong>{url?<a href={url} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={12}/></a>:item.title}</strong>
        <small>{item.source || 'Source'}</small>{item.excerpt && <p>{item.excerpt.slice(0,320)}{item.excerpt.length>320?'…':''}</p>}
        <button type="button" disabled={!url || (!selected && selectedIds.length>=20)} aria-pressed={selected} onClick={()=>onAddResearch(item,url)}>{selected?'Selected for research':'Add to research'}</button>
      </li>;})}</ul>{!result.items.length && <p>No matching sources found. Try a different search.</p>}</div>}
  </details>;
}
