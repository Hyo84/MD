// 로드 시 HTML5 Canvas로 스프라이트 베이크. 외부 이미지 없음.

import { CANVAS_W, CANVAS_H, DEFEAT_Y, UNITS, MONSTERS } from './config.js';

const BG_SCALE = 2;
const UNIT_SIZE = 160;
const MONSTER_SIZE = 160;
const BOSS_SIZE = 220;
const ARCHER_SIZE = 128;

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
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

function ellipse(ctx, x, y, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
}

function fillEllipse(ctx, x, y, rx, ry, fill, stroke, lw = 1.5) {
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

function fillRoundRect(ctx, x, y, w, h, r, fill, stroke, lw = 1.2) {
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

function strokePoly(ctx, pts, fill, stroke, lw = 1.4) {
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
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6a4e2a');
  g.addColorStop(0.45, '#4a351c');
  g.addColorStop(1, '#2e2112');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < h; y += 7) {
    ctx.fillRect(0, y, w, 1);
  }
  const rand = rng(0xC0FFEE);
  ctx.fillStyle = 'rgba(90, 60, 28, 0.35)';
  for (let i = 0; i < 18; i++) {
    ctx.fillRect(rand() * w, rand() * h, 18 + rand() * 40, 2);
  }
  if (gold) {
    ctx.strokeStyle = '#d4b06a';
    ctx.lineWidth = Math.max(2, h * 0.06);
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(255, 220, 140, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }
}

function paintStone(ctx, x, y, w, h, seed = 1) {
  const rand = rng(seed);
  ctx.fillStyle = '#6d6a66';
  ctx.fillRect(x, y, w, h);
  const bw = 18;
  const bh = 10;
  for (let row = 0; row < h / bh + 1; row++) {
    const ox = (row % 2) * (bw / 2);
    for (let col = -1; col < w / bw + 1; col++) {
      const bx = x + col * bw + ox;
      const by = y + row * bh;
      const lit = 88 + rand() * 40;
      ctx.fillStyle = `rgb(${lit},${lit - 4},${lit - 10})`;
      ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.strokeStyle = 'rgba(30,28,24,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }
  }
}

function paintGrassField(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.18);
  sky.addColorStop(0, '#5a8a9a');
  sky.addColorStop(1, '#3d7a58');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const field = ctx.createLinearGradient(0, h * 0.08, 0, h);
  field.addColorStop(0, '#3a7d5a');
  field.addColorStop(0.35, '#2f6e48');
  field.addColorStop(0.7, '#3d7a42');
  field.addColorStop(1, '#2a5a34');
  ctx.fillStyle = field;
  ctx.fillRect(0, h * 0.06, w, h);

  const cell = 8;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const checker = ((x / cell) + (y / cell)) | 0;
      if (checker % 2 === 0) {
        ctx.fillStyle = 'rgba(20, 70, 40, 0.10)';
        ctx.fillRect(x, y, cell, cell);
      } else if ((x + y) % (cell * 4) === 0) {
        ctx.fillStyle = 'rgba(180, 210, 90, 0.07)';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  const rand = rng(0x51A55);
  ctx.strokeStyle = 'rgba(30, 90, 40, 0.28)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 420; i++) {
    const x = rand() * w;
    const y = h * 0.1 + rand() * h * 0.85;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 5, y - 4 - rand() * 6);
    ctx.stroke();
  }

  // 중앙 흙길: 3칸(250px)에서도 읽히도록 ~120px, 가장자리는 페이드
  const pathW = 124 * (w / CANVAS_W);
  const cx = w / 2;
  ctx.save();
  const dirt = ctx.createLinearGradient(cx - pathW, 0, cx + pathW, 0);
  dirt.addColorStop(0, 'rgba(90, 62, 28, 0)');
  dirt.addColorStop(0.18, 'rgba(110, 78, 36, 0.55)');
  dirt.addColorStop(0.5, 'rgba(140, 100, 48, 0.92)');
  dirt.addColorStop(0.82, 'rgba(110, 78, 36, 0.55)');
  dirt.addColorStop(1, 'rgba(90, 62, 28, 0)');
  ctx.fillStyle = dirt;
  ctx.fillRect(cx - pathW, 0, pathW * 2, h);

  ctx.strokeStyle = 'rgba(70, 48, 22, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 16]);
  ctx.beginPath();
  ctx.moveTo(cx - pathW * 0.42, 0);
  ctx.lineTo(cx - pathW * 0.28, h);
  ctx.moveTo(cx + pathW * 0.42, 0);
  ctx.lineTo(cx + pathW * 0.28, h);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(50, 36, 16, 0.25)';
  for (let i = 0; i < 50; i++) {
    const x = cx + (rand() - 0.5) * pathW * 1.2;
    const y = rand() * h;
    ellipse(ctx, x, y, 3 + rand() * 6, 1.5 + rand() * 2);
    ctx.fill();
  }
  ctx.restore();
}

function bakeBgField() {
  const w = CANVAS_W * BG_SCALE;
  const h = CANVAS_H * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  paintGrassField(ctx, CANVAS_W, CANVAS_H);
  return canvas;
}

function paintArcherFigure(ctx, x, y, scale, decorative) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  fillEllipse(ctx, 0, 18, 9, 3.2, 'rgba(0,0,0,0.35)');
  fillRoundRect(ctx, -6, 2, 5, 14, 2, '#3a2a18', '#1a1208');
  fillRoundRect(ctx, 1, 2, 5, 14, 2, '#322418', '#1a1208');
  fillRoundRect(ctx, -8, -10, 16, 16, 4, decorative ? '#5a6b3a' : '#4a5a28', '#2a3414');
  fillEllipse(ctx, 0, -16, 7, 6.5, '#6a5438', '#2a2010');
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(-6, -20, 12, 5);
  ctx.strokeStyle = '#c8a878';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-10, -8, 12, -0.9, 0.9);
  ctx.stroke();
  ctx.strokeStyle = '#e8dcc0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, -18);
  ctx.lineTo(-10, 2);
  ctx.stroke();
  ctx.restore();
}

