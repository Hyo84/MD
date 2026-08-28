// 상단 목재/금색 HUD. 한국어 문구는 기존과 동일.

import { CANVAS_W, killsNeeded, waveMultiplier } from './config.js';
import { meta } from './meta.js';
import { assets } from './assets.js';

export const RANGE_MODE_LABELS = ['끄기', '아군만', '전체'];

const HUD_H = 72;
const HUD_PAD_X = 12;
const HUD_PAD_Y = 11;

function drawHudChip(ctx, bx, by, bw, bh, label, fill, stroke, labelColor) {
  ctx.fillStyle = fill || '#5a3a1c';
  ctx.strokeStyle = stroke || '#1a140c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
  else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#e8c56a';
  ctx.lineWidth = 0.9;
  ctx.strokeRect(bx + 2, by + 1.5, bw - 4, bh - 3);
  ctx.fillStyle = labelColor || '#e8dcc0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
}

export function drawHud(game, ctx) {
  const panel = assets.get('hud_top');
  ctx.save();
  if (panel) ctx.drawImage(panel, 0, 0, CANVAS_W, HUD_H);
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  }

  const left = HUD_PAD_X;
  const right = CANVAS_W - HUD_PAD_X;
  const row1 = HUD_PAD_Y + 6;
  const row2 = 36;
  const row3 = 58;

  ctx.fillStyle = '#f0e6d2';
  ctx.font = "bold 14px 'Malgun Gothic', sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`웨이브 ${game.wave}`, left, row1);

  const need = killsNeeded(game.wave);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d8ccb4';
  ctx.font = "11px 'Malgun Gothic', sans-serif";
  ctx.fillText(game.bossActive ? '보스 전투 중!' : `처치 ${game.kills} / ${need}`, CANVAS_W / 2, row1);

  ctx.textAlign = 'right';
  ctx.fillText(`점수 ${game.score}`, right, row1);

  ctx.font = "11px 'Malgun Gothic', sans-serif";
  const waveM = waveMultiplier(game.wave);
  const waveLabel = `웨이브 ×${waveM.toFixed(2)}`;
  ctx.fillStyle = '#b0a284';
  ctx.textAlign = 'left';
  ctx.fillText(waveLabel, left, row2);
  game._diffMinusRect = { x: 0, y: 0, w: 0, h: 0 };
  game._diffPlusRect = { x: 0, y: 0, w: 0, h: 0 };

  ctx.font = "bold 12px 'Malgun Gothic', sans-serif";
  ctx.textAlign = 'center';
  const v = game.netSpeed;
  if (Math.abs(v) < 0.05) {
    ctx.fillStyle = '#aaa';
    ctx.fillText('라인 ─ 정지', CANVAS_W / 2, row2);
  } else if (v > 0) {
    ctx.fillStyle = '#ff7060';
    ctx.fillText(`라인 ▼ ${v.toFixed(1)}`, CANVAS_W / 2, row2);
  } else {
    ctx.fillStyle = '#6fe08a';
    ctx.fillText(`라인 ▲ ${(-v).toFixed(1)}`, CANVAS_W / 2, row2);
  }

  const label = RANGE_MODE_LABELS[game.rangeMode];
  const text = `사거리 ${label}`;
  ctx.font = "11px 'Malgun Gothic', sans-serif";
  const tw = ctx.measureText(text).width;
  const bw = tw + 14;
  const bh = 16;
  const bx = right - bw;
  const by = row2 - bh / 2;
  game._rangeToggleRect = { x: bx - 3, y: by - 3, w: bw + 6, h: bh + 6 };
  drawHudChip(
    ctx, bx, by, bw, bh, text,
    'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)',
    game.rangeMode === 0 ? '#8a8070' : '#e8dcc0',
  );

  const needXp = meta.xpNeeded;
  const xpRatio = needXp > 0 ? Math.min(1, meta.xp / needXp) : 1;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8c878';
  ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
  ctx.fillText(`레벨 ${meta.level}`, left, row3);
  const barX = 68;
  const barW = 248;
  const barH = 7;
  const barY = row3 - barH / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#e8c878';
  ctx.fillRect(barX, barY, barW * xpRatio, barH);
  ctx.strokeStyle = 'rgba(200,180,140,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#c9b48a';
  ctx.font = "10px 'Malgun Gothic', sans-serif";
  ctx.fillText(`${meta.xp} / ${needXp}`, barX + barW + 8, row3);
  ctx.textAlign = 'right';
  ctx.fillStyle = meta.skillPoints > 0 ? '#ffe08a' : '#9a8a6a';
  ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
  ctx.fillText(`포인트 ${meta.skillPoints}`, right, row3);

  ctx.restore();
}
