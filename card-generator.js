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
   * @param {string}  opts.artUrl    – image URL for album art
   * @param {string}  opts.title     – album / playlist name
   * @param {string}  opts.subtitle  – artist name (omitted for playlists)
   * @param {string}  [opts.type]    – 'album' | 'track' | 'playlist'
   * @returns {Promise<void>}
   */
  async render(canvas, opts) {
    const {
      artUrl   = '',
      title    = 'Unknown',
      subtitle = '',
      type     = 'album',
    } = opts;

    canvas.width  = CARD_W;
    canvas.height = CARD_H;

    const ctx = canvas.getContext('2d');

    // Ensure web fonts are loaded before measuring/drawing text
    await document.fonts.ready;

    let artImg = null;
    if (artUrl) {
      artImg = await loadImage(artUrl).catch(() => null);
    }

    await drawPortraitCard(ctx, artImg, { title, subtitle, type });
  },
};

// ─── Main layout ──────────────────────────────────────────────────────────────

async function drawPortraitCard(ctx, artImg, { title, subtitle, type }) {
  const showArtist = type !== 'playlist' && !!subtitle;

  // ── Clip card to rounded rect ──
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, CORNER);
  ctx.clip();

  // ── Album art (top square) ──
  if (artImg) {
    drawCroppedImage(ctx, artImg, 0, 0, ART_SIZE, ART_SIZE);
  } else {
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, ART_SIZE, ART_SIZE);
    drawMusicNotePlaceholder(ctx, ART_SIZE / 2, ART_SIZE / 2, 160);
  }

  // ── Text zone: always white background ──
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, TEXT_ZONE_Y, CARD_W, TEXT_ZONE_H);

  ctx.restore();

  // ── Text: black, centered in text zone ──
  const padX       = px(56);
  const maxW       = CARD_W - padX * 2;
  const titleSize  = px(44);
  const artistSize = px(28);
  const lineGap    = px(16);

  // Measure title lines first (so we can vertically center the whole block)
  ctx.font = `700 ${titleSize}px 'Inter', system-ui, sans-serif`;
  const titleLines  = measureWrappedLines(ctx, title, maxW, 3);
  const titleBlockH = titleLines.length * titleSize * 1.25;

  const totalH = titleBlockH + (showArtist ? lineGap + artistSize * 1.25 : 0);

  const zoneCenter = TEXT_ZONE_Y + TEXT_ZONE_H / 2;
  const blockTop   = zoneCenter - totalH / 2;

  // Draw title
  ctx.font         = `700 ${titleSize}px 'Inter', system-ui, sans-serif`;
  ctx.fillStyle    = '#111111';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';

  titleLines.forEach((line, i) => {
    ctx.fillText(line, CARD_W / 2, blockTop + i * titleSize * 1.25);
  });

  // Draw artist
  if (showArtist) {
    const artistY = blockTop + titleBlockH + lineGap;
    ctx.font      = `400 ${artistSize}px 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const artistLine = measureWrappedLines(ctx, subtitle, maxW, 1)[0] || subtitle;
    ctx.fillText(artistLine, CARD_W / 2, artistY);
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
