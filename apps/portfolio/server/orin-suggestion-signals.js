import { createHash } from 'node:crypto';
import { searchView } from './orin-library-search.js';
import { loadSemanticAffinities } from './orin-semantic-affinity.js';

// Cache only IDs, not source content. A refresh always reloads current rows,
// deletion flags and feedback from the database. Failed/fallback calls are not cached.
const profileCache = new Map();
const inFlight = new Map();
const TTL_MS = 10 * 60 * 1000;
export function createSuggestionSignals({ search = searchView, affinities = loadSemanticAffinities, now = () => Date.now() } = {}) {
  return async function signals(sql, profile, items, env) {
    const seen = new Set(items.map(item => item.id));
    const positive = await affinities(sql, [...seen]);
    const result = Object.fromEntries(positive);
    const query = [...(Array.isArray(profile.interests) ? profile.interests : []), profile.goals || ''].filter(Boolean).join(', ').slice(0,200);
    if (!env.OPENROUTER_API_KEY?.trim() || query.length < 2) return {items,signals:result};
    const key=createHash('sha256').update(query).digest('hex');
    let cached=profileCache.get(key);
    if (!cached || cached.expiresAt <= now()) {
      try {
        if (!inFlight.has(key)) {
          const pending=Promise.resolve().then(()=>search(sql,{query,ids:null},{env})).finally(()=>inFlight.delete(key));
          inFlight.set(key,pending);
        }
        const found=await inFlight.get(key);
        if (found.method !== 'hybrid') return {items,signals:result};
        const semanticIds=new Set(found.semanticIds || []);
        cached={ids:found.items.filter(item=>semanticIds.has(item.id)).slice(0,60).map(item=>item.id),expiresAt:now()+TTL_MS};
        if (profileCache.size>=20) profileCache.delete(profileCache.keys().next().value);
        profileCache.set(key,cached);
      } catch { return {items,signals:result}; }
    }
    try {
      const rows=await sql`SELECT id,item,saved FROM orin_items WHERE id=ANY(${cached.ids}::text[])
        AND NOT COALESCE((item->>'deleted')::boolean,false) AND COALESCE(item->>'feedback','0') <> '-1'`;
      const byId=new Map(rows.map(row=>[row.id,{...row.item,id:row.id,saved:row.saved}]));
      for (const [index,id] of cached.ids.entries()) {
        const item=byId.get(id); if(!item) continue;
        result[id]=Math.max(result[id] || 0,1-index/Math.max(1,cached.ids.length));
        if(!seen.has(id)) {items.push(item);seen.add(id);}
      }
    } catch { /* Existing suggestions remain available. */ }
    return {items,signals:result};
  };
}
export const loadSuggestionSignals = createSuggestionSignals();
