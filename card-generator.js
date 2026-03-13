/**
 * card-generator.js – HTML5 Canvas card renderer
 *
 * Physical target: CR80 ID card in PORTRAIT orientation (54 × 85.6 mm)
 * Output canvas:  1276 × 2022 px  (= 300 DPI × 2 for retina quality)
 *
 * Layout:
 *   Top 1276 × 1276 px  — square album art, full width
 *   Bottom 1276 × 746 px — text zone: title + optional artist
 *
 * When printed at exactly 2.125" × 3.375" the image renders at 300 DPI.
 */

const CARD_W    = 1276;
const CARD_H    = 2022;
const ART_SIZE  = CARD_W;          // square art = full card width
const TEXT_ZONE_Y = ART_SIZE;      // text zone starts right below art
const TEXT_ZONE_H = CARD_H - ART_SIZE; // 746 px
const CORNER    = 48;

// ─── Public API ───────────────────────────────────────────────────────────────

const CardGenerator = {
  /**
   * Render a card onto the given <canvas> element.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {string}  opts.artUrl       – image URL for album art
   * @param {string}  opts.title        – album / playlist name
   * @param {string}  opts.subtitle     – artist name (omitted for playlists)
   * @param {string}  [opts.type]       – 'album' | 'track' | 'playlist'
   * @param {string}  [opts.style]      – 'blurred-bg' | 'solid-dark' | 'solid-light'
   * @param {string}  [opts.spotifyUri]
   * @returns {Promise<void>}
   */
  async render(canvas, opts) {
    const {
      artUrl     = '',
      title      = 'Unknown',
      subtitle   = '',
      type       = 'album',
      style      = 'blurred-bg',
      spotifyUri = '',
    } = opts;

    canvas.width  = CARD_W;
    canvas.height = CARD_H;

    const ctx = canvas.getContext('2d');

    let artImg = null;
    if (artUrl) {
      artImg = await loadImage(artUrl).catch(() => null);
    }

    await drawPortraitCard(ctx, artImg, { title, subtitle, type, style, spotifyUri });
  },
};

// ─── Main layout ──────────────────────────────────────────────────────────────

async function drawPortraitCard(ctx, artImg, { title, subtitle, type, style, spotifyUri }) {
  const isDark   = style !== 'solid-light';
  const textClr  = isDark ? '#ffffff' : '#111118';
  const muteClr  = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  const showArtist = type !== 'playlist' && subtitle;

  // ── Clip card to rounded rect ──
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, CORNER);
  ctx.clip();

  // ── Album art (top square) ──
  if (artImg) {
    drawCroppedImage(ctx, artImg, 0, 0, ART_SIZE, ART_SIZE);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, ART_SIZE, ART_SIZE);
    drawMusicNotePlaceholder(ctx, ART_SIZE / 2, ART_SIZE / 2, 160);
  }

  // ── Text zone background ──
  if (style === 'solid-light') {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, TEXT_ZONE_Y, CARD_W, TEXT_ZONE_H);
  } else if (style === 'solid-dark') {
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, TEXT_ZONE_Y, CARD_W, TEXT_ZONE_H);
  } else {
    // blurred-bg: subtle blurred art tint + dark overlay
    if (artImg) {
      ctx.save();
      ctx.filter = 'blur(28px)';
      ctx.globalAlpha = 0.35;
      drawCroppedImage(ctx, artImg, 0, TEXT_ZONE_Y, CARD_W, TEXT_ZONE_H);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(10, 10, 18, 0.78)';
    ctx.fillRect(0, TEXT_ZONE_Y, CARD_W, TEXT_ZONE_H);
  }

  ctx.restore();

  // ── Text: centered in text zone ──
  const padX    = px(60);
  const maxW    = CARD_W - padX * 2;

  // Measure the text block height to vertically center it
  const titleSize   = px(72);
  const artistSize  = px(38);
  const lineGap     = px(24);  // gap between title last line and artist

  ctx.font = `700 ${titleSize}px 'Inter', system-ui, sans-serif`;
  const titleLines = measureWrappedLines(ctx, title, maxW, 2);
  const titleBlockH = titleLines.length * (titleSize * 1.2);

  let totalH = titleBlockH;
  if (showArtist) totalH += lineGap + artistSize * 1.2;

  // Vertical center in text zone
  const zoneCenter = TEXT_ZONE_Y + TEXT_ZONE_H / 2;
  let   drawY      = zoneCenter - totalH / 2 + titleSize; // baseline of first title line

  // Draw title
  ctx.font      = `700 ${titleSize}px 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = textClr;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  titleLines.forEach((line, i) => {
    ctx.fillText(line, CARD_W / 2, drawY + i * titleSize * 1.2);
  });

  // Draw artist
  if (showArtist) {
    const artistY = drawY + titleBlockH - titleSize + titleSize * 1.2 + lineGap + artistSize;
    ctx.font      = `400 ${artistSize}px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = muteClr;

    const artistLines = measureWrappedLines(ctx, subtitle, maxW, 1);
    ctx.fillText(artistLines[0] || subtitle, CARD_W / 2, artistY);
  }
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function drawMusicNotePlaceholder(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle    = 'rgba(255,255,255,0.07)';
  ctx.font         = `${size}px serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♫', cx, cy);
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

function drawCroppedImage(ctx, img, x, y, w, h) {
  const srcAspect = img.width / img.height;
  const dstAspect = w / h;

  let sx, sy, sw, sh;
  if (srcAspect > dstAspect) {
    sh = img.height;
    sw = img.height * dstAspect;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / dstAspect;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Measure how many lines a string will take when wrapped at maxWidth.
 * Returns the array of line strings (up to maxLines).
 */
function measureWrappedLines(ctx, text, maxWidth, maxLines) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);

  // Truncate last line with ellipsis if we hit the cap
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = last + '…';
  }

  return lines;
}

/** Convert logical px (base 1×) to canvas px (2× retina). */
function px(n) { return n * 2; }

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
