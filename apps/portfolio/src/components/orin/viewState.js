export function validViewDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function readOrinView(search, tabs) {
  const params = new URLSearchParams(search);
  const requested = params.get('tab');
  const tab = tabs.some(entry => entry.value === requested) ? requested : 'digest';
  const day = validViewDate(params.get('date')) ? params.get('date') : '';
  return { tab, date: tab === 'digest' || tab === 'brain' ? day : '', archiveDay: tab === 'archive' ? day || null : null };
}

export function orinViewUrl(href, { tab, date, archiveDay }) {
  const url = new URL(href);
  if (tab === 'digest') url.searchParams.delete('tab');
  else url.searchParams.set('tab', tab);
  const day = tab === 'archive' ? archiveDay : tab === 'digest' || tab === 'brain' ? date : '';
  if (validViewDate(day)) url.searchParams.set('date', day);
  else url.searchParams.delete('date');
  return url;
}

// Match the contribution API's public HTTPS URL rules before attempting a save.
export function validCaptureUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && host.includes('.') && !host.endsWith('.local') && !host.endsWith('.internal')
      && host !== 'localhost' && !/^[\d.]+$/.test(host) && !host.includes(':');
  } catch { return false; }
}
