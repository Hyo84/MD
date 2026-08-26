// 로드 시 PNG(`/sprites/...`)를 우선 사용. 404면 캔버스 프로시저럴 베이크로 폴백.
// 마젠타(#FF00FF 및 근접색) 크로마키. 픽셀아트는 그리기 쪽에서 smoothing off.
// enemy_skeleton2.png 는 예비 에셋 — 로드하지 않음.

import { CANVAS_W, CANVAS_H, DEFEAT_Y, UNITS, MONSTERS } from './config.js';

const BG_SCALE = 2;
const UNIT_SIZE = 160;
const MONSTER_SIZE = 160;
const BOSS_SIZE = 220;
const ARCHER_SIZE = 128;
const INK = '#1a140c';
const LW = 3.2;
const FOREST_STRIP_W = 100;
const DIRT_W = 340;

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;
  return { canvas, ctx };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return [180, 160, 120];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function shade(hex, t) {
  return t >= 0 ? mixHex(hex, '#ffffff', t) : mixHex(hex, '#000000', -t);
}

async function toBitmap(canvas) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(canvas);
    } catch {
      /* keep canvas */
    }
  }
  return canvas;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** #FF00FF 및 생성/압축 잔여 근접 마젠타. */
function isNearMagenta(r, g, b) {
  const dist2 = (r - 255) * (r - 255) + g * g + (b - 255) * (b - 255);
  if (dist2 <= 48 * 48) return true;
  return g < 36 && r >= 220 && b >= 210 && Math.abs(r - b) <= 36;
}

