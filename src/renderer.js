// 전장 레이어 렌더러. 베이크된 스프라이트 + 프레임당 펄스/파티클만.

import {
  CANVAS_W, CANVAS_H, DEFEAT_Y, LAUNCHER_Y, LINE_START_Y,
  CAMP_DEST_Y, CAMP_DRAW_H,
  BALANCE, UNITS, MONSTERS, HEROES, HERO_MISSION_DAMAGE, HERO_BOSS_LIMIT,
  HERO_ASCENSION_SLOWMO,
} from './config.js';
import { assets, DIRT_W } from './assets.js';
import { drawHud } from './hud.js';

const EVO_BAR_H = 36;
const EVO_SLOT_W = 40;
const EVO_SLOT_COUNT = 10;
const FOREST_DRAW_H = CANVAS_H;
const FOREST_SEAM_W = 2;

export function evoBarMetrics() {
  const y = CANVAS_H - EVO_BAR_H;
  const slot = EVO_SLOT_W;
  const startX = (CANVAS_W - slot * EVO_SLOT_COUNT) / 2;
  return { x: 0, y, w: CANVAS_W, h: EVO_BAR_H, slot, startX, count: EVO_SLOT_COUNT };
}

export function colorAlpha(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Visual radius for sprites / HP bars / grade badges. Physics still uses UNITS.r. */
function unitDrawR(stat) {
  return stat.drawR ?? stat.r;
}

/** Uniform scale that fits img inside a maxW×maxH box (no stretch to square). */
function fitSpriteSize(img, maxW, maxH) {
  const iw = Math.max(1, img.width || maxW);
  const ih = Math.max(1, img.height || maxH);
  const scale = Math.min(maxW / iw, maxH / ih);
  return { dw: iw * scale, dh: ih * scale };
}

function drawSprite(ctx, img, x, y, w, h, opts = {}) {
  if (!img) return false;
  const { dw, dh } = fitSpriteSize(img, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flash) ctx.filter = 'brightness(2.4) saturate(0.4)';
  if (opts.stretchY && opts.stretchY !== 1) {
    ctx.translate(x, y);
    ctx.scale(1 / Math.sqrt(opts.stretchY), opts.stretchY);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(img, x - dw / 2, y - dh / 2, dw, dh);
  }
  ctx.restore();
  return true;
}

/** Full-canvas draw with uniform scale (cover). Dest is always 450×800, never the playable inset. */
function drawFieldBackground(ctx, img) {
  if (!img) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const iw = img.width || CANVAS_W;
  const ih = img.height || CANVAS_H;
  const scale = Math.max(CANVAS_W / iw, CANVAS_H / ih);
  const w = iw * scale;
  const h = ih * scale;
  ctx.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
  ctx.restore();
  return true;
}

function fallbackCircle(ctx, x, y, r, fill, stroke, label, labelColor = '#fff') {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke || 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (label) {
    ctx.fillStyle = labelColor;
    ctx.font = `bold ${Math.max(11, r * 0.62)}px 'Malgun Gothic', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 1);
  }
  ctx.restore();
}

function drawHpBar(ctx, x, y, w, ratio, color) {
  const r = Math.max(0, Math.min(1, ratio));
  if (r >= 0.999) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x - w / 2, y, w, 5);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y, w * r, 5);
  ctx.restore();
}

/** 두꺼운 아웃라인 등급 숫자. 머리 위, 스프라이트를 가리지 않게 작게. */
function drawGradeBadge(ctx, x, y, label, bodyR) {
  const text = String(label);
  const fs = Math.max(11, Math.min(22, Math.round(bodyR * 0.78 * (text.length > 1 ? 0.72 : 1))));
  ctx.save();
  ctx.font = `900 ${fs}px 'Arial Black', 'Malgun Gothic', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(3.6, fs * 0.28);
  ctx.strokeStyle = '#1a140c';
  ctx.fillStyle = '#fff8e8';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawT10Particles(ctx, x, y, r, t) {
  for (let i = 0; i < 10; i++) {
    const a = t * 1.8 + i * (Math.PI * 2 / 10);
    const orbit = r + 6 + Math.sin(t * 2.4 + i) * 4;
    const px = x + Math.cos(a) * orbit;
    const py = y + Math.sin(a * 1.15) * (r * 0.55);
    const pulse = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3.2 + i));
    ctx.fillStyle = `rgba(255, 215, 40, ${pulse})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.6 + (i % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMotionStreaks(ctx, x, y, r, color) {
  ctx.save();
  ctx.strokeStyle = colorAlpha(color, 0.45);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 1; i <= 4; i++) {
    const yy = y + r + i * 6;
    ctx.globalAlpha = 0.55 - i * 0.1;
    ctx.beginPath();
    ctx.moveTo(x - 3 + (i % 2) * 6, yy);
    ctx.lineTo(x - 3 + (i % 2) * 6, yy + 11);
    ctx.stroke();
  }
  ctx.restore();
}

function fillWoodFrame(ctx, x, y, w, h) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#6a4324';
  ctx.strokeStyle = '#1a140c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#e8c56a';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x + 4, y + 3, w - 8, h - 6);
  ctx.restore();
}

function drawAimArrow(ctx, game) {
  if (game.state !== 'playing') return;
  const x = game.aimX;
  const y0 = LAUNCHER_Y - 22;
  const y1 = Math.min(LAUNCHER_Y - 36, Math.max(game.lineY + 24, LINE_START_Y + 20));
  const dragging = game.dragging;
  ctx.save();
  ctx.strokeStyle = dragging ? 'rgba(255, 220, 90, 0.85)' : 'rgba(255, 230, 140, 0.42)';
  ctx.lineWidth = dragging ? 3 : 2;
  ctx.setLineDash(dragging ? [] : [7, 8]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = dragging ? 'rgba(255, 220, 80, 0.95)' : 'rgba(255, 230, 140, 0.55)';
  ctx.beginPath();
  ctx.moveTo(x, y1 - 2);
  ctx.lineTo(x - 7, y1 + 14);
  ctx.lineTo(x + 7, y1 + 14);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDirtPath(ctx) {
  const dirt = assets.get('dirt_path');
  const dirtW = DIRT_W;
  const dx = (CANVAS_W - dirtW) / 2;
  const y0 = 72;
  const h = DEFEAT_Y - y0 + 8;
  if (dirt) ctx.drawImage(dirt, dx, y0, dirtW, h);
  else {
    ctx.fillStyle = 'rgba(214, 170, 92, 0.9)';
    ctx.fillRect(dx, y0, dirtW, h);
  }
}

function forestPanelSize(img) {
  const ih = Math.max(1, img.height || FOREST_DRAW_H);
  const iw = Math.max(1, img.width || 120);
  const h = FOREST_DRAW_H;
  const w = (iw / ih) * h;
  return { w, h };
}

function drawForestPanel(ctx, img, x, y, w, h, flip) {
  if (!img || w <= 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
}

/** Side forests keep aspect ratio and slide off-canvas as the playable inset shrinks. */
function drawSideForest(ctx, left, right) {
  const forestPng = assets.get('bg_forest');
  const dense = forestPng || assets.get('forest_dense');
  if (dense) {
    const { w: fw, h: fh } = forestPanelSize(dense);
    if (fw > 0) {
      for (let x = left - fw; x > -fw; x -= fw) {
        drawForestPanel(ctx, dense, x, 0, fw, fh, false);
      }
      for (let x = right; x < CANVAS_W; x += fw) {
        drawForestPanel(ctx, dense, x, 0, fw, fh, true);
      }
    }
  } else if (left > 0) {
    ctx.fillStyle = '#143c1c';
    ctx.fillRect(0, 0, left, CANVAS_H);
    ctx.fillRect(right, 0, CANVAS_W - right, CANVAS_H);
  }
}

/** 1–2px black seam where forest meets the playable field. */
function drawForestFieldSeam(ctx, left, right) {
  ctx.save();
  ctx.fillStyle = '#000';
  if (left > 0) ctx.fillRect(left - FOREST_SEAM_W, 0, FOREST_SEAM_W, CANVAS_H);
  if (right < CANVAS_W) ctx.fillRect(right, 0, FOREST_SEAM_W, CANVAS_H);
  ctx.restore();
}

/** Same black seam as the forest, where the camp band meets the field. */
function drawCampFieldSeam(ctx, left, right) {
  const y = CAMP_DEST_Y + CAMP_DRAW_H - FOREST_SEAM_W;
  const w = Math.max(1, right - left);
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(left, y, w, FOREST_SEAM_W);
  ctx.restore();
}

/** Cached source rect: skip empty top of the wall PNG so stone fills Maginot→bottom. */
let _wallStoneSrc = null;
let _wallStoneKey = null;

function wallStoneSource(wall) {
  const iw = Math.max(1, wall.width || CANVAS_W);
  const ih = Math.max(1, wall.height || (CANVAS_H - DEFEAT_Y));
  const key = `${iw}x${ih}`;
  if (_wallStoneSrc && _wallStoneKey === key) return _wallStoneSrc;

  let sy = 0;
  try {
    const probe = document.createElement('canvas');
    probe.width = iw;
    probe.height = ih;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(wall, 0, 0);
    const { data } = pctx.getImageData(0, 0, iw, ih);
    const er = data[0];
    const eg = data[1];
    const eb = data[2];
    const thresh = iw * 0.08;
    for (let y = 0; y < ih; y++) {
      let hits = 0;
      const row = y * iw * 4;
      for (let x = 0; x < iw; x++) {
        const i = row + x * 4;
        if (Math.abs(data[i] - er) + Math.abs(data[i + 1] - eg) + Math.abs(data[i + 2] - eb) > 48) {
          hits++;
          if (hits > thresh) {
            sy = y;
            y = ih;
            break;
          }
        }
      }
    }
  } catch {
    sy = 0;
  }
  if (sy > ih * 0.7) sy = 0;
  _wallStoneKey = key;
  _wallStoneSrc = { sx: 0, sy, sw: iw, sh: Math.max(1, ih - sy) };
  return _wallStoneSrc;
}

/** Castle wall: dest covers Maginot (DEFEAT_Y) to canvas bottom. Crop empty PNG top. */
function drawCastleWall(ctx) {
  const destY = DEFEAT_Y;
  const destH = CANVAS_H - DEFEAT_Y;
  const wall = assets.get('wall_bottom');
  if (!wall) {
    ctx.fillStyle = 'rgba(90, 90, 96, 0.9)';
    ctx.fillRect(0, destY, CANVAS_W, destH);
    return;
  }
  const { sx, sy, sw, sh } = wallStoneSource(wall);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(wall, sx, sy, sw, sh, 0, destY, CANVAS_W, destH);
  ctx.restore();
}

function drawDefeatLine(ctx, left, right) {
  const pulse = 12 + Math.sin(performance.now() / 280) * 6;
  ctx.save();
  ctx.strokeStyle = '#ff3333';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 9]);
  ctx.shadowColor = '#ff2222';
  ctx.shadowBlur = pulse;
  ctx.beginPath();
  ctx.moveTo(left, DEFEAT_Y);
  ctx.lineTo(right, DEFEAT_Y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255, 80, 80, ${0.35 + 0.25 * Math.sin(performance.now() / 280)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, DEFEAT_Y);
  ctx.lineTo(right, DEFEAT_Y);
  ctx.stroke();
  ctx.restore();
}

function drawWaveLine(ctx, game, left, right) {
  ctx.save();
  ctx.strokeStyle = '#c33a5a';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#e0335a';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.moveTo(left, game.lineY);
  ctx.lineTo(right, game.lineY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 160, 170, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(left, game.lineY);
  ctx.lineTo(right, game.lineY);
  ctx.stroke();
  ctx.restore();
}

function drawWallHp(ctx, game, left, right) {
  if (!game.wall || game.wall.broken) return;
  const w = right - left;
  const ratio = game.wall.maxHp > 0 ? game.wall.hp / game.wall.maxHp : 0;
  const barPad = Math.max(16, Math.min(40, w * 0.09));
  const barY = DEFEAT_Y + 36;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(left + barPad, barY, w - barPad * 2, 6);
  ctx.fillStyle = ratio > 0.35 ? '#8ec8ff' : '#ff8866';
  ctx.fillRect(left + barPad, barY, (w - barPad * 2) * ratio, 6);
  ctx.fillStyle = '#dce8f4';
  ctx.font = "11px 'Malgun Gothic', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`방어벽 ${game.wall.hp} / ${game.wall.maxHp}`, (left + right) / 2, barY + 8);
  ctx.restore();
}

function drawArchers(ctx, game) {
  const arrow = assets.get('arrow');
  for (const shot of game.archerShots) {
    const alpha = Math.max(0, shot.life / 0.12);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (arrow) {
      const dx = shot.x2 - shot.x1;
      const dy = shot.y2 - shot.y1;
      const len = Math.hypot(dx, dy) || 1;
      const mx = (shot.x1 + shot.x2) / 2;
      const my = (shot.y1 + shot.y2) / 2;
      const target = Math.min(28, Math.max(16, len * 0.35));
      const { dw: aw, dh: ah } = fitSpriteSize(arrow, target, target);
      ctx.imageSmoothingEnabled = false;
      ctx.translate(mx, my);
      ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
      ctx.drawImage(arrow, -aw / 2, -ah / 2, aw, ah);
    } else {
      ctx.strokeStyle = '#e8ff9a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.x1, shot.y1);
      ctx.lineTo(shot.x2, shot.y2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (!game.wall || game.wall.broken || game.archers.length === 0) return;
  const spr = assets.get('archer');
  for (const a of game.archers) {
    const flash = a.flashT > 0;
    if (!drawSprite(ctx, spr, a.x, a.y, 36, 36, { flash, alpha: a.ammo > 0 ? 1 : 0.55 })) {
      fallbackCircle(ctx, a.x, a.y, 11, flash ? '#fff' : (a.ammo > 0 ? '#6b8f3c' : '#4a4a40'), '#2a3a18', '궁');
    }
    ctx.save();
    ctx.fillStyle = a.ammo > 0 ? '#e8ff9a' : '#ff8080';
    ctx.font = "10px 'Malgun Gothic', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${a.ammo}/${a.maxAmmo}`, a.x, a.y - 16);
    ctx.restore();
  }
}

