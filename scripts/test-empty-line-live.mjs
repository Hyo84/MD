// 빈 라인 푸시 + 실시간 난이도 배율 스모크 테스트
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import { CANVAS_W, LINE_START_Y, UNITS, MONSTERS, waveMultiplier, effectiveMult } from '../src/config.js';

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
  game.lineY = 400;
  game.bossPending = true;
  const u = game._spawnUnit(1, CANVAS_W / 2, 400 + 20 + UNITS[0].r);
  u.settled = true;
  const dt = 1 / 60;
  for (let i = 0; i < 180; i++) game._update(dt); // 3초
  assert(game.lineY < 400, `빈 라인은 전열 저지력으로 올라가야 함 (lineY=${game.lineY.toFixed(1)})`);
  const expectedStop = UNITS[0].stop;
  const moved = 400 - game.lineY;
  assert(moved > expectedStop * 2.5, `3초 동안 약 ${expectedStop}*3=${expectedStop * 3}px 상승 기대, 실제 ${moved.toFixed(1)}`);
}

{
  const game = makeGame();
  game.lineY = LINE_START_Y;
  const u = game._spawnUnit(5, CANVAS_W / 2, LINE_START_Y + 20 + UNITS[4].r);
  u.settled = true;
  for (let i = 0; i < 120; i++) game._update(1 / 60);
  assert(game.lineY >= LINE_START_Y, `시작 Y 위로 밀리면 안 됨 (lineY=${game.lineY})`);
  assert(game.lineY === LINE_START_Y, `이미 시작 위치면 정지 (lineY=${game.lineY})`);
}

{
  const game = makeGame();
  game.wave = 1;
  const m = game._spawnEnemy('goblin');
  const base = MONSTERS.goblin.hp * waveMultiplier(1);
  assert(m.maxHp === Math.round(base), `기본 스폰 HP=${m.maxHp} (기대 ${Math.round(base)})`);
  m.hp = Math.round(m.maxHp * 0.5);
  game.setLiveMult(1.3);
  assert(game.liveMult === 1.3, `liveMult=1.3, 실제 ${game.liveMult}`);
  assert(m.maxHp === Math.round(base * 1.3), `배율 변경 후 maxHP=${m.maxHp} (기대 ${Math.round(base * 1.3)})`);
  const ratio = m.hp / m.maxHp;
  assert(Math.abs(ratio - 0.5) < 0.02, `현재 HP 비율 유지 (ratio=${ratio.toFixed(3)})`);
  assert(Math.abs(game._enemyAtk(m) - MONSTERS.goblin.atk * 1 * 1.3) < 0.01, `ATK 즉시 반영 ${game._enemyAtk(m)}`);
  game.setLiveMult(0.4);
  assert(game.liveMult === 0.5, `하한 0.5, 실제 ${game.liveMult}`);
  game.setLiveMult(9);
  assert(game.liveMult === 5, `상한 5.0, 실제 ${game.liveMult}`);
}

{
  const game = makeGame();
  game.wave = 5;
  game.liveMult = 1.2;
  const m = game._spawnEnemy('orc');
  const expect = Math.round(MONSTERS.orc.hp * effectiveMult(5, 1.2));
  assert(m.maxHp === expect, `신규 스폰 실효 HP=${m.maxHp} (기대 ${expect})`);
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall passed');