function processSprite(img, opts = {}) {
  const chroma = opts.chroma !== false;
  const w = img.width;
  const h = img.height;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);

  let minX = 0;
  let minY = 0;
  let maxX = w - 1;
  let maxY = h - 1;
  if (chroma) {
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    minX = w;
    minY = h;
    maxX = -1;
    maxY = -1;
    for (let i = 0, p = 0; i < px.length; i += 4, p++) {
      let a = px[i + 3];
      if (a >= 8 && isNearMagenta(px[i], px[i + 1], px[i + 2])) {
        a = 0;
        px[i + 3] = 0;
      }
      if (a > 8) {
        const x = p % w;
        const y = (p / w) | 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  let cropped = canvas;
  let cw = w;
  let ch = h;
  if (maxX >= minX) {
    const pad = 2;
    const sx = Math.max(0, minX - pad);
    const sy = Math.max(0, minY - pad);
    cw = Math.min(w, maxX + 1 + pad) - sx;
    ch = Math.min(h, maxY + 1 + pad) - sy;
    if (sx !== 0 || sy !== 0 || cw !== w || ch !== h) {
      const c = makeCanvas(cw, ch);
      c.ctx.imageSmoothingEnabled = false;
      c.ctx.drawImage(canvas, sx, sy, cw, ch, 0, 0, cw, ch);
      cropped = c.canvas;
    }
  }

  const limitW = opts.maxW || cw;
  const limitH = opts.maxH || ch;
  if (cw > limitW || ch > limitH) {
    const scale = Math.min(limitW / cw, limitH / ch, 1);
    const nw = Math.max(1, Math.round(cw * scale));
    const nh = Math.max(1, Math.round(ch * scale));
    const o = makeCanvas(nw, nh);
    o.ctx.imageSmoothingEnabled = false;
    o.ctx.drawImage(cropped, 0, 0, nw, nh);
    return o.canvas;
  }
  return cropped;
}

function pngSpriteList() {
  const list = [];
  for (let t = 1; t <= 10; t++) {
    const id = String(t).padStart(2, '0');
    list.push([`unit_${t}`, `/sprites/ally_t${id}.png`, { chroma: true, maxW: UNIT_SIZE, maxH: UNIT_SIZE }]);
  }
  for (const key of ['goblin', 'orc', 'skeleton', 'troll', 'boss']) {
    const max = key === 'boss' ? BOSS_SIZE : MONSTER_SIZE;
    list.push([`monster_${key}`, `/sprites/enemy_${key}.png`, { chroma: true, maxW: max, maxH: max }]);
  }
  list.push(
    ['archer', '/sprites/ally_archer.png', { chroma: true, maxW: ARCHER_SIZE, maxH: ARCHER_SIZE }],
    ['arrow', '/sprites/fx_arrow.png', { chroma: true, maxW: 96, maxH: 96 }],
    ['bg_field', '/sprites/bg_field.png', { chroma: false, maxW: CANVAS_W * BG_SCALE, maxH: CANVAS_H * BG_SCALE }],
    ['wall_bottom', '/sprites/bg_wall.png', { chroma: false, maxW: CANVAS_W * BG_SCALE, maxH: 220 * BG_SCALE }],
    ['camp_top', '/sprites/bg_camp.png', { chroma: false, maxW: CANVAS_W * BG_SCALE, maxH: 90 * BG_SCALE }],
    ['bg_forest', '/sprites/bg_forest.png', { chroma: false, maxW: FOREST_STRIP_W * 2 * BG_SCALE, maxH: CANVAS_H * BG_SCALE }],
  );
  return list;
}

async function overlayPngSprites(raw) {
  const loaded = new Set();
  for (const [name, url, opts] of pngSpriteList()) {
    const img = await loadImage(url);
    if (!img) continue;
    raw.set(name, processSprite(img, opts));
    loaded.add(name);
  }
  return loaded;
}

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
}

function fillEllipse(ctx, x, y, rx, ry, fill, stroke, lw = LW) {
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke, lw = LW) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rr);
  else ctx.rect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function strokePoly(ctx, pts, fill, stroke, lw = LW) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function paintWoodPanel(ctx, w, h, gold = true) {
  fillRoundRect(ctx, 2, 2, w - 4, h - 4, 7, '#6e4524', INK, 4.2);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8a5a30');
  g.addColorStop(0.45, '#6a4324');
  g.addColorStop(1, '#3e2714');
  ctx.fillStyle = g;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 4);
    ctx.fill();
  } else {
    ctx.fillRect(6, 6, w - 12, h - 12);
  }
  const rand = rng(0xC0FFEE);
  ctx.strokeStyle = 'rgba(40, 24, 10, 0.35)';
  ctx.lineWidth = 1.4;
  for (let y = 10; y < h - 8; y += 8) {
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(w - 10, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(90, 55, 22, 0.4)';
  for (let i = 0; i < 14; i++) {
    ctx.fillRect(10 + rand() * (w - 40), 8 + rand() * (h - 16), 16 + rand() * 36, 2);
  }
  if (gold) {
    ctx.strokeStyle = '#e8c56a';
    ctx.lineWidth = Math.max(2.4, h * 0.055);
    ctx.strokeRect(7, 6, w - 14, h - 12);
    ctx.strokeStyle = 'rgba(255, 230, 150, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(10, 9, w - 20, h - 18);
    ctx.fillStyle = '#c9a050';
    for (const [nx, ny] of [[14, 12], [w - 14, 12], [14, h - 12], [w - 14, h - 12]]) {
      ellipse(ctx, nx, ny, 2.4, 2.4);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
}

function paintStone(ctx, x, y, w, h, seed = 1) {
  const rand = rng(seed);
  ctx.fillStyle = '#5e5c58';
  ctx.fillRect(x, y, w, h);
  const bw = 22;
  const bh = 12;
  for (let row = 0; row < h / bh + 1; row++) {
    const ox = (row % 2) * (bw / 2);
    for (let col = -1; col < w / bw + 1; col++) {
      const bx = x + col * bw + ox;
      const by = y + row * bh;
      const lit = 96 + rand() * 38;
      fillRoundRect(ctx, bx + 1, by + 1, bw - 3, bh - 3, 2,
        `rgb(${lit},${lit - 3},${lit - 12})`, INK, 1.8);
    }
  }
}

function paintGrassClump(ctx, x, y, s, rand) {
  const h = 5 + rand() * 7 * s;
  strokePoly(ctx, [
    [x, y - h],
    [x + 3.5 * s, y + 1],
    [x - 3.5 * s, y + 1],
  ], mixHex('#2f9a38', '#4ecf4a', rand() * 0.5), INK, 1.6);
}

function paintGrassField(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.12);
  sky.addColorStop(0, '#6aa8c0');
  sky.addColorStop(1, '#4cbf58');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const field = ctx.createLinearGradient(0, h * 0.06, 0, h);
  field.addColorStop(0, '#4ecf52');
  field.addColorStop(0.35, '#3bb344');
  field.addColorStop(0.7, '#34a03c');
  field.addColorStop(1, '#2a8234');
  ctx.fillStyle = field;
  ctx.fillRect(0, h * 0.05, w, h);

  const cell = 10;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const checker = ((x / cell) + (y / cell)) | 0;
      if (checker % 2 === 0) {
        ctx.fillStyle = 'rgba(20, 90, 30, 0.10)';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  const rand = rng(0x51A55);
  for (let i = 0; i < 220; i++) {
    paintGrassClump(ctx, rand() * w, h * 0.1 + rand() * h * 0.85, 0.7 + rand() * 0.8, rand);
  }
}

function bakeBgField() {
  const w = CANVAS_W * BG_SCALE;
  const h = CANVAS_H * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  paintGrassField(ctx, CANVAS_W, CANVAS_H);
  return canvas;
}

function bakeDirtPath() {
  const w = DIRT_W * BG_SCALE;
  const h = CANVAS_H * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  const rand = rng(0xD12A);
  const cx = DIRT_W / 2;
  const pathW = DIRT_W / 2 - 6;

  ctx.save();
  const dirt = ctx.createLinearGradient(cx - pathW, 0, cx + pathW, 0);
  dirt.addColorStop(0, 'rgba(196, 148, 72, 0)');
  dirt.addColorStop(0.12, 'rgba(196, 148, 72, 0.55)');
  dirt.addColorStop(0.28, 'rgba(214, 170, 92, 0.95)');
  dirt.addColorStop(0.5, 'rgba(224, 182, 104, 1)');
  dirt.addColorStop(0.72, 'rgba(214, 170, 92, 0.95)');
  dirt.addColorStop(0.88, 'rgba(196, 148, 72, 0.55)');
  dirt.addColorStop(1, 'rgba(196, 148, 72, 0)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, 0, DIRT_W, CANVAS_H);

  ctx.strokeStyle = 'rgba(90, 58, 24, 0.45)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx - pathW * 0.62, 0);
  ctx.lineTo(cx - pathW * 0.48, CANVAS_H);
  ctx.moveTo(cx + pathW * 0.62, 0);
  ctx.lineTo(cx + pathW * 0.48, CANVAS_H);
  ctx.stroke();

  ctx.fillStyle = 'rgba(90, 58, 24, 0.28)';
  for (let i = 0; i < 70; i++) {
    const x = cx + (rand() - 0.5) * pathW * 1.5;
    const y = rand() * CANVAS_H;
    ellipse(ctx, x, y, 4 + rand() * 8, 1.8 + rand() * 2.4);
    ctx.fill();
  }
  ctx.fillStyle = '#c4a060';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 18; i++) {
    const x = cx + (rand() - 0.5) * pathW * 1.15;
    const y = rand() * CANVAS_H;
    ellipse(ctx, x, y, 2 + rand() * 3, 1.2 + rand());
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

function paintPineTree(ctx, x, baseY, height, dark) {
  const lw = Math.max(2.6, height * 0.042);
  const trunkW = Math.max(5, height * 0.14);
  const trunkH = height * 0.26;
  fillRoundRect(ctx, x - trunkW / 2, baseY - trunkH, trunkW, trunkH + 2, 1.5, '#6a3e18', INK, lw * 0.75);
  const greens = dark
    ? ['#143c1c', '#1c5a28', '#247034']
    : ['#1a5c26', '#2a8c38', '#3cb44a'];
  for (let i = 0; i < 3; i++) {
    const top = baseY - height + i * height * 0.17;
    const half = height * (0.26 + i * 0.15);
    const bot = top + height * 0.4;
    strokePoly(ctx, [[x, top], [x + half, bot], [x - half, bot]], greens[i], INK, lw);
  }
  ctx.fillStyle = 'rgba(200, 255, 140, 0.16)';
  ctx.beginPath();
  ctx.moveTo(x - height * 0.05, baseY - height * 0.52);
  ctx.lineTo(x, baseY - height + 3);
  ctx.lineTo(x + height * 0.03, baseY - height * 0.48);
  ctx.fill();
}

function bakeForestDense() {
  const w = FOREST_STRIP_W * BG_SCALE;
  const h = CANVAS_H * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  const g = ctx.createLinearGradient(0, 0, FOREST_STRIP_W, 0);
  g.addColorStop(0, '#0c2412');
  g.addColorStop(0.55, '#164820');
  g.addColorStop(1, '#1e5c28');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, FOREST_STRIP_W, CANVAS_H);

  const rand = rng(0xF0BE57);
  for (let i = 0; i < 36; i++) {
    const x = 6 + rand() * (FOREST_STRIP_W * 0.62);
    const y = 28 + i * 22 + rand() * 10;
    paintPineTree(ctx, x, y, 48 + rand() * 26, true);
  }
  for (let i = 0; i < 26; i++) {
    const x = 14 + rand() * (FOREST_STRIP_W * 0.82);
    const y = 36 + i * 30 + rand() * 12;
    paintPineTree(ctx, x, y, 62 + rand() * 34, false);
  }
  ctx.fillStyle = '#163818';
  ctx.fillRect(0, 0, 8, CANVAS_H);
  return canvas;
}

function bakeWallBottom() {
  const hWorld = CANVAS_H - DEFEAT_Y;
  const w = CANVAS_W * BG_SCALE;
  const h = hWorld * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);

  paintStone(ctx, 0, 22, CANVAS_W, hWorld - 22, 0xBEEF);
  const g = ctx.createLinearGradient(0, 22, 0, hWorld);
  g.addColorStop(0, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.4, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 22, CANVAS_W, hWorld - 22);

  const merlonW = 26;
  const merlonGap = 12;
  for (let x = 4; x < CANVAS_W; x += merlonW + merlonGap) {
    paintStone(ctx, x, 0, merlonW, 26, 0x111 + x);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.strokeRect(x + 0.5, 0.5, merlonW - 1, 25);
  }

  ctx.fillStyle = '#4a4844';
  ctx.fillRect(0, 22, CANVAS_W, 8);
  ctx.fillStyle = '#9a968e';
  ctx.fillRect(0, 22, CANVAS_W, 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 22);
  ctx.lineTo(CANVAS_W, 22);
  ctx.stroke();

  ctx.fillStyle = 'rgba(20,16,12,0.5)';
  ctx.fillRect(0, hWorld - 10, CANVAS_W, 10);
  return canvas;
}

function bakeCampTop() {
  const hWorld = 90;
  const w = CANVAS_W * BG_SCALE;
  const h = hWorld * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);

  const sky = ctx.createLinearGradient(0, 0, 0, hWorld);
  sky.addColorStop(0, '#5a8aa0');
  sky.addColorStop(0.55, '#4a6a58');
  sky.addColorStop(1, '#3a5a38');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, hWorld);

  // burning gatehouse
  fillRoundRect(ctx, 168, 8, 114, 48, 4, '#7a7a78', INK, 3);
  fillRoundRect(ctx, 198, 28, 54, 28, 3, '#2a2018', INK, 2.4);
  strokePoly(ctx, [[160, 12], [225, -8], [290, 12]], '#8a8a86', INK, 3);
  ctx.fillStyle = '#e85a20';
  ellipse(ctx, 210, 18, 10, 8); ctx.fill();
  ellipse(ctx, 240, 14, 8, 7); ctx.fill();
  ctx.fillStyle = '#ffcc44';
  ellipse(ctx, 224, 16, 6, 5); ctx.fill();

  const rand = rng(0xCA12);
  for (let i = 0; i < 6; i++) {
    const tx = 22 + i * 68 + (i > 2 ? 40 : 0) + rand() * 6;
    if (tx > 165 && tx < 290) continue;
    const ty = 28 + (i % 2) * 6;
    strokePoly(ctx, [
      [tx, ty - 18],
      [tx + 24, ty + 12],
      [tx - 24, ty + 12],
    ], mixHex('#c45a28', '#8a3818', rand() * 0.4), INK, 2.8);
    ctx.fillStyle = '#3a2014';
    ctx.fillRect(tx - 5, ty + 2, 10, 10);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(tx - 5, ty + 2, 10, 10);
  }

  for (let x = 0; x < CANVAS_W; x += 13) {
    const logH = 26 + (x * 13) % 10;
    fillRoundRect(ctx, x, hWorld - logH, 10, logH, 1, shade('#6a4224', ((x * 7) % 5) * 0.05 - 0.08), INK, 2.2);
    strokePoly(ctx, [[x + 1, hWorld - logH], [x + 5, hWorld - logH - 8], [x + 9, hWorld - logH]], '#d4c090', INK, 1.8);
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(x + 3, hWorld - logH + 4, 3, logH - 8);
  }
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, hWorld - 8, CANVAS_W, 8);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, hWorld - 8);
  ctx.lineTo(CANVAS_W, hWorld - 8);
  ctx.stroke();

  ctx.fillStyle = 'rgba(200, 200, 200, 0.28)';
  for (const [sx, sy, r] of [[70, 16, 11], [210, 8, 15], [340, 14, 12], [120, 8, 8]]) {
    fillEllipse(ctx, sx, sy, r, r * 0.7, 'rgba(210,210,210,0.28)');
    fillEllipse(ctx, sx + 7, sy - 9, r * 0.55, r * 0.4, 'rgba(230,230,230,0.22)');
  }
  return canvas;
}

