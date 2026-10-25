import { parseJSFile, stringifyJSFile } from '../utils/jsParser';

const decodeBase64Utf8 = (base64) => {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const encodeBase64Utf8 = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }

  return btoa(binary);
};

class GitHubService {
  constructor() {
    this.currentSHA = null;
  }

  async request(options = {}) {
    const response = await fetch('/api/portfolio', {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Portfolio request failed');
    }

    return payload;
  }

  async fetchPortfolioData() {
    const data = await this.request();
    this.currentSHA = data.sha;
    return parseJSFile(decodeBase64Utf8(data.content));
  }

  async updatePortfolioData(newData, commitMessage = null) {
    if (!this.currentSHA) {
      throw new Error('Portfolio data must be refreshed before it can be updated');
    }

    const content = encodeBase64Utf8(stringifyJSFile(newData));
    const result = await this.request({
      method: 'PUT',
      body: JSON.stringify({
        content,
        sha: this.currentSHA,
        message: commitMessage || `Update portfolio data - ${new Date().toISOString()}`
      })
    });

    this.currentSHA = result.sha;
    return result;
  }
}

const githubService = new GitHubService();
export default githubService;
