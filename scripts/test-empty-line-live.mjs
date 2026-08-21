// 빈 라인 푸시 + 실시간 난이도 배율 스모크 테스트
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import { CANVAS_W, LINE_START_Y, UNITS, MONSTERS, BALANCE, waveMultiplier, effectiveMult } from '../src/config.js';

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

function sim(game, seconds) {
  const dt = 1 / 60;
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) game._update(dt);
}

{
  const game = makeGame();
  game.lineY = 300;
  sim(game, 2);
  assert(game.lineY <= 300, `적 0명: 2초 후 라인이 내려가면 안 됨 (lineY=${game.lineY})`);
  assert(game.joinedEnemies().length === 0, '적 0명: joinedEnemies 비어 있음');
}

{
  const game = makeGame();
  game.lineY = 300;
  const m = game._spawnEnemy('goblin');
  assert(m.joining, `lineY=300 스폰은 합류 중이어야 함 (joining=${m.joining})`);
  sim(game, 2);
  assert(m.joining, `2초 합류 행군 후에도 아직 미착지 (y=${m.y.toFixed(1)} slot=${game._enemySlotY(m).toFixed(1)})`);
  assert(game.joinedEnemies().length === 0, '합류 중만 있으면 joinedEnemies 비어 있음');
  assert(game.lineY <= 300, `합류 중인 적만 있으면 라인이 내려가면 안 됨 (lineY=${game.lineY})`);
}

{
  const game = makeGame();
  game.lineY = 300;
  const m = game._spawnEnemy('goblin');
  m.joining = false;
  m.y = game._enemySlotY(m);
  sim(game, 2);
  const expect = 300 + (BALANCE.baseLineSpeed + MONSTERS.goblin.speed * game.liveMult) * 2;
  assert(game.lineY > 300, `착지한 고블린은 라인을 내려야 함 (lineY=${game.lineY})`);
  assert(Math.abs(game.lineY - expect) < 0.6, `착지 고블린 2초: lineY=${game.lineY.toFixed(2)} 기대 ${expect.toFixed(2)}`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const m = game._spawnEnemy('goblin');
  m.row = 0;
  m.y = 90;
  m.joining = true;
  assert(m.y === 90, `합류 시작 y=90 (실제 ${m.y})`);
  const dt = 1 / 60;
  const startLine = game.lineY;
  let pushedEarly = false;
  let countedWhileJoining = false;
  for (let i = 0; i < 20 * 60; i++) {
    game._update(dt);
    if (!m.joining && m.y + 2 >= game._enemySlotY(m)) break;
    if (game.lineY > startLine + 0.01) pushedEarly = true;
    if (game.joinedEnemies().length > 0) countedWhileJoining = true;
  }
  assert(!pushedEarly, `슬롯 도달 전에 라인이 밀리면 안 됨 (lineY=${game.lineY.toFixed(2)} y=${m.y.toFixed(1)})`);
  assert(!countedWhileJoining, '합류 중 joinedEnemies는 비어 있어야 함');
  assert(!m.joining, `착지해야 함 (joining=${m.joining} y=${m.y.toFixed(1)} slot=${game._enemySlotY(m).toFixed(1)})`);
  assert(m.y + 2 >= 400 - 8, `착지 y가 라인 근처여야 함 (y=${m.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
  const joinedLine = game.lineY;
  sim(game, 1);
  const goblinPush = BALANCE.baseLineSpeed + MONSTERS.goblin.speed * game.liveMult;
  const expectJoin = joinedLine + goblinPush * 1;
  assert(Math.abs(game.lineY - expectJoin) < 0.8, `착지 후 고블린 속도 lineY=${game.lineY.toFixed(2)} 기대 ${expectJoin.toFixed(2)}`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const front = game._spawnEnemy('troll');
  front.joining = false;
  front.y = game._enemySlotY(front);
  const joiner = game._spawnEnemy('troll');
  assert(joiner.joining, `겹침 시 둘째는 합류 행군 (joining=${joiner.joining})`);
  if (Math.hypot(front.x - joiner.x, game._enemySlotY(front) - game._enemySlotY(joiner)) < MONSTERS.troll.r * 2 + 2) {
    assert(joiner.row > front.row, `착지한 적과 겹치면 뒷열 스택 (front=${front.row} joiner=${joiner.row})`);
  }
  const onlyFront = BALANCE.baseLineSpeed + MONSTERS.troll.speed * game.liveMult;
  const t0 = game.lineY;
  const dt = 1 / 60;
  let extraPush = false;
  for (let i = 0; i < 120; i++) {
    if (!joiner.joining) break;
    game._update(dt);
    if (!joiner.joining) break;
    const elapsed = (i + 1) / 60;
    if (game.lineY > t0 + onlyFront * elapsed + 0.8) extraPush = true;
  }
  assert(!extraPush, `합류 중인 둘째가 라인 가속에 더해지면 안 됨 (lineY=${game.lineY.toFixed(2)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const boss = game._spawnEnemy('boss');
  assert(boss.joining, `보스도 합류 중이어야 함 (joining=${boss.joining})`);
  assert(boss.y <= 90 + 0.01, `보스는 상단에서 행군 (y=${boss.y})`);
  const dt = 1 / 60;
  const startLine = game.lineY;
  let bossPushedEarly = false;
  let bossCountedEarly = false;
  for (let i = 0; i < 20 * 60; i++) {
    game._update(dt);
    if (!boss.joining) break;
    if (game.lineY > startLine + 0.01) bossPushedEarly = true;
    if (game.joinedEnemies().some((en) => en === boss)) bossCountedEarly = true;
  }
  assert(!bossPushedEarly, `보스 착지 전 라인 증가 (lineY=${game.lineY.toFixed(2)} y=${boss.y.toFixed(1)})`);
  assert(!bossCountedEarly, '합류 중 보스는 joinedEnemies에 없어야 함');
  assert(!boss.joining, `보스가 착지해야 함 (y=${boss.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
  assert(Math.abs(boss.y - game.lineY) < 3, `보스는 라인 위에 착지 (y=${boss.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall passed');