function bakeHudTop() {
  const w = CANVAS_W * BG_SCALE;
  const h = 72 * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  paintWoodPanel(ctx, CANVAS_W, 72, true);
  return canvas;
}

function weaponForTier(tier) {
  if (tier <= 2) return 'spear';
  if (tier <= 4) return 'sword';
  if (tier === 5) return 'longsword';
  if (tier === 6) return 'ornate';
  if (tier === 7) return 'hammer';
  if (tier === 8) return 'greatsword';
  if (tier === 9) return 'standard';
  return 'goldblade';
}

/** 아군: 등 뒤(플레이어 시점, 위로 행군). 3/4 살짝 기울임. */
function paintFriendly(ctx, size, tier, baseColor) {
  const s = size / 136;
  ctx.save();
  ctx.translate(size / 2, size * 0.56);
  ctx.transform(1, 0.02, -0.1, 1, 0, 0);
  ctx.scale(s, s);

  const cloth = shade(baseColor, -0.08);
  const plate = mixHex(baseColor, '#d0d6de', tier >= 5 ? 0.42 : 0.1);
  const dark = shade(baseColor, -0.32);
  const trim = tier >= 9 ? '#e8c56a' : tier >= 7 ? '#f0d078' : shade(baseColor, 0.28);
  const weapon = weaponForTier(tier);

  fillEllipse(ctx, 0, 48, 22 + tier * 0.55, 7, 'rgba(0,0,0,0.38)');

  if (tier >= 8) {
    const cape = tier === 10 ? mixHex('#e8a020', '#ff4500', 0.4) : tier === 9 ? '#4a1480' : '#8b0008';
    strokePoly(ctx, [
      [-8, -20], [8, -20], [32, 38], [12, 46], [0, 32], [-12, 46], [-32, 38],
    ], cape, INK, 3.2);
    if (tier === 10) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      fillEllipse(ctx, 0, -8, 44, 50, 'rgba(255, 200, 60, 0.35)');
      ctx.restore();
    }
  } else if (tier >= 6) {
    strokePoly(ctx, [
      [-5, -12], [5, -12], [20, 34], [-20, 34],
    ], dark, INK, 2.8);
  }

  fillRoundRect(ctx, -13, 14, 11, 30, 4, dark, INK, 2.8);
  fillRoundRect(ctx, 2, 14, 11, 30, 4, cloth, INK, 2.8);
  fillRoundRect(ctx, -14, 40, 13, 9, 3, '#2a2218', INK, 2.4);
  fillRoundRect(ctx, 1, 40, 13, 9, 3, '#2a2218', INK, 2.4);

  const tw = 14 + Math.min(8, tier);
  const th = 30 + Math.min(7, tier * 0.5);
  if (tier >= 5) {
    fillRoundRect(ctx, -tw, -14, tw * 2, th, 7, plate, INK, 3.2);
    fillEllipse(ctx, -tw + 1, -8, 11, 8, shade(plate, 0.18), INK, 2.6);
    fillEllipse(ctx, tw - 1, -8, 11, 8, shade(plate, 0.18), INK, 2.6);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(7, 0);
    ctx.moveTo(0, -10);
    ctx.lineTo(0, 14);
    ctx.stroke();
  } else {
    fillRoundRect(ctx, -tw, -12, tw * 2, th, 6, cloth, INK, 3);
    if (tier >= 3) {
      ctx.strokeStyle = shade(baseColor, -0.28);
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-tw + 4, -2 + i * 7);
        ctx.lineTo(tw - 4, -2 + i * 7);
        ctx.stroke();
      }
    }
  }

  if (tier <= 4 || tier === 6) {
    ctx.save();
    ctx.translate(-8, 4);
    ctx.rotate(-0.12);
    const sw = 15 + tier;
    const sh = 18 + tier;
    strokePoly(ctx, [[0, -sh / 2], [sw / 2, -4], [sw / 2, sh / 3], [0, sh / 2], [-sw / 2, sh / 3], [-sw / 2, -4]],
      shade(baseColor, 0.12), INK, 3);
    fillEllipse(ctx, 0, 0, 3.4, 3.4, trim, INK, 1.8);
    ctx.restore();
  }

  if (tier === 7) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.9)';
    ctx.lineWidth = 3.4;
    ctx.shadowColor = '#ffe680';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, -38, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const hr = 13 + tier * 0.38;
  fillEllipse(ctx, 0, -24, hr, hr * 0.95, mixHex(plate, '#8a7a62', tier < 4 ? 0.45 : 0), INK, 3.2);
  ctx.fillStyle = dark;
  ctx.fillRect(-hr + 2, -30, (hr - 2) * 2, 7);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(-hr + 2, -30, (hr - 2) * 2, 7);
  if (tier >= 5) {
    ctx.fillStyle = trim;
    ctx.fillRect(-2.5, -44, 5, 16);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(-2.5, -44, 5, 16);
  }
  if (tier >= 8) {
    strokePoly(ctx, [[-2, -44], [-10, -56], [0, -46]], tier === 10 ? '#ffcc44' : '#c41c1c', INK, 2.2);
    strokePoly(ctx, [[2, -44], [10, -56], [0, -46]], tier === 10 ? '#ffcc44' : '#c41c1c', INK, 2.2);
  }
  if (tier === 10) {
    fillEllipse(ctx, 0, -26, hr + 3, hr + 2, mixHex('#ffd700', '#ff4500', 0.28), INK, 3.2);
    ctx.fillStyle = '#ffe680';
    ctx.fillRect(-3.5, -50, 7, 18);
    strokePoly(ctx, [[-18, -32], [-24, -18], [-10, -24]], '#e8b020', INK, 2.4);
    strokePoly(ctx, [[18, -32], [24, -18], [10, -24]], '#e8b020', INK, 2.4);
  }

  ctx.save();
  ctx.translate(16, -8);
  ctx.rotate(-0.16);
  ctx.strokeStyle = '#4a3420';
  ctx.lineCap = 'round';
  if (weapon === 'spear') {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(0, -54);
    ctx.stroke();
    strokePoly(ctx, [[0, -62], [6, -48], [-6, -48]], '#d0d6de', INK, 2.4);
  } else if (weapon === 'hammer') {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(0, -46);
    ctx.stroke();
    fillRoundRect(ctx, -14, -58, 28, 16, 3, '#e8c56a', INK, 2.8);
  } else if (weapon === 'standard') {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(0, -58);
    ctx.stroke();
    strokePoly(ctx, [[2, -56], [24, -48], [2, -40]], '#6a20a0', INK, 2.4);
  } else {
    ctx.lineWidth = weapon === 'greatsword' || weapon === 'longsword' ? 6 : 4.2;
    ctx.strokeStyle = mixHex('#e8ecee', trim, 0.28);
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, weapon === 'greatsword' || weapon === 'goldblade' ? -60 : -50);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(8, -8);
    ctx.stroke();
    if (weapon === 'goldblade') {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffe680';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -62);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();
}

