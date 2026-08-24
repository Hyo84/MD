// 전장 레이어 렌더러. 베이크된 스프라이트 + 프레임당 펄스/파티클만.

import {
  CANVAS_W, CANVAS_H, DEFEAT_Y, LAUNCHER_Y, LINE_START_Y,
  BALANCE, UNITS, MONSTERS, HEROES, HERO_MISSION_DAMAGE, HERO_ASCENSION_SLOWMO,
  playfieldExtraInset, BASE_SLOT_COLS,
} from './config.js';
import { assets, DIRT_W, FOREST_STRIP_W } from './assets.js';
import { drawHud } from './hud.js';

const EVO_BAR_H = 36;

export function colorAlpha(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawSprite(ctx, img, x, y, w, h, opts = {}) {
  if (!img) return false;
  ctx.save();
  if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
  if (opts.flash) ctx.filter = 'brightness(2.4) saturate(0.4)';
  if (opts.stretchY && opts.stretchY !== 1) {
    ctx.translate(x, y);
    ctx.scale(1 / Math.sqrt(opts.stretchY), opts.stretchY);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  }
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
  const fs = Math.max(12, Math.min(22, Math.round(bodyR * 0.78)));
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

function drawFlippedStrip(ctx, img, destX, destW, destY, destH) {
  if (!img || destW <= 0) return;
  ctx.save();
  ctx.translate(destX + destW, destY);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, destW, destH);
  ctx.restore();
}

function drawDirtPath(ctx, left, right, cols) {
  const dirt = assets.get('dirt_path');
  const playW = Math.max(1, right - left);
  const frac = cols <= 3 ? 0.78 : cols <= 5 ? 0.84 : 0.9;
  const dirtW = Math.min(DIRT_W, playW * frac);
  const dx = (left + right) / 2 - dirtW / 2;
  const y0 = 72;
  const h = DEFEAT_Y - y0 + 8;
  if (dirt) ctx.drawImage(dirt, dx, y0, dirtW, h);
  else {
    ctx.fillStyle = 'rgba(214, 170, 92, 0.9)';
    ctx.fillRect(dx, y0, dirtW, h);
  }
}

function drawLoggedBand(ctx, img, x, w, y, h) {
  if (!img || w <= 0) return;
  ctx.drawImage(img, x, y, w, h);
}

function drawSideForest(ctx, cols, left, right) {
  const dense = assets.get('forest_dense');
  const logged = assets.get('forest_logged');
  const edge = assets.get('forest_edge');
  const y0 = 70;
  const h = DEFEAT_Y - y0 + 18;
  const inset3 = playfieldExtraInset(BASE_SLOT_COLS);
  const inset5 = playfieldExtraInset(5);

  // 남은 인셋 = 아직 벌목되지 않은 울창한 소나무 장벽
  const drawDense = (destX, destW, flip) => {
    if (destW <= 0) return;
    if (dense) {
      const iw = dense.width;
      const ih = dense.height;
      const srcW = Math.max(1, (destW / FOREST_STRIP_W) * iw);
      if (flip) {
        ctx.save();
        ctx.translate(destX + destW, y0);
        ctx.scale(-1, 1);
        ctx.drawImage(dense, 0, 0, srcW, ih, 0, 0, destW, h);
        ctx.restore();
      } else {
        ctx.drawImage(dense, 0, 0, srcW, ih, destX, y0, destW, h);
      }
    } else {
      ctx.fillStyle = '#143c1c';
      ctx.fillRect(destX, y0, destW, h);
    }
  };
  drawDense(0, left, false);
  drawDense(right, CANVAS_W - right, true);

  // 3→5 벌목대: 그루터기 + 넘어진 통나무 (5칸에서 선명, 7칸에서는 희미한 잔재)
  if (cols >= 5 && logged) {
    const band = inset3 - inset5;
    ctx.save();
    ctx.globalAlpha = cols >= 7 ? 0.32 : 1;
    drawLoggedBand(ctx, logged, inset5, band, y0, h);
    ctx.translate(CANVAS_W - inset5, y0);
    ctx.scale(-1, 1);
    ctx.drawImage(logged, 0, 0, band, h);
    ctx.restore();
  }
  // 5→7 벌목대: 가장자리만 얇은 수목선 + 그루터기
  if (cols >= 7) {
    if (logged) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      drawLoggedBand(ctx, logged, 0, inset5, y0, h);
      ctx.translate(CANVAS_W, y0);
      ctx.scale(-1, 1);
      ctx.drawImage(logged, 0, 0, inset5, h);
      ctx.restore();
    }
    if (edge) {
      ctx.drawImage(edge, 0, y0, 16, h);
      drawFlippedStrip(ctx, edge, CANVAS_W - 16, 16, y0, h);
    }
  }

  ctx.save();
  ctx.strokeStyle = '#1a140c';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (left > 0) {
    ctx.moveTo(left + 0.5, y0);
    ctx.lineTo(left + 0.5, y0 + h);
  }
  if (right < CANVAS_W) {
    ctx.moveTo(right - 0.5, y0);
    ctx.lineTo(right - 0.5, y0 + h);
  }
  ctx.stroke();
  ctx.restore();
}

