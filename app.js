/**
 * app.js – Main application logic
 */

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const searchInput        = $('search-input');
const btnClearSearch     = $('btn-clear-search');
const resultsList        = $('results-list');
const resultsLoading     = $('results-loading');
const resultsError       = $('results-error');
const emptyState         = $('empty-state');
const cardCanvas         = $('card-canvas');
const cardEmptyState     = $('card-empty-state');
const btnDownload        = $('btn-download');
const btnSettings        = $('btn-settings');
const btnCloseSettings   = $('btn-close-settings');
const modalSettings      = $('modal-settings');
const btnSaveSettings    = $('btn-save-settings');
const btnDisconnect      = $('btn-disconnect-spotify');
const btnSpotifyConnect  = $('btn-spotify-connect');
const spotifyConnectLabel= $('spotify-connect-label');
const setupBanner        = $('setup-banner');
const bannerOpenSettings = $('banner-open-settings');
const inputClientId      = $('input-client-id');
const inputRedirectUri   = $('input-redirect-uri');
const redirectUriDisplay = $('redirect-uri-display');
const fileUpload         = $('file-upload');
const manualTitleWrap    = $('manual-title-wrap');
const manualArtist       = $('manual-artist');
const manualTitle        = $('manual-title');
const btnGenerateManual  = $('btn-generate-manual');
const filterTabs         = document.querySelectorAll('.tab');
// ─── State ────────────────────────────────────────────────────────────────────

let searchType      = 'album';
let searchDebounce  = null;
let selectedResult  = null;
let manualImageUrl  = null;
let isGenerating    = false;

// ─── Initialise ───────────────────────────────────────────────────────────────

async function init() {
  // Populate redirect URI fields
  inputRedirectUri.value    = spotify.redirectUri;
  redirectUriDisplay.textContent = spotify.redirectUri;

  // Pre-fill saved client ID
  if (spotify.clientId) {
    inputClientId.value = spotify.clientId;
  }

  // Handle Spotify OAuth callback
  try {
    const wasCallback = await spotify.handleCallback();
    if (wasCallback) {
      updateAuthUI();
      showToast('Connected to Spotify!');
    }
  } catch (err) {
    showError(err.message);
  }

  updateAuthUI();
  updateSetupBanner();
}

// ─── Auth UI helpers ──────────────────────────────────────────────────────────

function updateAuthUI() {
  const authed = spotify.isAuthenticated();
  spotifyConnectLabel.textContent = authed ? 'Connected ✓' : 'Connect Spotify';
  btnSpotifyConnect.classList.toggle('btn-ghost', authed);
  btnSpotifyConnect.classList.toggle('btn-spotify', !authed);
  btnDisconnect.classList.toggle('hidden', !authed);
}

function updateSetupBanner() {
  setupBanner.classList.toggle('hidden', spotify.isConfigured());
}

// ─── Settings modal ───────────────────────────────────────────────────────────

btnSettings.addEventListener('click', openSettings);
bannerOpenSettings.addEventListener('click', openSettings);
btnCloseSettings.addEventListener('click', closeSettings);
modalSettings.addEventListener('click', e => { if (e.target === modalSettings) closeSettings(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSettings(); });

function openSettings() {
  inputClientId.value   = spotify.clientId;
  inputRedirectUri.value = spotify.redirectUri;
  redirectUriDisplay.textContent = spotify.redirectUri;
  updateAuthUI();
  modalSettings.classList.remove('hidden');
  inputClientId.focus();
}

function closeSettings() {
  modalSettings.classList.add('hidden');
}

btnSaveSettings.addEventListener('click', () => {
  const id = inputClientId.value.trim();
  if (!id) {
    inputClientId.focus();
    inputClientId.classList.add('shake');
    setTimeout(() => inputClientId.classList.remove('shake'), 400);
    return;
  }
  spotify.setClientId(id);
  updateSetupBanner();
  closeSettings();
  showToast('Settings saved');
});

btnDisconnect.addEventListener('click', () => {
  spotify.logout();
  updateAuthUI();
  showToast('Disconnected from Spotify');
});

btnSpotifyConnect.addEventListener('click', async () => {
  if (spotify.isAuthenticated()) {
    openSettings();
    return;
  }
  if (!spotify.isConfigured()) {
    openSettings();
    showToast('Enter your Spotify Client ID first', 'warn');
    return;
  }
  try {
    await spotify.login();
  } catch (err) {
    showError(err.message);
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim();
  btnClearSearch.classList.toggle('hidden', !val);
  clearTimeout(searchDebounce);
  if (!val) {
    showEmptyState();
    return;
  }
  searchDebounce = setTimeout(() => runSearch(val), 420);
});

searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(searchDebounce);
    const val = searchInput.value.trim();
    if (val) runSearch(val);
  }
});

btnClearSearch.addEventListener('click', () => {
  searchInput.value = '';
  btnClearSearch.classList.add('hidden');
  showEmptyState();
  searchInput.focus();
});

filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    searchType = tab.dataset.type;
    const val = searchInput.value.trim();
    if (val) runSearch(val);
  });
});

async function runSearch(query) {
  if (!spotify.isConfigured()) {
    showResultsError('Configure your Spotify Client ID in Settings to search.');
    return;
  }

  setResultsState('loading');

  try {
    const results = await spotify.search(query, searchType);
    renderResults(results);
  } catch (err) {
    if (err.name === 'AuthRequiredError') {
      showResultsError(
        'Connect your Spotify account to search. ' +
        '<button class="link-btn" onclick="spotify.login()">Connect now</button>'
      );
    } else {
      showResultsError(err.message || 'Search failed. Check your connection and try again.');
    }
  }
}

