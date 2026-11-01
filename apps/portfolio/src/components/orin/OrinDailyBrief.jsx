import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { buildDailyBrief } from './dailyBrief';

function SourceLinks({ sources }) {
  return <ul className="orin-brief-sources">{sources.map(source => <li key={source.url}>
    <a href={source.url} target="_blank" rel="noopener noreferrer"><span>{source.title}</span><ArrowUpRight size={13}/></a>
    <span>{source.publisher}</span>
  </li>)}</ul>;
}

export default function OrinDailyBrief({ data, today, archived = false, onRead }) {
  const items = data.items || [];
  const { topics, takeaways, recommended, collectedAt } = buildDailyBrief(data);
  const day = data.date ? new Date(`${data.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const label = archived || (data.date && data.date < (data.availableDates?.[0] || data.date)) ? 'ARCHIVE' : data.date === today ? 'TODAY' : 'LATEST AVAILABLE';
  return <div className="orin-daily-reading">
    <section className="orin-brief" aria-labelledby="daily-brief-title">
      <div className="eyebrow">{label} · {day || 'NO DIGEST YET'}</div>
      <h2 id="daily-brief-title">{data.digest?.title || (items.length ? 'Your collected reading.' : 'A little space for discovery.')}</h2>
      {collectedAt && <p className="orin-brief-freshness">Collected <time dateTime={new Date(collectedAt).toISOString()}>{new Date(collectedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</time></p>}
      <div className="orin-counts"><span>{items.length} finds</span><span>{new Set(items.map(item => item.source)).size} sources</span><span>{items.filter(item => !item.read).length} unread</span></div>
      {data.digestStatus && data.digestStatus.status !== 'ok' && <p className="orin-digest-status" role="status">{data.digestStatus.message}</p>}
      {!items.length && !topics.length && <p>Your digest will appear here after the collector completes a run.</p>}
      {takeaways.length > 0 && <section className="orin-quick-read" aria-labelledby="quick-read-title">
        <div className="eyebrow">THE QUICK READ</div><h3 id="quick-read-title">{archived || data.date !== today ? 'The day in 60 seconds.' : 'Today in 60 seconds.'}</h3>
        <ul>{takeaways.map(topic => <li key={topic.id}>
          <a className="orin-takeaway-title" href={`#${topic.id}`}>{topic.title}</a>
          <p>{topic.takeaway}</p>
          <SourceLinks sources={topic.sources.slice(0, 2)}/>
          {topic.sources.length > 2 && <a className="orin-brief-more" href={`#${topic.id}`}>All {topic.sources.length} sources for this topic ↓</a>}
        </li>)}</ul>
        <p className="orin-brief-note">Highlights from the stored digest, with the sources collected for each topic.</p>
      </section>}
      {data.digest?.summary && <details className="orin-editorial-overview"><summary>Read the editorial overview</summary><p>{data.digest.summary}</p></details>}
    </section>

    {topics.length > 0 && <section className="orin-topic-briefs" aria-labelledby="topic-briefs-title">
      <div className="eyebrow">FOLLOW THE THREADS</div><h2 id="topic-briefs-title">Topic briefs</h2>
      {!takeaways.length && <p className="orin-brief-note">No editorial summary was published for this day. Browse the collected excerpts and original sources below.</p>}
      {topics.map((topic, index) => <article className="orin-topic-brief" id={topic.id} key={topic.id}>
        <div className="eyebrow">TOPIC {String(index + 1).padStart(2, '0')} · {topic.sources.length} LINK{topic.sources.length === 1 ? '' : 'S'}</div>
        <h3>{topic.title}</h3>
        {topic.lead && <p className="orin-topic-lead">{topic.lead}</p>}
        {topic.reason && <p className="orin-topic-reason"><strong>Why this fits your interests</strong>{topic.reason}</p>}
        {topic.rest && <details className="orin-topic-details"><summary>Go deeper · full topic summary</summary><p>{topic.rest}</p></details>}
        {!topic.editorial && topic.sources.slice(0, 2).map(source => source.item?.excerpt && <p className="orin-topic-lead" key={source.url}><strong>{source.title}: </strong>{source.item.excerpt}</p>)}
        {topic.sources.length > 0 && <div className="orin-topic-originals"><h4>Original sources</h4><SourceLinks sources={topic.sources.slice(0, 3)}/>
          {topic.sources.length > 3 && <details><summary>Show {topic.sources.length - 3} more sources</summary><SourceLinks sources={topic.sources.slice(3)}/></details>}
        </div>}
      </article>)}
    </section>}

    {recommended.length > 0 && <section className="orin-worth-reading" aria-labelledby="worth-reading-title">
      <div className="eyebrow">GO A LITTLE FURTHER</div><h2 id="worth-reading-title">Worth your time</h2>
      <p className="orin-brief-note">Selected across topics using the relevance scores available for this day.</p>
      <div>{recommended.map(source => <article key={source.url}><span className="eyebrow">{source.publisher}</span>
        <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={15}/></a></h3>
        {source.reason && <p>{source.reason}</p>}
        {onRead && source.item?.id && <button type="button" onClick={() => onRead(source.item.id)}>Read in ORIN</button>}
      </article>)}</div>
    </section>}
  </div>;
}
