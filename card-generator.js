/**
 * card-generator.js – HTML5 Canvas card renderer
 *
 * Physical target: CR80 ID card (85.6 × 54 mm)
 * Output canvas:  2022 × 1276 px  (= 300 DPI × 2 for retina quality)
 *
 * When the user downloads and prints the PNG at exactly 3.375" × 2.125"
 * (standard ID card tray size), it renders at 300 DPI.
 */

// Canvas dimensions at 2× 300 DPI
const CARD_W = 2022;
const CARD_H = 1276;
const CORNER = 48; // border-radius equivalent

// ─── Public API ───────────────────────────────────────────────────────────────

const CardGenerator = {
  /**
   * Render a card onto the given <canvas> element.
   *
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   * @param {string}  opts.artUrl      – image URL for album art
   * @param {string}  opts.title       – primary label (album / track name)
   * @param {string}  opts.subtitle    – secondary label (artist)
   * @param {string}  [opts.detail]    – small extra info (year, type)
   * @param {string}  [opts.style]     – 'blurred-bg' | 'solid-dark' | 'solid-light'
   * @param {string}  [opts.layout]    – 'left-art' | 'full-art'
   * @param {string}  [opts.spotifyUri]
   * @returns {Promise<void>}
   */
  async render(canvas, opts) {
    const {
      artUrl   = '',
      title    = 'Unknown Title',
      subtitle = '',
      detail   = '',
      style    = 'blurred-bg',
      layout   = 'left-art',
      spotifyUri = '',
    } = opts;

    canvas.width  = CARD_W;
    canvas.height = CARD_H;

    const ctx = canvas.getContext('2d');

    // Load the artwork image
    let artImg = null;
    if (artUrl) {
      artImg = await loadImage(artUrl).catch(() => null);
    }

    // Draw based on layout
    if (layout === 'full-art') {
      await drawFullArt(ctx, artImg, { title, subtitle, detail, style, spotifyUri });
    } else {
      await drawLeftArt(ctx, artImg, { title, subtitle, detail, style, spotifyUri });
    }
  },
};

// ─── Layout: Left Art ─────────────────────────────────────────────────────────

async function drawLeftArt(ctx, artImg, { title, subtitle, detail, style, spotifyUri }) {
  const artSize = CARD_H;       // Square art = full card height
  const textX   = artSize + 60; // Text starts after art + padding
  const textW   = CARD_W - artSize - 60 - 48;

  // ── Background ──
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, CORNER);
  ctx.clip();

  if (style === 'solid-light') {
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else if (style === 'solid-dark') {
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else {
    // blurred-bg: blurred art on right side
    ctx.fillStyle = '#0d0d14';
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    if (artImg) {
      // Draw blurred/zoomed art behind text area
      ctx.globalAlpha = 0.18;
      drawCroppedImage(ctx, artImg, artSize, 0, CARD_W - artSize, CARD_H);
      ctx.globalAlpha = 1;
    }

    // Right-side gradient fade from art edge
    const grad = ctx.createLinearGradient(artSize - CORNER, 0, artSize + 200, 0);
    grad.addColorStop(0, 'rgba(13,13,20,1)');
    grad.addColorStop(1, 'rgba(13,13,20,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(artSize - CORNER, 0, CARD_W, CARD_H);
  }

  ctx.restore();

  // ── Album art (left square) ──
  ctx.save();
  roundedRect(ctx, 0, 0, artSize, artSize, CORNER, 0, 0, CORNER);
  ctx.clip();

  if (artImg) {
    drawCroppedImage(ctx, artImg, 0, 0, artSize, artSize);
  } else {
    // Placeholder
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, artSize, artSize);
    drawMusicNote(ctx, artSize / 2, artSize / 2, 140);
  }

  ctx.restore();

  // ── Text ──
  const isDark  = style !== 'solid-light';
  const textClr = isDark ? '#ffffff' : '#111118';
  const muteClr = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  const centerY = CARD_H / 2;

  // Subtitle (artist)
  if (subtitle) {
    ctx.font = `400 ${px(28)} 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = muteClr;
    fillWrappedText(ctx, subtitle.toUpperCase(), textX, centerY - px(80), textW, px(38), 1);
  }

  // Title (album name) – bigger, bolder
  ctx.font = `700 ${px(68)} 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = textClr;
  fillWrappedText(ctx, title, textX, centerY - px(22), textW, px(82), 2);

  // Detail (year / type)
  if (detail) {
    ctx.font = `300 ${px(26)} 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = muteClr;
    fillWrappedText(ctx, detail, textX, centerY + px(130), textW, px(34), 1);
  }

  // ── Spotify URI / NFC indicator ──
  drawBottomBar(ctx, spotifyUri, { x: textX, textW, isDark });
}

// ─── Layout: Full Art ─────────────────────────────────────────────────────────

async function drawFullArt(ctx, artImg, { title, subtitle, detail, style, spotifyUri }) {
  ctx.save();
  roundedRect(ctx, 0, 0, CARD_W, CARD_H, CORNER);
  ctx.clip();

  // Art fills entire card
  if (artImg) {
    drawCroppedImage(ctx, artImg, 0, 0, CARD_W, CARD_H);
  } else {
    ctx.fillStyle = '#1a1a2a';
    ctx.fillRect(0, 0, CARD_W, CARD_H);
    drawMusicNote(ctx, CARD_W / 2, CARD_H / 2, 160);
  }

  // Bottom gradient overlay for text legibility
  const gradH = CARD_H * 0.55;
  const grad  = ctx.createLinearGradient(0, CARD_H - gradH, 0, CARD_H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, CARD_H - gradH, CARD_W, gradH);

  ctx.restore();

  // Text block anchored to bottom
  const padX   = px(72);
  const textW  = CARD_W - padX * 2;
  const botY   = CARD_H - px(80);

  if (subtitle) {
    ctx.font = `400 ${px(26)} 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.60)';
    fillWrappedText(ctx, subtitle.toUpperCase(), padX, botY - px(134), textW, px(36), 1);
  }

  ctx.font = `700 ${px(66)} 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  fillWrappedText(ctx, title, padX, botY - px(54), textW, px(80), 2);

  // NFC ring bottom-right
  drawNfcIcon(ctx, CARD_W - px(100), CARD_H - px(80), px(36), 'rgba(255,255,255,0.45)');

  // Spotify URI small text
  if (spotifyUri) {
    ctx.font = `300 ${px(20)} 'Inter', system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.fillText(spotifyUri, padX, CARD_H - px(36));
  }
}