function drawEdgeProps(ctx, left, right) {
  const crate = assets.get('prop_crate');
  const barrel = assets.get('prop_barrel');
  if (!crate && !barrel) return;
  const spots = [
    [left + 18, 170, true],
    [left + 22, 310, false],
    [left + 16, 470, true],
    [right - 18, 190, false],
    [right - 22, 350, true],
    [right - 16, 510, false],
  ];
  for (const [x, y, isCrate] of spots) {
    if (x < 8 || x > CANVAS_W - 8) continue;
    const img = isCrate ? crate : barrel;
    if (img) ctx.drawImage(img, x - 16, y - 16, 32, 32);
  }
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
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(left + barPad, DEFEAT_Y + 10, w - barPad * 2, 6);
  ctx.fillStyle = ratio > 0.35 ? '#8ec8ff' : '#ff8866';
  ctx.fillRect(left + barPad, DEFEAT_Y + 10, (w - barPad * 2) * ratio, 6);
  ctx.fillStyle = '#dce8f4';
  ctx.font = "11px 'Malgun Gothic', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`방어벽 ${game.wall.hp} / ${game.wall.maxHp}`, (left + right) / 2, DEFEAT_Y + 18);
  ctx.restore();
}

function drawArchers(ctx, game) {
  for (const shot of game.archerShots) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, shot.life / 0.12);
    ctx.strokeStyle = '#e8ff9a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shot.x1, shot.y1);
    ctx.lineTo(shot.x2, shot.y2);
    ctx.stroke();
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