function bakeUnit(tier) {
  const { canvas, ctx } = makeCanvas(UNIT_SIZE, UNIT_SIZE);
  const color = UNITS[tier - 1]?.color || '#aaa';
  paintFriendly(ctx, UNIT_SIZE, tier, color);
  return canvas;
}

function bakeArcher() {
  const { canvas, ctx } = makeCanvas(ARCHER_SIZE, ARCHER_SIZE);
  ctx.save();
  ctx.translate(ARCHER_SIZE / 2, ARCHER_SIZE * 0.58);
  const s = ARCHER_SIZE / 96;
  ctx.scale(s, s);
  fillEllipse(ctx, 0, 32, 17, 5.5, 'rgba(0,0,0,0.35)');
  fillRoundRect(ctx, -11, 6, 9, 24, 3, '#3a2a18', INK, 2.6);
  fillRoundRect(ctx, 2, 6, 9, 24, 3, '#322418', INK, 2.6);
  fillRoundRect(ctx, -15, -14, 30, 26, 6, '#5c7038', INK, 3);
  fillEllipse(ctx, 0, -24, 12, 11, '#7a5c3c', INK, 2.8);
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(-11, -32, 22, 9);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.strokeRect(-11, -32, 22, 9);
  ctx.strokeStyle = '#d4b078';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(-17, -8, 21, -1.0, 1.0);
  ctx.stroke();
  ctx.strokeStyle = '#f0e6d2';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-17, -28);
  ctx.lineTo(-17, 12);
  ctx.stroke();
  ctx.restore();
  return canvas;
}