function bakeWallBottom() {
  const hWorld = CANVAS_H - DEFEAT_Y;
  const w = CANVAS_W * BG_SCALE;
  const h = hWorld * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);

  paintStone(ctx, 0, 18, CANVAS_W, hWorld - 18, 0xBEEF);
  const g = ctx.createLinearGradient(0, 18, 0, hWorld);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.4, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 18, CANVAS_W, hWorld - 18);

  const merlonW = 22;
  const merlonGap = 14;
  for (let x = 4; x < CANVAS_W; x += merlonW + merlonGap) {
    paintStone(ctx, x, 0, merlonW, 22, 0x111 + x);
    ctx.strokeStyle = 'rgba(20,18,16,0.5)';
    ctx.strokeRect(x + 0.5, 0.5, merlonW - 1, 21);
  }

  ctx.fillStyle = '#5a564e';
  ctx.fillRect(0, 18, CANVAS_W, 6);
  ctx.fillStyle = '#8a8680';
  ctx.fillRect(0, 18, CANVAS_W, 2);

  // 3칸 보드(내부 250px)에서도 보이도록 중앙 근처에 장식 궁수 3명
  paintArcherFigure(ctx, 165, 36, 1.05, true);
  paintArcherFigure(ctx, 225, 34, 1.12, true);
  paintArcherFigure(ctx, 285, 36, 1.05, true);

  ctx.fillStyle = 'rgba(20,16,12,0.45)';
  ctx.fillRect(0, hWorld - 10, CANVAS_W, 10);
  return canvas;
}

