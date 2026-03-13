/**
 * spotify.js – Spotify Web API with PKCE Authorization Flow
 *
 * No backend required. Users provide their own Client ID from
 * https://developer.spotify.com/dashboard
 */

const SPOTIFY_AUTH_URL   = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL  = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_BASE   = 'https://api.spotify.com/v1';

const SCOPES = [
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const KEY_CLIENT_ID    = 'mcg_spotify_client_id';
const KEY_VERIFIER     = 'mcg_spotify_code_verifier';
const KEY_ACCESS_TOKEN = 'mcg_spotify_access_token';
const KEY_REFRESH_TOKEN= 'mcg_spotify_refresh_token';
const KEY_TOKEN_EXPIRY = 'mcg_spotify_token_expiry';

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64urlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// ─── SpotifyClient ────────────────────────────────────────────────────────────

class SpotifyClient {
  constructor() {
    this.clientId   = localStorage.getItem(KEY_CLIENT_ID) || '';
    this.redirectUri = this._buildRedirectUri();
  }

  _buildRedirectUri() {
    // In production this will be the GitHub Pages URL; in dev it's localhost.
    const { protocol, host, pathname } = window.location;
    // Strip any query/hash, keep just origin + path (no trailing index.html)
    const base = pathname.endsWith('/index.html')
      ? pathname.slice(0, -'index.html'.length)
      : pathname.replace(/\/?$/, '/');
    return `${protocol}//${host}${base}`;
  }

  setClientId(id) {
    this.clientId = id.trim();
    localStorage.setItem(KEY_CLIENT_ID, this.clientId);
  }

  isConfigured() {
    return !!this.clientId;
  }

  isAuthenticated() {
    const token  = localStorage.getItem(KEY_ACCESS_TOKEN);
    const expiry = localStorage.getItem(KEY_TOKEN_EXPIRY);
    return !!(token && expiry && Date.now() < parseInt(expiry, 10));
  }

  // ── Auth flow ──────────────────────────────────────────────────────────────

  async login() {
    if (!this.clientId) throw new Error('No Client ID configured');

    const verifier  = generateRandomString(64);
    const challenge = base64urlEncode(await sha256(verifier));

    sessionStorage.setItem(KEY_VERIFIER, verifier);

    const params = new URLSearchParams({
      client_id:             this.clientId,
      response_type:         'code',
      redirect_uri:          this.redirectUri,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
      scope:                 SCOPES,
      show_dialog:           'false',
    });

    window.location.href = `${SPOTIFY_AUTH_URL}?${params}`;
  }

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const error  = params.get('error');

    if (error) {
      // Clean URL and surface the error
      window.history.replaceState({}, '', window.location.pathname);
      throw new Error(`Spotify auth error: ${error}`);
    }

    if (!code) return false; // Not a callback

    const verifier = sessionStorage.getItem(KEY_VERIFIER);
    if (!verifier) throw new Error('Missing PKCE verifier – please try signing in again');

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     this.clientId,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  this.redirectUri,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error_description || `Token exchange failed (${response.status})`);
    }

    const data = await response.json();
    this._saveTokens(data);
    sessionStorage.removeItem(KEY_VERIFIER);

    // Remove code from URL without page reload
    window.history.replaceState({}, '', window.location.pathname);
    return true;
  }

  async refreshAccessToken() {
    const refreshToken = localStorage.getItem(KEY_REFRESH_TOKEN);
    if (!refreshToken) throw new Error('No refresh token');

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     this.clientId,
        grant_type:    'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      this.logout();
      throw new Error('Session expired – please sign in again');
    }

    const data = await response.json();
    this._saveTokens(data);
    return data.access_token;
  }

  _saveTokens(data) {
    localStorage.setItem(KEY_ACCESS_TOKEN,  data.access_token);
    localStorage.setItem(KEY_TOKEN_EXPIRY,  String(Date.now() + (data.expires_in - 60) * 1000));
    if (data.refresh_token) {
      localStorage.setItem(KEY_REFRESH_TOKEN, data.refresh_token);
    }
  }

  logout() {
    localStorage.removeItem(KEY_ACCESS_TOKEN);
    localStorage.removeItem(KEY_REFRESH_TOKEN);
    localStorage.removeItem(KEY_TOKEN_EXPIRY);
    sessionStorage.removeItem(KEY_VERIFIER);
  }

  // ── API ────────────────────────────────────────────────────────────────────

  async _getToken() {
    if (this.isAuthenticated()) {
      return localStorage.getItem(KEY_ACCESS_TOKEN);
    }
    const expiry = localStorage.getItem(KEY_TOKEN_EXPIRY);
    if (localStorage.getItem(KEY_REFRESH_TOKEN) && expiry && Date.now() >= parseInt(expiry, 10)) {
      return this.refreshAccessToken();
    }
    return null;
  }

  async _fetch(path, params = {}) {
    const token = await this._getToken();
    if (!token) throw new AuthRequiredError();

    const url = new URL(`${SPOTIFY_API_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Token might have just expired, try refresh once
      try {
        const newToken = await this.refreshAccessToken();
        const retry = await fetch(url, {
          headers: { Authorization: `Bearer ${newToken}` },
        });
        if (!retry.ok) throw new Error(`API error ${retry.status}`);
        return retry.json();
      } catch {
        this.logout();
        throw new AuthRequiredError();
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    return res.json();
  }

  /**
   * Search Spotify.
   * @param {string} query
   * @param {'album'|'track'|'playlist'} type
   * @returns {Promise<SearchResult[]>}
   */
  async search(query, type = 'album') {
    const data = await this._fetch('/search', {
      q:      query,
      type,
      limit:  '20',
      market: 'from_token',
    });

    const key = `${type}s`; // albums, tracks, playlists
    return (data[key]?.items || [])
      .filter(Boolean)
      .map(item => this._normalise(item, type));
  }

  _normalise(item, type) {
    if (type === 'album') {
      return {
        id:       item.id,
        type:     'album',
        title:    item.name,
        subtitle: item.artists.map(a => a.name).join(', '),
        detail:   `${item.album_type[0].toUpperCase() + item.album_type.slice(1)} · ${item.release_date?.slice(0, 4) || ''}`,
        artUrl:   item.images?.[0]?.url || '',
        spotifyUri: item.uri,
        externalUrl: item.external_urls?.spotify,
      };
    }

    if (type === 'track') {
      return {
        id:       item.id,
        type:     'track',
        title:    item.name,
        subtitle: item.artists.map(a => a.name).join(', '),
        detail:   item.album?.name || '',
        artUrl:   item.album?.images?.[0]?.url || '',
        spotifyUri: item.uri,
        externalUrl: item.external_urls?.spotify,
      };
    }

    if (type === 'playlist') {
      return {
        id:       item.id,
        type:     'playlist',
        title:    item.name,
        subtitle: item.owner?.display_name || '',
        detail:   `${item.tracks?.total || 0} tracks`,
        artUrl:   item.images?.[0]?.url || '',
        spotifyUri: item.uri,
        externalUrl: item.external_urls?.spotify,
      };
    }

    return item;
  }
}

class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

// Singleton
const spotify = new SpotifyClient();