/** 적: 정면(남쪽/플레이어를 향해 행군). */
function paintMonster(ctx, size, key) {
  const stat = MONSTERS[key];
  const s = size / 136;
  ctx.save();
  ctx.translate(size / 2, size * 0.56);
  ctx.transform(1, 0.015, 0.08, 1, 0, 0);
  ctx.scale(s, s);
  const col = stat.color;
  fillEllipse(ctx, 0, 46, 24, 7.5, 'rgba(0,0,0,0.4)');

  if (key === 'goblin') {
    fillRoundRect(ctx, -15, 4, 13, 24, 4, shade(col, -0.12), INK, 2.8);
    fillRoundRect(ctx, 2, 4, 13, 24, 4, col, INK, 2.8);
    fillRoundRect(ctx, -20, -18, 40, 30, 10, col, INK, 3.2);
    strokePoly(ctx, [[-24, -20], [-38, -4], [-16, -8]], col, INK, 2.8);
    strokePoly(ctx, [[24, -20], [38, -4], [16, -8]], col, INK, 2.8);
    fillEllipse(ctx, 0, -30, 20, 17, shade(col, 0.12), INK, 3.2);
    fillEllipse(ctx, -8, -32, 4.5, 4, '#1a0000', INK, 1.8);
    fillEllipse(ctx, 8, -32, 4.5, 4, '#1a0000', INK, 1.8);
    ctx.fillStyle = '#ff3030';
    ellipse(ctx, -8, -32, 2.2, 2.2); ctx.fill();
    ellipse(ctx, 8, -32, 2.2, 2.2); ctx.fill();
    ctx.fillStyle = '#1a3010';
    ctx.fillRect(-7, -21, 14, 4);
    ctx.save();
    ctx.translate(22, 6);
    ctx.rotate(0.55);
    fillRoundRect(ctx, -4, -30, 8, 38, 2, '#9aa0a4', INK, 2.4);
    strokePoly(ctx, [[0, -38], [11, -18], [-11, -18]], '#d0d4d8', INK, 2.4);
    ctx.restore();
  } else if (key === 'orc') {
    fillRoundRect(ctx, -17, 6, 15, 28, 4, shade(col, -0.18), INK, 2.8);
    fillRoundRect(ctx, 2, 6, 15, 28, 4, col, INK, 2.8);
    fillRoundRect(ctx, -24, -16, 48, 34, 9, shade(col, -0.04), INK, 3.4);
    fillEllipse(ctx, 0, -32, 24, 19, col, INK, 3.2);
    fillEllipse(ctx, -9, -36, 5.5, 4.5, '#2a0000');
    fillEllipse(ctx, 9, -36, 5.5, 4.5, '#2a0000');
    ctx.fillStyle = '#ff3030';
    ellipse(ctx, -9, -36, 2.6, 2.6); ctx.fill();
    ellipse(ctx, 9, -36, 2.6, 2.6); ctx.fill();
    ctx.fillStyle = '#f0e8d8';
    ctx.fillRect(-18, -18, 6, 11);
    ctx.fillRect(12, -18, 6, 11);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -18, 6, 11);
    ctx.strokeRect(12, -18, 6, 11);
    ctx.save();
    ctx.translate(26, 2);
    ctx.rotate(0.48);
    fillRoundRect(ctx, -5, -10, 10, 32, 2, '#5a4030', INK, 2.4);
    fillRoundRect(ctx, -18, -30, 36, 20, 4, '#9aa0a4', INK, 3);
    ctx.restore();
  } else if (key === 'skeleton') {
    fillRoundRect(ctx, -13, 8, 10, 26, 3, '#e8e8e0', INK, 2.6);
    fillRoundRect(ctx, 3, 8, 10, 26, 3, '#d8d8d0', INK, 2.6);
    ctx.strokeStyle = '#f4f4ec';
    ctx.lineWidth = 3.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-15, -6 + i * 7);
      ctx.lineTo(15, -6 + i * 7);
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-15, -6 + i * 7);
      ctx.lineTo(15, -6 + i * 7);
      ctx.stroke();
    }
    fillEllipse(ctx, 0, -30, 18, 16, '#f4f4ec', INK, 3.2);
    ctx.fillStyle = '#1a1a18';
    ellipse(ctx, -7, -32, 4.5, 5.5); ctx.fill();
    ellipse(ctx, 7, -32, 4.5, 5.5); ctx.fill();
    ctx.fillRect(-3.5, -22, 7, 3.5);
    ctx.save();
    ctx.translate(20, 0);
    ctx.rotate(0.4);
    ctx.strokeStyle = '#f4f4ec';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  } else if (key === 'troll') {
    fillRoundRect(ctx, -22, 8, 18, 32, 5, shade(col, -0.12), INK, 3);
    fillRoundRect(ctx, 4, 8, 18, 32, 5, col, INK, 3);
    fillRoundRect(ctx, -30, -20, 60, 42, 14, shade(col, 0.06), INK, 3.4);
    fillEllipse(ctx, 0, -38, 28, 24, col, INK, 3.4);
    fillEllipse(ctx, -11, -42, 6.5, 5.5, '#1a1008');
    fillEllipse(ctx, 11, -42, 6.5, 5.5, '#1a1008');
    ctx.fillStyle = '#d33';
    ellipse(ctx, -11, -42, 2.8, 2.8); ctx.fill();
    ellipse(ctx, 11, -42, 2.8, 2.8); ctx.fill();
    ctx.save();
    ctx.translate(28, -4);
    ctx.rotate(0.32);
    fillRoundRect(ctx, -12, -38, 24, 50, 7, '#9a8a74', INK, 3);
    fillEllipse(ctx, 1, -42, 17, 15, '#8a7a64', INK, 2.8);
    ctx.restore();
  } else if (key === 'boss') {
    fillRoundRect(ctx, -24, 10, 20, 34, 5, '#4a1010', INK, 3);
    fillRoundRect(ctx, 4, 10, 20, 34, 5, '#6a1818', INK, 3);
    fillRoundRect(ctx, -34, -18, 68, 44, 9, '#7a1c1c', INK, 3.6);
    ctx.fillStyle = '#c8ccd0';
    for (let i = 0; i < 5; i++) {
      const sx = -22 + i * 11;
      strokePoly(ctx, [[sx, -18], [sx + 5, 10], [sx - 5, 10]], '#c8ccd0', INK, 2.2);
    }
    fillEllipse(ctx, 0, -38, 26, 22, '#9a2828', INK, 3.4);
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(-22, -52, 44, 16);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
    ctx.strokeRect(-22, -52, 44, 16);
    strokePoly(ctx, [[-20, -48], [-32, -70], [-8, -50]], '#e8e0d0', INK, 2.6);
    strokePoly(ctx, [[20, -48], [32, -70], [8, -50]], '#e8e0d0', INK, 2.6);
    fillEllipse(ctx, -10, -40, 5.5, 4.5, '#1a0000');
    fillEllipse(ctx, 10, -40, 5.5, 4.5, '#1a0000');
    ctx.fillStyle = '#ff2020';
    ellipse(ctx, -10, -40, 2.8, 2.8); ctx.fill();
    ellipse(ctx, 10, -40, 2.8, 2.8); ctx.fill();
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.arc(0, -28, 8, 0.15, Math.PI - 0.15);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, -8);
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(30, 38);
    ctx.lineTo(-8, -64);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(-10, -70);
    ctx.rotate(-0.5);
    fillRoundRect(ctx, -24, -11, 52, 22, 4, '#a8b0b4', INK, 3);
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}