function bakeCampTop() {
  const hWorld = 90;
  const w = CANVAS_W * BG_SCALE;
  const h = hWorld * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);

  const g = ctx.createLinearGradient(0, 0, 0, hWorld);
  g.addColorStop(0, '#2a1a14');
  g.addColorStop(0.55, '#3a2418');
  g.addColorStop(1, '#4a3020');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, hWorld);

  const rand = rng(0xCA12);
  for (let i = 0; i < 9; i++) {
    const tx = 28 + i * 48 + rand() * 8;
    const ty = 18 + (i % 3) * 6;
    strokePoly(ctx, [
      [tx, ty - 16],
      [tx + 22, ty + 10],
      [tx - 22, ty + 10],
    ], mixHex('#6b3a22', '#4a2818', rand() * 0.5), '#2a140c', 1.5);
    ctx.fillStyle = '#3a2014';
    ctx.fillRect(tx - 4, ty + 2, 8, 8);
  }

  for (let x = 0; x < CANVAS_W; x += 11) {
    const logH = 22 + (x * 13) % 8;
    ctx.fillStyle = shade('#5a3a22', ((x * 7) % 5) * 0.04 - 0.1);
    ctx.fillRect(x, hWorld - logH, 8, logH);
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(x + 2, hWorld - logH, 2, logH);
    ctx.strokeStyle = 'rgba(20,10,6,0.5)';
    ctx.strokeRect(x + 0.5, hWorld - logH + 0.5, 7, logH - 1);
  }
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, hWorld - 8, CANVAS_W, 8);

  ctx.fillStyle = 'rgba(180, 180, 180, 0.28)';
  for (const [sx, sy, r] of [[70, 22, 10], [210, 14, 14], [340, 20, 11], [120, 10, 8]]) {
    fillEllipse(ctx, sx, sy, r, r * 0.7, 'rgba(200,200,200,0.22)');
    fillEllipse(ctx, sx + 6, sy - 8, r * 0.55, r * 0.4, 'rgba(220,220,220,0.18)');
  }
  return canvas;
}

function bakeStoneSide() {
  const w = 120 * BG_SCALE;
  const h = CANVAS_H * BG_SCALE;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.scale(BG_SCALE, BG_SCALE);
  paintStone(ctx, 0, 0, 120, CANVAS_H, 0x51DE);
  const g = ctx.createLinearGradient(0, 0, 120, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.08)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 120, CANVAS_H);
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

