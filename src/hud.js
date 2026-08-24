// 상단 목재/금색 HUD. 한국어 문구는 기존과 동일.

import { CANVAS_W, killsNeeded, waveMultiplier } from './config.js';
import { meta } from './meta.js';
import { assets } from './assets.js';

export const RANGE_MODE_LABELS = ['끄기', '아군만', '전체'];

function drawHudChip(ctx, bx, by, bw, bh, label, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
  else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8dcc0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
}

export function drawHud(game, ctx) {
  const panel = assets.get('hud_top');
  ctx.save();
  if (panel) ctx.drawImage(panel, 0, 0, CANVAS_W, 72);
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, CANVAS_W, 70);
  }

  ctx.fillStyle = '#f0e6d2';
  ctx.font = "bold 15px 'Malgun Gothic', sans-serif";
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`웨이브 ${game.wave}`, 12, 14);

  ctx.font = "11px 'Malgun Gothic', sans-serif";
  const waveM = waveMultiplier(game.wave);
  const waveLabel = `웨이브 ×${waveM.toFixed(2)}`;
  ctx.fillStyle = '#b0a284';
  ctx.textAlign = 'left';
  ctx.fillText(waveLabel, 12, 36);
  const liveLabel = `×${game.liveMult.toFixed(1)}`;
  const liveX = 12 + ctx.measureText(waveLabel).width + 5;
  ctx.fillStyle = '#ffd27a';
  ctx.fillText(liveLabel, liveX, 36);
  const btnSize = 18;
  const btnGap = 4;
  const btnY = 27;
  const btnX = liveX + ctx.measureText(liveLabel).width + 7;
  ctx.font = 'bold 14px sans-serif';
  drawHudChip(ctx, btnX, btnY, btnSize, btnSize, '−', 'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)');
  drawHudChip(ctx, btnX + btnSize + btnGap, btnY, btnSize, btnSize, '+', 'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)');
  game._diffMinusRect = { x: btnX - 2, y: btnY - 2, w: btnSize + 2, h: btnSize + 4 };
  game._diffPlusRect = { x: btnX + btnSize + btnGap, y: btnY - 2, w: btnSize + 2, h: btnSize + 4 };

  ctx.textAlign = 'center';
  const need = killsNeeded(game.wave);
  ctx.fillStyle = '#b0a284';
  ctx.font = "11px 'Malgun Gothic', sans-serif";
  ctx.fillText(game.bossActive ? '보스 전투 중!' : `처치 ${game.kills} / ${need}`, CANVAS_W / 2, 14);

  ctx.textAlign = 'right';
  ctx.fillText(`점수 ${game.score}`, CANVAS_W - 12, 14);

  ctx.textAlign = 'center';
  ctx.font = "bold 13px 'Malgun Gothic', sans-serif";
  const lineHudX = 248;
  const v = game.netSpeed;
  if (Math.abs(v) < 0.05) {
    ctx.fillStyle = '#aaa';
    ctx.fillText('라인 ─ 정지', lineHudX, 36);
  } else if (v > 0) {
    ctx.fillStyle = '#ff7060';
    ctx.fillText(`라인 ▼ ${v.toFixed(1)}`, lineHudX, 36);
  } else {
    ctx.fillStyle = '#6fe08a';
    ctx.fillText(`라인 ▲ ${(-v).toFixed(1)}`, lineHudX, 36);
  }

  const label = RANGE_MODE_LABELS[game.rangeMode];
  const text = `사거리 ${label}`;
  ctx.font = "11px 'Malgun Gothic', sans-serif";
  const tw = ctx.measureText(text).width;
  const padX = 8;
  const bw = tw + padX * 2;
  const bh = 18;
  const bx = CANVAS_W - 10 - bw;
  const by = 27;
  game._rangeToggleRect = { x: bx - 4, y: by - 4, w: bw + 8, h: bh + 8 };
  drawHudChip(ctx, bx, by, bw, bh, text, 'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)');
  ctx.fillStyle = game.rangeMode === 0 ? '#8a8070' : '#e8dcc0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);

  const needXp = meta.xpNeeded;
  const xpRatio = needXp > 0 ? Math.min(1, meta.xp / needXp) : 1;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8c878';
  ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
  ctx.fillText(`레벨 ${meta.level}`, 12, 58);
  const barX = 72;
  const barW = 250;
  const barH = 8;
  const barY = 54;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#e8c878';
  ctx.fillRect(barX, barY, barW * xpRatio, barH);
  ctx.strokeStyle = 'rgba(200,180,140,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = '#c9b48a';
  ctx.font = "10px 'Malgun Gothic', sans-serif";
  ctx.fillText(`${meta.xp} / ${needXp}`, barX + barW + 8, 58);
  ctx.textAlign = 'right';
  ctx.fillStyle = meta.skillPoints > 0 ? '#ffe08a' : '#9a8a6a';
  ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
  ctx.fillText(`포인트 ${meta.skillPoints}`, CANVAS_W - 12, 58);

  ctx.restore();
}