function bakeMonster(key) {
  const size = key === 'boss' ? BOSS_SIZE : MONSTER_SIZE;
  const { canvas, ctx } = makeCanvas(size, size);
  paintMonster(ctx, size, key);
  return canvas;
}

function bakeEvoBar(unitCanvases) {
  const w = CANVAS_W * BG_SCALE;
  const h = 36 * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  paintWoodPanel(ctx, CANVAS_W, 36, true);
  const slot = 40;
  const startX = (CANVAS_W - slot * 10) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let t = 1; t <= 10; t++) {
    const img = unitCanvases.get(`unit_${t}`);
    const x = startX + (t - 1) * slot;
    if (img) ctx.drawImage(img, x + 6, 2, 28, 28);
    ctx.font = "bold 9px 'Malgun Gothic', sans-serif";
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.fillStyle = '#fff8e8';
    ctx.strokeText(String(t), x + 20, 28);
    ctx.fillText(String(t), x + 20, 28);
  }
  return canvas;
}

class AssetManager {
  constructor() {
    this._map = new Map();
    this._png = new Set();
    this.ready = this._init();
  }

  get(name) {
    return this._map.get(name) || null;
  }

  fromPng(name) {
    return this._png.has(name);
  }

  unit(tier) {
    return this.get(`unit_${tier}`);
  }

  monster(key) {
    return this.get(`monster_${key}`);
  }

  async _init() {
    try {
      const raw = new Map();
      raw.set('bg_field', bakeBgField());
      raw.set('dirt_path', bakeDirtPath());
      raw.set('forest_dense', bakeForestDense());
      raw.set('wall_bottom', bakeWallBottom());
      raw.set('camp_top', bakeCampTop());
      raw.set('hud_top', bakeHudTop());
      raw.set('archer', bakeArcher());
      for (let t = 1; t <= 10; t++) raw.set(`unit_${t}`, bakeUnit(t));
      for (const key of Object.keys(MONSTERS)) raw.set(`monster_${key}`, bakeMonster(key));
      this._png = await overlayPngSprites(raw);
      raw.set('evo_bar', bakeEvoBar(raw));

      const entries = await Promise.all(
        [...raw.entries()].map(async ([name, canvas]) => [name, await toBitmap(canvas)]),
      );
      for (const [name, img] of entries) this._map.set(name, img);
    } catch (err) {
      console.warn('[assets] bake failed, circle fallback will be used', err);
    }
  }
}

export const assets = new AssetManager();
export { UNIT_SIZE, MONSTER_SIZE, BOSS_SIZE, FOREST_STRIP_W, DIRT_W };