function drawRangeIndicators(ctx, game) {
  if (game.rangeMode === 0) return;
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.setLineDash([]);
  if (game.rangeMode >= 1) {
    for (const u of game.units) {
      const { x, y } = u.body.position;
      ctx.strokeStyle = colorAlpha(u.color, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, game._unitStat(u).range, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (game.wall && !game.wall.broken) {
      const range = game._effects().archerRange;
      for (const a of game.archers) {
        ctx.strokeStyle = 'rgba(180, 210, 140, 0.45)';
        ctx.beginPath();
        ctx.arc(a.x, a.y, range, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  if (game.rangeMode === 2) {
    for (const m of game.enemies) {
      const stat = MONSTERS[m.key];
      ctx.strokeStyle = colorAlpha(stat.color, 0.65);
      ctx.beginPath();
      ctx.arc(m.x, m.y, stat.r + BALANCE.enemyReach, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawEnemies(ctx, game) {
  const t = performance.now() / 1000;
  for (const m of game.enemies) {
    const stat = MONSTERS[m.key];
    const spr = assets.monster(m.key);
    const dim = stat.r * 2.35;
    const flash = m.flashT > 0;
    ctx.save();
    if (m.joining) ctx.globalAlpha = 0.9;
    const ok = drawSprite(ctx, spr, m.x, m.y, dim, dim, { flash });
    ctx.restore();
    if (!ok) {
      fallbackCircle(
        ctx, m.x, m.y, stat.r,
        flash ? '#ffffff' : stat.color, stat.outline, stat.grade || stat.icon,
        m.key === 'skeleton' ? '#333' : '#fff',
      );
    }
    if (m.stunT > 0) {
      ctx.fillStyle = '#87CEFA';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✦', m.x, m.y - stat.r - 14);
    }
    if (m.burn) {
      ctx.fillStyle = '#FF8C00';
      ctx.beginPath();
      ctx.arc(m.x + stat.r * 0.5, m.y - stat.r * 0.5, 4 + Math.sin(t * 8) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    drawHpBar(ctx, m.x, m.y - stat.r - 16, stat.r * 2, m.hp / m.maxHp, '#e74c3c');
    drawGradeBadge(ctx, m.x, m.y - stat.r - 4, stat.grade || stat.icon, stat.r);
  }
}

/** Remaining mission + remaining boss pips under a living T10 hero. HP/grade stay above. */
function drawHeroFootHud(ctx, u, x, y, drawR) {
  const quota = u.targetDamage || HERO_MISSION_DAMAGE;
  const remainingDmg = Math.max(0, quota - (u.missionDamage || 0));
  const remainRatio = quota > 0 ? remainingDmg / quota : 0;
  const gw = Math.max(36, drawR * 2.2);
  const gh = 5;
  const gx = x - gw / 2;
  const gy = y + drawR + 8;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = remainRatio > 0.22 ? '#FFD700' : '#ff8866';
  ctx.fillRect(gx, gy, gw * remainRatio, gh);
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx, gy, gw, gh);

  if (gw >= 36) {
    const label = remainingDmg >= 1000
      ? `${Math.ceil(remainingDmg / 1000)}k`
      : String(Math.ceil(remainingDmg));
    ctx.font = "bold 9px 'Malgun Gothic', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = 'rgba(26, 20, 12, 0.85)';
    ctx.fillStyle = '#fff3c0';
    ctx.strokeText(label, gx + gw + 3, gy + gh / 2);
    ctx.fillText(label, gx + gw + 3, gy + gh / 2);
  }

  const remainingBoss = Math.max(0, HERO_BOSS_LIMIT - (u.bossKills || 0));
  const pipR = 3.2;
  const pipGap = 10;
  const pipY = gy + gh + 8;
  const pipX0 = x - ((HERO_BOSS_LIMIT - 1) * pipGap) / 2;
  for (let i = 0; i < HERO_BOSS_LIMIT; i++) {
    const px = pipX0 + i * pipGap;
    const unfilled = i < remainingBoss;
    ctx.beginPath();
    ctx.arc(px, pipY, pipR, 0, Math.PI * 2);
    if (unfilled) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeStyle = 'rgba(255, 215, 80, 0.95)';
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(72, 62, 44, 0.9)';
      ctx.strokeStyle = 'rgba(36, 28, 18, 0.95)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFriendlies(ctx, game) {
  const t = performance.now() / 1000;
  for (const u of game.units) {
    const { x, y } = u.body.position;
    const drawR = unitDrawR(game._unitStat(u));
    const spr = assets.unit(u.tier);
    const dim = drawR * 2.4;
    const flash = u.flashT > 0;
    const stretching = !u.settled;
    if (stretching) drawMotionStreaks(ctx, x, y, drawR, u.color);
    if (u.tier === 10) {
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 18;
      fillAura(ctx, x, y, drawR);
      ctx.restore();
      drawT10Particles(ctx, x, y, drawR, t);
    }
    const ok = drawSprite(ctx, spr, x, y, dim, dim, {
      flash,
      stretchY: stretching ? 1.22 : 1,
    });
    if (!ok) {
      ctx.save();
      if (u.heroType) {
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 16;
      }
      fallbackCircle(
        ctx, x, y, drawR,
        flash ? '#ffffff' : u.color,
        'rgba(0,0,0,0.45)',
        u.heroType ? UNITS[9].name : String(u.tier),
        u.tier === 7 ? '#5c4500' : '#fff',
      );
      ctx.restore();
    }
    drawHpBar(ctx, x, y - drawR - 16, drawR * 2, u.hp / u.maxHp, '#2ecc71');
    drawGradeBadge(ctx, x, y - drawR - 4, String(u.tier), drawR);
    if (u.heroType) drawHeroFootHud(ctx, u, x, y, drawR);
  }

  for (const h of game.units) {
    if (h.heroType !== 'jeanne') continue;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 223, 100, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(h.body.position.x, h.body.position.y, HEROES.jeanne.auraRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function fillAura(ctx, x, y, r) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.6);
  g.addColorStop(0, 'rgba(255, 215, 0, 0.18)');
  g.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawLauncher(ctx, game, innerR) {
  if (game.state !== 'playing') return;
  const stat = UNITS[game.currentTier - 1];
  const drawR = unitDrawR(stat);
  const ready = game.launchCd <= 0;
  const maxCd = Math.max(0.001, game._launchCooldown());
  const spr = assets.unit(game.currentTier);
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.38;
  if (!drawSprite(ctx, spr, game.aimX, LAUNCHER_Y, drawR * 2.4, drawR * 2.4)) {
    fallbackCircle(ctx, game.aimX, LAUNCHER_Y, drawR, stat.color, 'rgba(255,255,255,0.5)', String(game.currentTier));
  }
  drawGradeBadge(ctx, game.aimX, LAUNCHER_Y - drawR - 4, String(game.currentTier), drawR);
  ctx.restore();

  const barW = 44;
  const barH = 5;
  const bx = game.aimX - barW / 2;
  const by = LAUNCHER_Y + drawR + 8;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.fillStyle = ready ? '#6fe08a' : '#e8c878';
  ctx.fillRect(bx, by, barW * (ready ? 1 : 1 - game.launchCd / maxCd), barH);
  ctx.restore();

  const nstat = UNITS[game.nextTier - 1];
  const nextX = innerR - 55;
  const nspr = assets.unit(game.nextTier);
  ctx.save();
  ctx.globalAlpha = ready ? 0.95 : 0.45;
  fillWoodFrame(ctx, nextX - 22, CANVAS_H - EVO_BAR_H - 52, 44, 46);
  ctx.fillStyle = '#f0e6d2';
  ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
  ctx.textAlign = 'center';
  ctx.fillText('다음', nextX, CANVAS_H - EVO_BAR_H - 44);
  if (!drawSprite(ctx, nspr, nextX, CANVAS_H - EVO_BAR_H - 18, 28, 28)) {
    fallbackCircle(ctx, nextX, CANVAS_H - EVO_BAR_H - 18, 14, nstat.color, 'rgba(255,255,255,0.35)', String(game.nextTier));
  }
  drawGradeBadge(ctx, nextX, CANVAS_H - EVO_BAR_H - 8, String(game.nextTier), 12);
  ctx.restore();
}

function drawEvoBar(ctx, game) {
  const m = evoBarMetrics();
  game._evoBarRect = { x: m.x, y: m.y, w: m.w, h: m.h };
  const bar = assets.get('evo_bar');
  if (bar) ctx.drawImage(bar, 0, m.y, CANVAS_W, EVO_BAR_H);
  else {
    ctx.fillStyle = 'rgba(40, 28, 14, 0.85)';
    ctx.fillRect(0, m.y, CANVAS_W, EVO_BAR_H);
  }
  const cheat = game.cheatTier | 0;
  const mark = cheat || game.currentTier;
  const bx = m.startX + (mark - 1) * m.slot + 2;
  const by = m.y + 3;
  const bw = m.slot - 4;
  const bh = EVO_BAR_H - 6;
  ctx.save();
  if (cheat) {
    ctx.fillStyle = 'rgba(255, 210, 50, 0.42)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(255, 230, 90, 1)';
    ctx.lineWidth = 2.6;
  } else {
    ctx.strokeStyle = 'rgba(255, 220, 100, 0.85)';
    ctx.lineWidth = 2;
  }
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();
}

/** Cached source rect: skip empty/uniform margins on the camp PNG. */
let _campSrc = null;
let _campSrcKey = null;

function campContentSource(camp) {
  const iw = Math.max(1, camp.width || CANVAS_W);
  const ih = Math.max(1, camp.height || CAMP_DRAW_H);
  const key = `${iw}x${ih}`;
  if (_campSrc && _campSrcKey === key) return _campSrc;
  let sx = 0;
  let sy = 0;
  let ex = iw;
  let ey = ih;
  try {
    const probe = document.createElement('canvas');
    probe.width = iw;
    probe.height = ih;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    pctx.drawImage(camp, 0, 0);
    const { data } = pctx.getImageData(0, 0, iw, ih);
    const er = data[0];
    const eg = data[1];
    const eb = data[2];
    const rowThresh = iw * 0.08;
    const colThresh = ih * 0.08;
    const colorful = (i) =>
      Math.abs(data[i] - er) + Math.abs(data[i + 1] - eg) + Math.abs(data[i + 2] - eb) > 48;
    const rowHits = (y) => {
      let hits = 0;
      const row = y * iw * 4;
      for (let x = 0; x < iw; x++) {
        if (colorful(row + x * 4)) {
          hits++;
          if (hits > rowThresh) return true;
        }
      }
      return false;
    };
    const colHits = (x) => {
      let hits = 0;
      for (let y = 0; y < ih; y++) {
        if (colorful((y * iw + x) * 4)) {
          hits++;
          if (hits > colThresh) return true;
        }
      }
      return false;
    };
    for (let y = 0; y < ih; y++) {
      if (rowHits(y)) { sy = y; break; }
    }
    ey = sy + 1;
    for (let y = ih - 1; y > sy; y--) {
      if (rowHits(y)) { ey = y + 1; break; }
    }
    for (let x = 0; x < iw; x++) {
      if (colHits(x)) { sx = x; break; }
    }
    ex = sx + 1;
    for (let x = iw - 1; x > sx; x--) {
      if (colHits(x)) { ex = x + 1; break; }
    }
  } catch {
    sx = 0;
    sy = 0;
    ex = iw;
    ey = ih;
  }
  if (sy > ih * 0.7) sy = 0;
  _campSrcKey = key;
  _campSrc = { sx, sy, sw: Math.max(1, ex - sx), sh: Math.max(1, ey - sy) };
  return _campSrc;
}

function drawCampEdgeFill(ctx, camp, srcX, srcW, sy, sh, x0, x1, destY, destH, flip) {
  if (x1 <= x0 || srcW <= 0) return;
  const scale = destH / sh;
  const tileW = Math.max(8, srcW * scale);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    let x = x1;
    while (x > x0) {
      const dw = Math.min(tileW, x - x0);
      const take = (dw / tileW) * srcW;
      ctx.save();
      ctx.translate(x, destY);
      ctx.scale(-1, 1);
      ctx.drawImage(camp, srcX + srcW - take, sy, take, sh, 0, 0, dw, destH);
      ctx.restore();
      x -= dw;
    }
  } else {
    let x = x0;
    while (x < x1) {
      const dw = Math.min(tileW, x1 - x);
      const take = (dw / tileW) * srcW;
      ctx.drawImage(camp, srcX, sy, take, sh, x, destY, dw, destH);
      x += dw;
    }
  }
  ctx.restore();
}

/** Center tents at native aspect; tile camp edges so 5/7-col boards are not empty. No fade. */
function drawEnemyCamp(ctx, left, right) {
  const destY = CAMP_DEST_Y;
  const destH = CAMP_DRAW_H;
  const innerW = Math.max(1, right - left);
  const camp = assets.get('camp_top');
  if (!camp) {
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(left, destY, innerW, destH);
    return;
  }
  const { sx, sy, sw, sh } = campContentSource(camp);
  const scale = destH / sh;
  const edgeSrc = Math.max(10, Math.round(sw * 0.2));
  const midSrc = Math.max(1, sw - edgeSrc * 2);
  const midDw = midSrc * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (midDw >= innerW) {
    const extra = ((midDw - innerW) / scale);
    ctx.drawImage(camp, sx + edgeSrc + extra / 2, sy, midSrc - extra, sh, left, destY, innerW, destH);
  } else {
    const midX = left + (innerW - midDw) / 2;
    drawCampEdgeFill(ctx, camp, sx, edgeSrc, sy, sh, left, midX, destY, destH, false);
    ctx.drawImage(camp, sx + edgeSrc, sy, midSrc, sh, midX, destY, midDw, destH);
    drawCampEdgeFill(ctx, camp, sx + sw - edgeSrc, edgeSrc, sy, sh, midX + midDw, right, destY, destH, true);
  }
  ctx.restore();
}

function drawCampSmoke(ctx, left, right) {
  const t = performance.now() / 1000;
  const mid = (left + right) / 2;
  const span = Math.max(48, (right - left) * 0.28);
  const baseY = CAMP_DEST_Y + 52;
  const spots = [
    [mid - span, baseY, 0],
    [mid, baseY - 12, 1.2],
    [mid + span, baseY + 4, 2.1],
  ];
  ctx.save();
  for (const [bx, by, phase] of spots) {
    if (bx < left - 10 || bx > right + 10) continue;
    const yy = by - (t * 8 + phase * 3) % 16;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.ellipse(bx + Math.sin(t + phase) * 4, yy, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

class Renderer {
  draw(game, ctx) {
    game._fx = game._fx || game._effects?.();
    ctx.imageSmoothingEnabled = false;
    const shaking = (game.shakeT || 0) > 0;
    if (shaking) {
      ctx.save();
      const mag = 3.2 * Math.min(1, game.shakeT / 0.12);
      ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
    }

    const inset = typeof game.getPlayfieldInset === 'function'
      ? game.getPlayfieldInset()
      : game._playfieldInner();
    const { left: innerL, right: innerR } = inset;
    const innerW = innerR - innerL;

    const bg = assets.get('bg_field');
    if (!drawFieldBackground(ctx, bg)) {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#4cbf52');
      grad.addColorStop(1, '#2a8234');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // PNG 필드에 흙길이 이미 들어 있음. 프로시저럴 폴백만 고정 위치로 덧그림 (인셋에 따라 늘리지 않음).
    if (!assets.fromPng('bg_field')) drawDirtPath(ctx);

    drawSideForest(ctx, innerL, innerR);
    drawForestFieldSeam(ctx, innerL, innerR);

    if (game.wall) drawCastleWall(ctx);

    ctx.save();
    ctx.beginPath();
    ctx.rect(innerL, 0, innerW, CANVAS_H);
    ctx.clip();

    ctx.fillStyle = 'rgba(140, 30, 40, 0.10)';
    ctx.fillRect(innerL, 0, innerW, game.lineY);

    drawEnemyCamp(ctx, innerL, innerR);
    drawCampSmoke(ctx, innerL, innerR);
    drawCampFieldSeam(ctx, innerL, innerR);

    drawWaveLine(ctx, game, innerL, innerR);
    drawDefeatLine(ctx, innerL, innerR);

    drawEnemies(ctx, game);
    if (game.rangeMode !== 0) drawRangeIndicators(ctx, game);
    drawFriendlies(ctx, game);
    drawWallHp(ctx, game, innerL, innerR);
    drawArchers(ctx, game);
    drawAimArrow(ctx, game);
    drawLauncher(ctx, game, innerR);

    game.effects.draw(ctx, CANVAS_W);
    ctx.restore();

    if (game.bossWarnT > 0 && Math.floor(performance.now() / 200) % 2 === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 40, 40, 0.10)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    if (shaking) ctx.restore();

    drawHud(game, ctx);
    drawEvoBar(ctx, game);

    if ((game.ascendFlashT || 0) > 0) {
      const a = Math.max(0, game.ascendFlashT / HERO_ASCENSION_SLOWMO);
      const g = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 20, CANVAS_W / 2, CANVAS_H / 2, CANVAS_H);
      g.addColorStop(0, `rgba(255, 255, 220, ${a * 0.72})`);
      g.addColorStop(0.35, `rgba(255, 200, 40, ${a * 0.55})`);
      g.addColorStop(1, `rgba(255, 160, 0, ${a * 0.22})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }
}

export const renderer = new Renderer();
export { EVO_BAR_H, EVO_SLOT_W, EVO_SLOT_COUNT };
