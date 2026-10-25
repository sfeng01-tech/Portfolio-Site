const API_ROOT = 'https://api.github.com/repos';

// Claim the one daily X search before calling the metered endpoint. The Actions
// variable is durable across ephemeral runners and manual reruns.
export async function reserveDailyXRead(date, {
  token = process.env.GH_TOKEN,
  repository = process.env.GITHUB_REPOSITORY,
  fetchImpl = fetch,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) {
    throw new Error('X daily cap needs a valid date and GitHub Actions token/repository');
  }
  const variableUrl = `${API_ROOT}/${repository}/actions/variables/ORIN_X_LAST_FETCH_DATE`;
  const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  const current = await fetchImpl(variableUrl, { headers, signal: AbortSignal.timeout(20_000) });
  if (current.status === 200) {
    const value = (await current.json()).value;
    if (value === date) throw new Error(`X daily cap already used for ${date}; skipping this run`);
    const updated = await fetchImpl(variableUrl, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: date }), signal: AbortSignal.timeout(20_000),
    });
    if (!updated.ok) throw new Error(`Could not reserve the X daily cap (GitHub returned HTTP ${updated.status})`);
    return;
  }
  if (current.status !== 404) throw new Error(`Could not check the X daily cap (GitHub returned HTTP ${current.status})`);
  const created = await fetchImpl(`${API_ROOT}/${repository}/actions/variables`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ORIN_X_LAST_FETCH_DATE', value: date }), signal: AbortSignal.timeout(20_000),
  });
  if (!created.ok) throw new Error(`Could not reserve the X daily cap (GitHub returned HTTP ${created.status})`);
}
