// Date filters use the publication day, consistently with the result metadata.
export const publicationDay = item => {
  const value = item.publishedAt;
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : '';
};
export function filterSearchResults(items, { source = '', after = '', before = '', sort = 'relevance' } = {}) {
  const matches = items.filter(item => {
    const day = publicationDay(item);
    return (!source || item.source === source) && (!after || (day && day >= after)) && (!before || (day && day <= before));
  });
  if (sort === 'newest' || sort === 'oldest') matches.sort((a, b) => {
    const first = publicationDay(a), second = publicationDay(b);
    if (!first || !second) return first ? -1 : second ? 1 : 0;
    return sort === 'newest' ? second.localeCompare(first) : first.localeCompare(second);
  });
  return matches;
}
export function searchPreview(item) {
  const excerpt = String(item.excerpt || '').trim();
  const title = String(item.title || '').trim();
  const normalized = value => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const body = normalized(excerpt), heading = normalized(title);
  const duplicate = heading && (body === heading || (body.startsWith(heading) && heading.length >= 80));
  const limited = !excerpt || /requires? sign.in|sign.in wall|could not be read|metadata (?:is )?derived from|url only|not accessible without/i.test(excerpt);
  return { excerpt: duplicate ? '' : excerpt.length > 260 ? `${excerpt.slice(0, 257).trimEnd()}…` : excerpt, limited };
}
