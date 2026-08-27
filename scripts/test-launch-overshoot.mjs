// 발사 유닛이 아군 더미에 끼여 캠프까지 튀지 않는지, 미정착은 캠프 러시에 안 잡히는지
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import { CANVAS_W, LINE_START_Y, LAUNCHER_Y, UNITS, BALANCE } from '../src/config.js';

const ctxStub = new Proxy({}, {
  get: (t, p) => {
    if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
    return typeof p === 'string' ? () => {} : undefined;
  },
  set: () => true,
});
const canvas = {
  getContext: () => ctxStub,
  addEventListener() {},
  setPointerCapture() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 450, height: 800 }),
};
const overlayStub = () => ({
  addEventListener() {},
  classList: { add() {}, remove() {}, toggle() {} },
});
const ui = {
  startOverlay: overlayStub(),
  gameoverOverlay: overlayStub(),
  finalScore: { textContent: '' },
  restartBtn: { addEventListener() {} },
};

function makeGame() {
  const game = new Game(canvas, ui);
  game.state = 'playing';
  game.spawnTimer = 1e9;
  game.lineY = LINE_START_Y;
  return game;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok  ', msg);
  }
}

{
  const game = makeGame();
  const flyer = game._spawnUnit(1, CANVAS_W / 2, LINE_START_Y + 16);
  flyer.settled = false;
  flyer.fromLaunch = true;
  assert(game._allyCampProximity() === 0, `미정착 아군은 캠프 러시 안 함 (prox=${game._allyCampProximity()})`);
  flyer.settled = true;
  assert(game._allyCampProximity() === 1, `정착 전열은 캠프 러시 (prox=${game._allyCampProximity()})`);
}

{
  const game = makeGame();
  const xs = [140, 180, 225, 270, 310];
  for (const x of xs) {
    const u = game._spawnUnit(1, x, 520);
    u.settled = true;
  }
  game.aimX = 225;
  game.currentTier = 1;
  game.launchCd = 0;
  game._launchUnit();
  const shot = game.units.find((u) => u.fromLaunch);
  assert(!!shot, '발사 유닛이 있어야 함');
  const dt = 1 / 60;
  for (let i = 0; i < 90; i++) game._update(dt);
  const y = shot.body.position.y;
  const minY = LINE_START_Y + 14 + UNITS[0].r;
  assert(y > minY + 40, `아군 더미에 끼여도 라인/캠프까지 안 튐 (y=${y.toFixed(1)} min=${minY.toFixed(1)})`);
  const traveled = LAUNCHER_Y - y;
  const cap = BALANCE.launchSpeed * 0.28 + BALANCE.unitAdvanceSpeed * 1.3 + 80;
  assert(traveled < cap, `1.5초 이동 ${traveled.toFixed(0)}px < 상한 ${cap.toFixed(0)}`);
}

{
  const game = makeGame();
  for (let i = 0; i < 4; i++) {
    const u = game._spawnUnit(1, CANVAS_W / 2 + (i - 1.5) * 8, LAUNCHER_Y);
    u.settled = true;
  }
  game.aimX = CANVAS_W / 2;
  game.currentTier = 1;
  game.launchCd = 0;
  game._launchUnit();
  const shot = game.units.find((u) => u.fromLaunch);
  const dt = 1 / 60;
  for (let i = 0; i < 45; i++) game._update(dt);
  const y = shot.body.position.y;
  assert(y > 380, `발사 위치 겹침에도 전장 상단으로 안 튐 (y=${y.toFixed(1)})`);
}

{
  const game = makeGame();
  assert(Math.abs(game.trollRegenPct() - 0.08) < 1e-9, `기본 재생 8% (실제 ${game.trollRegenPct()})`);
  game.setTrollRegenPct(0.20);
  assert(Math.abs(game.trollRegenPct() - 0.20) < 1e-9, `재생 20%로 조절 (실제 ${game.trollRegenPct()})`);
  game.adjustTrollRegenPct(-0.04);
  assert(Math.abs(game.trollRegenPct() - 0.16) < 1e-9, `−2스텝 → 16% (실제 ${game.trollRegenPct()})`);
  game.setTrollRegenPct(0.08);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exitCode = 1;
} else {
  console.log('\nall passed');
}