// ─── Bottom bar (for left-art layout) ─────────────────────────────────────────

function drawBottomBar(ctx, spotifyUri, { x, textW, isDark }) {
  const barY   = CARD_H - px(66);
  const muteClr = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';

  // Separator line
  ctx.beginPath();
  ctx.moveTo(x, barY);
  ctx.lineTo(x + textW, barY);
  ctx.strokeStyle = muteClr;
  ctx.lineWidth   = 1;
  ctx.stroke();

  // NFC icon
  drawNfcIcon(ctx, x, barY + px(28), px(28), muteClr);

  // URI text
  if (spotifyUri) {
    ctx.font = `300 ${px(19)} monospace`;
    ctx.fillStyle = muteClr;
    ctx.textBaseline = 'middle';
    ctx.fillText(trimUri(spotifyUri, 40), x + px(50), barY + px(28));
    ctx.textBaseline = 'alphabetic';
  }
}

// ─── Drawing primitives ───────────────────────────────────────────────────────

function drawNfcIcon(ctx, cx, cy, r, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.15;
  ctx.lineCap = 'round';
  // Draw 3 concentric arcs
  for (let i = 0; i < 3; i++) {
    const ir = r * (0.35 + i * 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy, ir, Math.PI * 0.7, Math.PI * 2.3);
    ctx.stroke();
  }
  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawMusicNote(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.font      = `${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♫', cx, cy);
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, ...radii) {
  // radii: [all] or [topLeft, topRight, bottomRight, bottomLeft]
  const [tl = 0, tr = tl, br = tl, bl = tl] =
    radii.length === 1 ? [radii[0]] : radii;

  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/**
 * Draw an image cropped/zoomed to fill a rectangle (object-fit: cover).
 */
function drawCroppedImage(ctx, img, x, y, w, h) {
  const srcAspect = img.width / img.height;
  const dstAspect = w / h;

  let sx, sy, sw, sh;
  if (srcAspect > dstAspect) {
    // wider than destination – crop sides
    sh = img.height;
    sw = img.height * dstAspect;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    // taller than destination – crop top/bottom
    sw = img.width;
    sh = img.width / dstAspect;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Fill text, wrapping at maxWidth and capping lines.
 */
function fillWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
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

  // If we hit the line cap, truncate last line with ellipsis
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = last + '…';
  }

  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/**
 * Convert logical pixels (at 1× 150 DPI) to canvas pixels (2× 300 DPI).
 * The canvas is always 2022×1276 regardless of screen DPI.
 * Think of the base dimension as 1011×638 and we double everything.
 */
function px(n) { return n * 2; }

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function trimUri(uri, maxLen) {
  return uri.length > maxLen ? uri.slice(0, maxLen - 1) + '…' : uri;
}