function renderResults(results) {
  if (!results.length) {
    setResultsState('error');
    resultsError.textContent = 'No results found. Try a different search.';
    return;
  }

  resultsList.innerHTML = '';
  results.forEach(item => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.dataset.id = item.id;
    li.innerHTML = `
      ${item.artUrl
        ? `<img class="result-art" src="${item.artUrl}" alt="" loading="lazy" crossorigin="anonymous" />`
        : `<div class="result-art-placeholder"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="18" r="3"/><circle cx="21" cy="16" r="3"/><polyline points="9 9 21 7 21 16"/><line x1="9" y1="9" x2="9" y2="18"/></svg></div>`
      }
      <div class="result-info">
        <div class="result-title">${escHtml(item.title)}</div>
        <div class="result-sub">${escHtml(item.subtitle)}</div>
      </div>
      <span class="result-badge">${escHtml(item.detail || item.type)}</span>
    `;

    li.addEventListener('click',  () => selectResult(item, li));
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') selectResult(item, li); });

    resultsList.appendChild(li);
  });

  setResultsState('results');
}

function setResultsState(state) {
  emptyState.classList.add('hidden');
  resultsList.classList.add('hidden');
  resultsLoading.classList.add('hidden');
  resultsError.classList.add('hidden');

  if (state === 'empty')   emptyState.classList.remove('hidden');
  if (state === 'results') resultsList.classList.remove('hidden');
  if (state === 'loading') resultsLoading.classList.remove('hidden');
  if (state === 'error')   resultsError.classList.remove('hidden');
}

function showEmptyState() { setResultsState('empty'); }

function showResultsError(html) {
  setResultsState('error');
  resultsError.innerHTML = html;
}

async function selectResult(item, el) {
  // Deselect previous
  document.querySelectorAll('.result-item.selected').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');

  selectedResult = item;
  manualImageUrl = null;

  await generateCard({
    artUrl:     item.artUrl,
    title:      item.title,
    subtitle:   item.subtitle,
    type:       item.type,
    spotifyUri: item.spotifyUri,
  });
}


function regenerateCurrentCard() {
  if (manualImageUrl) {
    generateCard({
      artUrl:   manualImageUrl,
      title:    manualTitle.value || 'Unknown',
      subtitle: manualArtist.value || '',
    });
    return;
  }
  if (selectedResult) {
    generateCard({
      artUrl:     selectedResult.artUrl,
      title:      selectedResult.title,
      subtitle:   selectedResult.subtitle,
      type:       selectedResult.type,
      spotifyUri: selectedResult.spotifyUri,
    });
  }
}

// ─── Manual upload ────────────────────────────────────────────────────────────

fileUpload.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  manualImageUrl = url;
  manualTitleWrap.classList.remove('hidden');

  // Clear Spotify selection
  document.querySelectorAll('.result-item.selected').forEach(i => i.classList.remove('selected'));
  selectedResult = null;

  // Auto-generate with a blank title so user can see the layout
  generateCard({ artUrl: url, title: manualTitle.value || 'My Album', subtitle: manualArtist.value || '' });
});

btnGenerateManual.addEventListener('click', () => {
  if (!manualImageUrl) return;
  generateCard({
    artUrl:   manualImageUrl,
    title:    manualTitle.value || 'My Album',
    subtitle: manualArtist.value || '',
  });
});

[manualArtist, manualTitle].forEach(input => {
  input.addEventListener('input', () => {
    if (manualImageUrl) regenerateCurrentCard();
  });
});

// ─── Card generation ──────────────────────────────────────────────────────────

async function generateCard(opts) {
  if (isGenerating) return;
  isGenerating = true;

  cardEmptyState.classList.add('hidden');
  cardCanvas.classList.add('hidden');
  btnDownload.disabled = true;

  // Show a subtle loading overlay on the canvas area
  const previewArea = $('card-preview-area');
  previewArea.classList.add('generating');

  try {
    await CardGenerator.render(cardCanvas, opts);

    cardCanvas.classList.remove('hidden');
    btnDownload.disabled = false;

    // Scale canvas for display (max ~520px wide)
    const displayW = Math.min(520, previewArea.clientWidth - 64);
    cardCanvas.style.width  = displayW + 'px';
    cardCanvas.style.height = Math.round(displayW * (cardCanvas.height / cardCanvas.width)) + 'px';

  } catch (err) {
    cardEmptyState.classList.remove('hidden');
    showError('Could not generate card: ' + err.message);
    console.error(err);
  } finally {
    isGenerating = false;
    previewArea.classList.remove('generating');
  }
}

// ─── Download ─────────────────────────────────────────────────────────────────

btnDownload.addEventListener('click', () => {
  const name = (selectedResult?.title || manualTitle.value || 'music-card')
    .replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  cardCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `${name}-card.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/png');
});

// Allow clicking canvas to download too
cardCanvas.addEventListener('click', () => {
  if (!btnDownload.disabled) btnDownload.click();
});

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimeout;
function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:${type === 'warn' ? '#b08020' : '#1DB954'};
      color:#000; font-size:13px; font-weight:600; padding:10px 20px;
      border-radius:8px; z-index:999; box-shadow:0 4px 16px rgba(0,0,0,0.4);
      transition:opacity 0.25s ease; white-space:nowrap;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = type === 'warn' ? '#b08020' : '#1DB954';
  toast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

function showError(msg) {
  console.error(msg);
  showToast(msg, 'warn');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