/** 아군: 등 뒤(플레이어 시점, 위로 행군). 128 디자인 공간, 원점 = 중심. */
function paintFriendly(ctx, size, tier, baseColor) {
  const s = size / 128;
  ctx.save();
  ctx.translate(size / 2, size * 0.54);
  ctx.scale(s, s);

  const outline = shade(baseColor, -0.55);
  const cloth = shade(baseColor, -0.12);
  const plate = mixHex(baseColor, '#c8d0d8', tier >= 5 ? 0.35 : 0.08);
  const dark = shade(baseColor, -0.35);
  const trim = tier >= 9 ? '#d4b06a' : tier >= 7 ? '#e8c878' : shade(baseColor, 0.25);
  const weapon = weaponForTier(tier);

  fillEllipse(ctx, 0, 46, 20 + tier * 0.6, 6, 'rgba(0,0,0,0.38)');

  if (tier >= 8) {
    const cape = tier === 10 ? mixHex('#d4a017', '#ff4500', 0.35) : tier === 9 ? '#3a1060' : '#4a0008';
    strokePoly(ctx, [
      [-6, -18], [6, -18], [28, 36], [10, 42], [0, 30], [-10, 42], [-28, 36],
    ], cape, shade(cape, -0.4), 2);
    if (tier === 10) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      fillEllipse(ctx, 0, -8, 42, 48, 'rgba(255, 200, 60, 0.35)');
      ctx.restore();
    }
  } else if (tier >= 6) {
    strokePoly(ctx, [
      [-4, -10], [4, -10], [18, 32], [-18, 32],
    ], dark, outline, 1.5);
  }

  // 다리 (등)
  fillRoundRect(ctx, -11, 14, 9, 28, 3, dark, outline);
  fillRoundRect(ctx, 2, 14, 9, 28, 3, cloth, outline);
  fillRoundRect(ctx, -12, 38, 11, 8, 2, '#2a2218', '#111');
  fillRoundRect(ctx, 1, 38, 11, 8, 2, '#2a2218', '#111');

  // 몸통
  const tw = 12 + Math.min(8, tier);
  const th = 28 + Math.min(6, tier * 0.5);
  if (tier >= 5) {
    fillRoundRect(ctx, -tw, -12, tw * 2, th, 6, plate, outline, 2);
    // 견갑
    fillEllipse(ctx, -tw + 2, -8, 9, 7, shade(plate, 0.15), outline, 1.6);
    fillEllipse(ctx, tw - 2, -8, 9, 7, shade(plate, 0.15), outline, 1.6);
    ctx.strokeStyle = trim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 12);
    ctx.stroke();
  } else {
    fillRoundRect(ctx, -tw, -10, tw * 2, th, 5, cloth, outline, 1.8);
    if (tier >= 3) {
      ctx.strokeStyle = shade(baseColor, -0.25);
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-tw + 3, -4 + i * 6);
        ctx.lineTo(tw - 3, -4 + i * 6);
        ctx.stroke();
      }
    }
  }

  // 등 방패 (T1–T4, T6)
  if (tier <= 4 || tier === 6) {
    ctx.save();
    ctx.translate(-7, 2);
    ctx.rotate(-0.15);
    const sw = 13 + tier;
    const sh = 16 + tier;
    strokePoly(ctx, [[0, -sh / 2], [sw / 2, -4], [sw / 2, sh / 3], [0, sh / 2], [-sw / 2, sh / 3], [-sw / 2, -4]],
      shade(baseColor, 0.1), outline, 1.8);
    fillEllipse(ctx, 0, 0, 3, 3, trim, outline, 1);
    ctx.restore();
  }

  if (tier === 7) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 220, 80, 0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffe680';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, -36, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 헬멧 뒷머리
  const hr = 11 + tier * 0.35;
  fillEllipse(ctx, 0, -22, hr, hr * 0.95, mixHex(plate, '#8a7a62', tier < 4 ? 0.4 : 0), outline, 2);
  ctx.fillStyle = dark;
  ctx.fillRect(-hr + 2, -28, (hr - 2) * 2, 6);
  if (tier >= 5) {
    ctx.fillStyle = trim;
    ctx.fillRect(-2, -40, 4, 14);
  }
  if (tier === 10) {
    fillEllipse(ctx, 0, -24, hr + 3, hr + 2, mixHex('#ffd700', '#ff4500', 0.25), '#a07010', 2.2);
    ctx.fillStyle = '#ffe680';
    ctx.fillRect(-3, -46, 6, 16);
    strokePoly(ctx, [[-16, -30], [-22, -18], [-10, -22]], '#d4a017', '#8a6010');
    strokePoly(ctx, [[16, -30], [22, -18], [10, -22]], '#d4a017', '#8a6010');
  }

  // 무기: 오른손, 위로 치켜듦
  ctx.save();
  ctx.translate(14, -6);
  ctx.rotate(-0.18);
  ctx.strokeStyle = '#4a3a28';
  ctx.lineCap = 'round';
  if (weapon === 'spear') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(0, -52);
    ctx.stroke();
    strokePoly(ctx, [[0, -58], [5, -46], [-5, -46]], '#c0c8d0', '#333');
  } else if (weapon === 'hammer') {
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(0, -44);
    ctx.stroke();
    fillRoundRect(ctx, -12, -54, 24, 14, 2, '#d4b06a', '#6a5018', 1.6);
  } else if (weapon === 'standard') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(0, -56);
    ctx.stroke();
    strokePoly(ctx, [[2, -54], [22, -48], [2, -40]], '#6a20a0', '#d4b06a', 1.4);
  } else {
    ctx.lineWidth = weapon === 'greatsword' || weapon === 'longsword' ? 5 : 3.5;
    ctx.strokeStyle = mixHex('#d8dce0', trim, 0.3);
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, weapon === 'greatsword' || weapon === 'goldblade' ? -58 : -48);
    ctx.stroke();
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.lineTo(7, -8);
    ctx.stroke();
    if (weapon === 'goldblade') {
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffe680';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -60);
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
  fillEllipse(ctx, 0, 32, 16, 5, 'rgba(0,0,0,0.35)');
  fillRoundRect(ctx, -10, 6, 8, 22, 2, '#3a2a18', '#1a1208');
  fillRoundRect(ctx, 2, 6, 8, 22, 2, '#322418', '#1a1208');
  fillRoundRect(ctx, -14, -12, 28, 24, 5, '#5a6b38', '#2a3414', 2);
  fillEllipse(ctx, 0, -22, 11, 10, '#6a5438', '#2a2010', 2);
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(-10, -30, 20, 8);
  ctx.strokeStyle = '#c8a878';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(-16, -8, 20, -1.0, 1.0);
  ctx.stroke();
  ctx.strokeStyle = '#f0e6d2';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-16, -26);
  ctx.lineTo(-16, 10);
  ctx.stroke();
  ctx.restore();
  return canvas;
}

