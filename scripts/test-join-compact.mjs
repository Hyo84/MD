// 전열 접촉만 라인 가속 + 전열 사망 시 뒷열 밀집 행군
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import { CANVAS_W, MONSTERS, BALANCE } from '../src/config.js';

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

function sim(game, seconds) {
  const dt = 1 / 60;
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) game._update(dt);
}

function place(game, m, { row, col, y, joining }) {
  if (!m.isBoss) game.occupiedSlots.delete(`${m.row}:${m.col}`);
  m.row = row;
  m.col = col;
  m.x = game._slotX(col);
  m.y = y;
  m.joining = joining;
  if (!m.isBoss) game.occupiedSlots.add(`${row}:${col}`);
}

function goblinPush(game) {
  return BALANCE.baseLineSpeed + MONSTERS.goblin.speed * game.liveMult;
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
  const front = game._spawnEnemy('goblin');
  const rear = game._spawnEnemy('goblin');
  place(game, front, { row: 0, col: 1, y: 400, joining: false });
  place(game, rear, { row: 1, col: 1, y: 120, joining: true });

  const t0 = game.lineY;
  sim(game, 1);
  const expectFront = t0 + goblinPush(game) * 1;
  assert(
    Math.abs(game.lineY - expectFront) < 0.8,
    `합류 중인 뒷열은 라인 가속에 더하면 안 됨 (lineY=${game.lineY.toFixed(2)} 기대 ${expectFront.toFixed(2)})`,
  );
  assert(rear.joining, `1초 후 뒷열은 아직 합류 중 (y=${rear.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
  assert(!game._enemyOccupiesLine(rear), 'y=120 합류 적은 전열 접촉이 아님');
  assert(game.joinedEnemies().length === 1, `joinedEnemies는 전열만 (n=${game.joinedEnemies().length})`);

  const yBeforeKill = rear.y;
  game._damageEnemy(front, front.hp + 1);
  assert(!front.dead || !game.enemies.includes(front), '전열 고블린 제거');
  assert(rear.row === 0, `전열 사망 후 뒷열 row=0 (실제 ${rear.row})`);
  assert(rear.joining, '빈 전열을 향해 행군해야 함');
  assert(game.joinedEnemies().length === 0, '행군 중 joinedEnemies 비어 있음');

  const lineAtKill = game.lineY;
  sim(game, 0.25);
  assert(rear.y > yBeforeKill + 8, `뒷열이 라인 쪽으로 내려가야 함 (y=${rear.y.toFixed(1)} from ${yBeforeKill.toFixed(1)})`);
  assert(
    game.lineY <= lineAtKill + 0.05,
    `착지 전 라인이 밀리면 안 됨 (lineY=${game.lineY.toFixed(2)} kill=${lineAtKill.toFixed(2)})`,
  );

  sim(game, 5);
  assert(!rear.joining, `충분한 시간 후 착지 (joining=${rear.joining} y=${rear.y.toFixed(1)})`);
  assert(
    Math.abs(rear.y - game.lineY) <= 8,
    `착지 y≈lineY (y=${rear.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`,
  );
  assert(game._enemyOccupiesLine(rear), '착지 후 전열 접촉');

  const joinedLine = game.lineY;
  sim(game, 1);
  const expectPush = joinedLine + goblinPush(game) * 1;
  assert(
    Math.abs(game.lineY - expectPush) < 0.8,
    `착지 후에만 푸시 (lineY=${game.lineY.toFixed(2)} 기대 ${expectPush.toFixed(2)})`,
  );
}

{
  const game = makeGame();
  game.lineY = 400;
  const front = game._spawnEnemy('goblin');
  const stacked = game._spawnEnemy('goblin');
  place(game, front, { row: 0, col: 0, y: 400, joining: false });
  place(game, stacked, { row: 2, col: 0, y: 400 - 2 * 46, joining: false });

  assert(!game._enemyOccupiesLine(stacked), 'row 2 착지 적은 전열 접촉이 아님');
  const t0 = game.lineY;
  sim(game, 1);
  const expectFront = t0 + goblinPush(game) * 1;
  assert(
    Math.abs(game.lineY - expectFront) < 0.8,
    `row 2에 떠 있는 적은 푸시하면 안 됨 (lineY=${game.lineY.toFixed(2)} 기대 ${expectFront.toFixed(2)})`,
  );

  game._damageEnemy(front, front.hp + 1);
  assert(stacked.row === 0, `구멍 밀집 후 row=0 (실제 ${stacked.row})`);
  assert(stacked.joining, '전열이 비면 뒷열이 내려와야 함');
  sim(game, 2);
  assert(!stacked.joining, `밀집 행군 후 착지 (y=${stacked.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
  assert(Math.abs(stacked.y - game.lineY) <= 8, `착지 후 y≈lineY (y=${stacked.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const trash = game._spawnEnemy('goblin');
  const boss = game._spawnEnemy('boss');
  place(game, trash, { row: 0, col: 0, y: 400, joining: false });
  boss.row = 0;
  boss.col = -1;
  boss.y = 180;
  boss.joining = false;
  boss.x = CANVAS_W / 2;

  const t0 = game.lineY;
  sim(game, 1);
  const expectTrash = t0 + goblinPush(game) * 1;
  assert(
    Math.abs(game.lineY - expectTrash) < 0.8,
    `라인 위가 아닌 보스는 푸시하면 안 됨 (lineY=${game.lineY.toFixed(2)} 기대 ${expectTrash.toFixed(2)})`,
  );

  game._damageEnemy(trash, trash.hp + 1);
  assert(boss.joining, '쓰레기 전열 사망 후 보스가 라인으로 행군');
  sim(game, 5);
  assert(!boss.joining, `보스 착지 (y=${boss.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
  assert(Math.abs(boss.y - game.lineY) < 3, `보스는 라인 위에 착지 (y=${boss.y.toFixed(1)} lineY=${game.lineY.toFixed(1)})`);
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall passed');