function drawFriendlies(ctx, game) {
  const t = performance.now() / 1000;
  for (const u of game.units) {
    const { x, y } = u.body.position;
    const spr = assets.unit(u.tier);
    const dim = u.r * 2.4;
    const flash = u.flashT > 0;
    const stretching = !u.settled;
    if (stretching) drawMotionStreaks(ctx, x, y, u.r, u.color);
    if (u.tier === 10) {
      ctx.save();
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 18;
      fillAura(ctx, x, y, u.r);
      ctx.restore();
      drawT10Particles(ctx, x, y, u.r, t);
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
        ctx, x, y, u.r,
        flash ? '#ffffff' : u.color,
        'rgba(0,0,0,0.45)',
        u.heroType ? HEROES[u.heroType].name : String(u.tier),
        u.tier === 7 ? '#5c4500' : '#fff',
      );
      ctx.restore();
    } else if (u.heroType) {
      ctx.save();
      ctx.fillStyle = '#FFD700';
      ctx.font = `bold ${Math.max(9, u.r * 0.38)}px 'Malgun Gothic', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 3;
      ctx.strokeText(HEROES[u.heroType].name, x, y + u.r * 0.15);
      ctx.fillText(HEROES[u.heroType].name, x, y + u.r * 0.15);
      ctx.restore();
    }
    drawHpBar(ctx, x, y - u.r - 16, u.r * 2, u.hp / u.maxHp, '#2ecc71');
    drawGradeBadge(ctx, x, y - u.r - 4, String(u.tier), u.r);
    if (u.heroType) {
      const quota = u.targetDamage || HERO_MISSION_DAMAGE;
      const p = quota > 0 ? Math.min(1, (u.missionDamage || 0) / quota) : 0;
      const gw = u.r * 2.2;
      const gx = x - gw / 2;
      const gy = y - u.r - 28;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(gx, gy, gw, 5);
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(gx, gy, gw * p, 5);
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(gx, gy, gw, 5);
      ctx.fillStyle = 'rgba(255, 230, 140, 0.9)';
      ctx.font = "9px 'Malgun Gothic', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('사명', x, gy - 1);
      ctx.restore();
    }
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
  const ready = game.launchCd <= 0;
  const maxCd = Math.max(0.001, game._launchCooldown());
  const spr = assets.unit(game.currentTier);
  ctx.save();
  ctx.globalAlpha = ready ? 1 : 0.38;
  if (!drawSprite(ctx, spr, game.aimX, LAUNCHER_Y, stat.r * 2.4, stat.r * 2.4)) {
    fallbackCircle(ctx, game.aimX, LAUNCHER_Y, stat.r, stat.color, 'rgba(255,255,255,0.5)', String(game.currentTier));
  }
  drawGradeBadge(ctx, game.aimX, LAUNCHER_Y - stat.r - 4, String(game.currentTier), stat.r);
  ctx.restore();

  const barW = 44;
  const barH = 5;
  const bx = game.aimX - barW / 2;
  const by = LAUNCHER_Y + stat.r + 8;
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
  const bar = assets.get('evo_bar');
  const y = CANVAS_H - EVO_BAR_H;
  if (bar) ctx.drawImage(bar, 0, y, CANVAS_W, EVO_BAR_H);
  else {
    ctx.fillStyle = 'rgba(40, 28, 14, 0.85)';
    ctx.fillRect(0, y, CANVAS_W, EVO_BAR_H);
  }
  const slot = 40;
  const startX = (CANVAS_W - slot * 10) / 2;
  const cur = game.currentTier;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 220, 100, 0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(startX + (cur - 1) * slot + 2, y + 3, slot - 4, EVO_BAR_H - 6);
  ctx.restore();
}

function drawCampSmoke(ctx, left, right) {
  const t = performance.now() / 1000;
  ctx.save();
  for (const [bx, by, phase] of [[70, 22, 0], [210, 14, 1.2], [340, 20, 2.1]]) {
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
    if (bg) ctx.drawImage(bg, 0, 0, CANVAS_W, CANVAS_H);
    else {
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      grad.addColorStop(0, '#4cbf52');
      grad.addColorStop(1, '#2a8234');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    const cols = game.slotCols || BASE_SLOT_COLS;
    drawDirtPath(ctx, innerL, innerR, cols);

    const camp = assets.get('camp_top');
    if (camp) ctx.drawImage(camp, 0, 0, CANVAS_W, 90);
    drawCampSmoke(ctx, innerL, innerR);

    const wall = assets.get('wall_bottom');
    if (wall) ctx.drawImage(wall, 0, DEFEAT_Y, CANVAS_W, CANVAS_H - DEFEAT_Y);
    else {
      ctx.fillStyle = 'rgba(90, 90, 96, 0.9)';
      ctx.fillRect(0, DEFEAT_Y, CANVAS_W, CANVAS_H - DEFEAT_Y);
    }

    drawSideForest(ctx, cols, innerL, innerR);
    drawEdgeProps(ctx, innerL, innerR);

    ctx.save();
    ctx.beginPath();
    ctx.rect(innerL, 0, innerW, CANVAS_H);
    ctx.clip();

    ctx.fillStyle = 'rgba(140, 30, 40, 0.10)';
    ctx.fillRect(innerL, 0, innerW, game.lineY);

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
export { EVO_BAR_H };