/** 적: 정면(남쪽/플레이어를 향해 행군). */
function paintMonster(ctx, size, key) {
  const stat = MONSTERS[key];
  const s = size / 128;
  ctx.save();
  ctx.translate(size / 2, size * 0.55);
  ctx.scale(s, s);
  const col = stat.color;
  const out = stat.outline;
  fillEllipse(ctx, 0, 44, 22, 7, 'rgba(0,0,0,0.4)');

  if (key === 'goblin') {
    fillRoundRect(ctx, -14, 4, 12, 22, 3, shade(col, -0.15), out);
    fillRoundRect(ctx, 2, 4, 12, 22, 3, col, out);
    fillRoundRect(ctx, -18, -16, 36, 28, 8, col, out, 2);
    strokePoly(ctx, [[-22, -18], [-34, -6], [-16, -8]], col, out);
    strokePoly(ctx, [[22, -18], [34, -6], [16, -8]], col, out);
    fillEllipse(ctx, 0, -28, 18, 16, shade(col, 0.1), out, 2);
    fillEllipse(ctx, -7, -30, 4, 3.5, '#1a0000', '#400');
    fillEllipse(ctx, 7, -30, 4, 3.5, '#1a0000', '#400');
    ctx.fillStyle = '#e22';
    ellipse(ctx, -7, -30, 2, 2); ctx.fill();
    ellipse(ctx, 7, -30, 2, 2); ctx.fill();
    ctx.fillStyle = '#1a3010';
    ctx.fillRect(-6, -20, 12, 3);
    ctx.save();
    ctx.translate(20, 4);
    ctx.rotate(0.6);
    ctx.fillStyle = '#888';
    ctx.fillRect(-3, -28, 6, 36);
    strokePoly(ctx, [[0, -36], [10, -18], [-10, -18]], '#c0c4c8', '#333');
    ctx.restore();
  } else if (key === 'orc') {
    fillRoundRect(ctx, -16, 6, 14, 26, 3, shade(col, -0.2), out);
    fillRoundRect(ctx, 2, 6, 14, 26, 3, col, out);
    fillRoundRect(ctx, -22, -14, 44, 32, 8, shade(col, -0.05), out, 2.2);
    fillEllipse(ctx, 0, -30, 22, 18, col, out, 2.2);
    fillEllipse(ctx, -8, -34, 5, 4, '#2a0000');
    fillEllipse(ctx, 8, -34, 5, 4, '#2a0000');
    ctx.fillStyle = '#ff3030';
    ellipse(ctx, -8, -34, 2.4, 2.4); ctx.fill();
    ellipse(ctx, 8, -34, 2.4, 2.4); ctx.fill();
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(-16, -18, 5, 10);
    ctx.fillRect(11, -18, 5, 10);
    ctx.save();
    ctx.translate(24, 2);
    ctx.rotate(0.5);
    ctx.fillStyle = '#5a4030';
    ctx.fillRect(-4, -8, 8, 28);
    fillRoundRect(ctx, -16, -28, 32, 18, 3, '#8a8e90', '#333', 2);
    ctx.restore();
  } else if (key === 'skeleton') {
    fillRoundRect(ctx, -12, 8, 9, 24, 2, '#d8d8d0', '#6e6e6e');
    fillRoundRect(ctx, 3, 8, 9, 24, 2, '#c8c8c0', '#6e6e6e');
    ctx.strokeStyle = '#e8e8e0';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-14, -6 + i * 6);
      ctx.lineTo(14, -6 + i * 6);
      ctx.stroke();
    }
    fillEllipse(ctx, 0, -28, 16, 15, '#f0f0e8', '#6e6e6e', 2);
    ctx.fillStyle = '#1a1a18';
    ellipse(ctx, -6, -30, 4, 5); ctx.fill();
    ellipse(ctx, 6, -30, 4, 5); ctx.fill();
    ctx.fillRect(-3, -22, 6, 3);
    ctx.save();
    ctx.translate(18, 0);
    ctx.rotate(0.45);
    ctx.strokeStyle = '#e8e8e0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -32);
    ctx.stroke();
    ctx.restore();
  } else if (key === 'troll') {
    fillRoundRect(ctx, -20, 8, 16, 30, 4, shade(col, -0.15), out);
    fillRoundRect(ctx, 4, 8, 16, 30, 4, col, out);
    fillRoundRect(ctx, -28, -18, 56, 40, 12, shade(col, 0.05), out, 2.4);
    fillEllipse(ctx, 0, -36, 26, 22, col, out, 2.4);
    fillEllipse(ctx, -10, -40, 6, 5, '#1a1008');
    fillEllipse(ctx, 10, -40, 6, 5, '#1a1008');
    ctx.fillStyle = '#c33';
    ellipse(ctx, -10, -40, 2.5, 2.5); ctx.fill();
    ellipse(ctx, 10, -40, 2.5, 2.5); ctx.fill();
    ctx.save();
    ctx.translate(26, -4);
    ctx.rotate(0.35);
    fillRoundRect(ctx, -10, -36, 22, 48, 6, '#8a7a68', '#3a3020', 2);
    fillEllipse(ctx, 1, -40, 16, 14, '#7a6a58', '#3a3020', 2);
    ctx.restore();
  } else if (key === 'boss') {
    fillRoundRect(ctx, -22, 10, 18, 32, 4, '#4a1010', '#2a0808');
    fillRoundRect(ctx, 4, 10, 18, 32, 4, '#5a1818', '#2a0808');
    fillRoundRect(ctx, -32, -16, 64, 42, 8, '#6a1a1a', out, 2.6);
    ctx.fillStyle = '#c0c4c8';
    for (let i = 0; i < 5; i++) {
      const sx = -20 + i * 10;
      strokePoly(ctx, [[sx, -16], [sx + 4, 8], [sx - 4, 8]], '#b8bcc0', '#333');
    }
    fillEllipse(ctx, 0, -36, 24, 20, '#8a2424', out, 2.4);
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(-20, -48, 40, 14);
    strokePoly(ctx, [[-18, -46], [-28, -66], [-8, -48]], '#d8d0c0', '#333');
    strokePoly(ctx, [[18, -46], [28, -66], [8, -48]], '#d8d0c0', '#333');
    fillEllipse(ctx, -9, -38, 5, 4, '#1a0000');
    fillEllipse(ctx, 9, -38, 5, 4, '#1a0000');
    ctx.fillStyle = '#ff2020';
    ellipse(ctx, -9, -38, 2.6, 2.6); ctx.fill();
    ellipse(ctx, 9, -38, 2.6, 2.6); ctx.fill();
    ctx.save();
    ctx.translate(0, -8);
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(28, 36);
    ctx.lineTo(-8, -62);
    ctx.stroke();
    ctx.fillStyle = '#8a9094';
    ctx.save();
    ctx.translate(-10, -68);
    ctx.rotate(-0.5);
    fillRoundRect(ctx, -22, -10, 48, 20, 4, '#9aa0a4', '#222', 2);
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
  for (let t = 1; t <= 10; t++) {
    const img = unitCanvases.get(`unit_${t}`);
    const x = startX + (t - 1) * slot;
    if (img) ctx.drawImage(img, x + 6, 4, 28, 28);
  }
  return canvas;
}

class AssetManager {
  constructor() {
    this._map = new Map();
    this.ready = this._init();
  }

  get(name) {
    return this._map.get(name) || null;
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
      raw.set('wall_bottom', bakeWallBottom());
      raw.set('camp_top', bakeCampTop());
      raw.set('stone_side', bakeStoneSide());
      raw.set('hud_top', bakeHudTop());
      raw.set('archer', bakeArcher());
      for (let t = 1; t <= 10; t++) raw.set(`unit_${t}`, bakeUnit(t));
      raw.set('evo_bar', bakeEvoBar(raw));
      for (const key of Object.keys(MONSTERS)) raw.set(`monster_${key}`, bakeMonster(key));

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
export { UNIT_SIZE, MONSTER_SIZE, BOSS_SIZE };
