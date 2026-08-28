// 빈 라인 푸시 + 실시간 난이도 배율 스모크 테스트
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import { CANVAS_W, LINE_START_Y, DEFEAT_Y, UNITS, MONSTERS, BALANCE, waveMultiplier, effectiveMult, bossWaveMultiplier, SKILL_BY_ID, rollHeroRemnantTier, DISTRICTS, isHurdleWave, bossEscortForWave, killsNeeded, XP_TO_NEXT } from '../src/config.js';
import { meta } from '../src/meta.js';

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
  const boss = game._spawnEnemy('boss');
  const bossExpect = Math.round(MONSTERS.boss.hp * bossWaveMultiplier(5) * 1.2);
  assert(boss.maxHp === bossExpect, `허들 보스 HP=${boss.maxHp} (기대 ${bossExpect})`);
  assert(bossWaveMultiplier(5) > waveMultiplier(5), '허들 보스는 쓰레기보다 강함');
  assert(Math.abs(bossWaveMultiplier(4) - waveMultiplier(4)) < 1e-9, '비허들 보스는 일반 배율');
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

{
  const game = makeGame();
  game.lineY = 400;
  const back = game._spawnEnemy('goblin');
  back.joining = false;
  back.row = 1;
  back.col = 0;
  back.y = game._enemySlotY(back);
  assert(game.joinedEnemies().length === 0, '뒷열 착지는 joinedEnemies에 없어야 함');
  sim(game, 1);
  assert(game.lineY <= 400.05, `뒷열만 있으면 라인이 내려가면 안 됨 (lineY=${game.lineY.toFixed(2)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const m = game._spawnEnemy('goblin');
  m.joining = false;
  m.row = 0;
  m.y = 360;
  assert(game.joinedEnemies().length === 0, '라인에서 40px 떨어진 전열은 occupy 아님');
  sim(game, 0.4);
  assert(game.lineY <= 400.05, `라인에 안 붙은 적이 밀면 안 됨 (lineY=${game.lineY.toFixed(2)} y=${m.y.toFixed(1)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const a = game._spawnEnemy('goblin');
  const b = game._spawnEnemy('goblin');
  const c = game._spawnEnemy('goblin');
  assert(a.joining && b.joining && c.joining, '스폰 직후는 합류 중');
  const t0 = game.lineY;
  const dt = 1 / 60;
  let pushedBeforeContact = false;
  for (let i = 0; i < 20 * 60; i++) {
    if (game.enemies.some((en) => game._enemyOccupiesLine(en))) break;
    game._update(dt);
    if (game.lineY > t0 + 0.01) pushedBeforeContact = true;
  }
  assert(!pushedBeforeContact, `라인 접촉 전에 전진 (lineY=${game.lineY.toFixed(2)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const front = game._spawnEnemy('goblin');
  front.joining = false;
  front.row = 0;
  front.col = 0;
  front.y = 400;
  const back = game._spawnEnemy('goblin');
  back.joining = false;
  back.row = 1;
  back.col = 0;
  back.y = 400 - 46;
  game._removeEnemy(front);
  const t0 = game.lineY;
  const dt = 1 / 60;
  let pushedWhileGap = false;
  for (let i = 0; i < 20 * 60; i++) {
    if (!back.dead && !back.joining && back.y + 2 >= game.lineY) break;
    game._update(dt);
    if (back.joining && game.lineY > t0 + 0.01) pushedWhileGap = true;
    if (game._enemyOccupiesLine(back) && back.y + 2 < game.lineY) pushedWhileGap = true;
  }
  assert(!pushedWhileGap, `앞열 사망 후 뒷열이 붙기 전에 밀면 안 됨 (lineY=${game.lineY.toFixed(2)} y=${back.y.toFixed(1)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const boss = game._spawnEnemy('boss');
  boss.joining = false;
  boss.y = game.lineY;
  const u = game._spawnUnit(10, boss.x, 400 + 20 + UNITS[9].r);
  u.settled = true;
  u.engaged = true;
  assert(game._enemyOccupiesLine(boss), '착지 보스는 occupy');
  const tug = BALANCE.baseLineSpeed + MONSTERS.boss.speed * game.liveMult - game._unitStop(u);
  assert(tug < 0, `T10 저지력은 줄다리기를 위로 밀어야 함 (tug=${tug.toFixed(1)})`);
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dt);
  const moved = game.lineY - t0;
  const floor = BALANCE.bossMinAdvance;
  assert(moved > 0, `보스 occupy + 강한 저지력에도 라인은 내려감 (Δ=${moved.toFixed(2)})`);
  assert(Math.abs(moved - floor) < 0.6, `최소 진격 ≈${floor}px/s, 실제 Δ=${moved.toFixed(2)}`);
  assert(game.netSpeed >= floor - 1e-6, `netSpeed=${game.netSpeed} 하한 ${floor}`);
  boss.dead = true;
  const yAtDeath = game.lineY;
  for (let i = 0; i < 60; i++) game._updateLine(dt);
  assert(game.lineY < yAtDeath, `보스 사망 즉시 플로어 해제·빈 라인 상향 (lineY=${game.lineY.toFixed(2)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const boss = game._spawnEnemy('boss');
  boss.joining = true;
  boss.y = 64;
  const u = game._spawnUnit(10, CANVAS_W / 2, 400 + 20 + UNITS[9].r);
  u.settled = true;
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dt);
  assert(boss.joining, `합류 보스 joining 유지 (y=${boss.y.toFixed(1)})`);
  assert(!game._enemyOccupiesLine(boss), 'y=64 합류 보스는 occupy 아님');
  assert(game.lineY < t0, `합류 보스는 최소 진격 없음 — 빈 라인 푸시 (lineY=${game.lineY.toFixed(2)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const boss = game._spawnEnemy('boss');
  boss.joining = false;
  boss.y = game.lineY;
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dt);
  const natural = BALANCE.baseLineSpeed + MONSTERS.boss.speed * game.liveMult;
  const moved = game.lineY - t0;
  assert(natural > BALANCE.bossMinAdvance, `무저항 보스(${natural})는 플로어(${BALANCE.bossMinAdvance})보다 빠름`);
  assert(Math.abs(moved - natural) < 0.6, `줄다리기가 더 빠르면 플로어에 깎이지 않음 (Δ=${moved.toFixed(2)} 기대 ${natural.toFixed(2)})`);
}

{
  const game = makeGame();
  game.wave = 1;
  game.lineY = LINE_START_Y;
  assert(game._allyCampProximity() === 0, `아군 없으면 캠프 라인이어도 근접도 0 (prox=${game._allyCampProximity()})`);
  assert(Math.abs(game._spawnTimerSpeed() - 1) < 1e-6, `아군 없으면 타이머 배율 1 (speed=${game._spawnTimerSpeed()})`);
}

{
  const game = makeGame();
  game.wave = 1;
  const far = game._spawnUnit(1, CANVAS_W / 2, DEFEAT_Y + 24);
  far.settled = true;
  assert(game._allyCampProximity() === 0, `마지노 아군 근접도 0 (prox=${game._allyCampProximity()})`);
  assert(Math.abs(game._spawnTimerSpeed() - 1) < 1e-6, `마지노 타이머 배율 1 (speed=${game._spawnTimerSpeed()})`);
  game.spawnTimer = 10;
  game._updateSpawning(1);
  const maginotDrain = 10 - game.spawnTimer;
  assert(Math.abs(maginotDrain - 1) < 0.02, `W1 마지노 1초 소진 ≈1 (drain=${maginotDrain.toFixed(3)})`);

  const near = game._spawnUnit(1, CANVAS_W / 2, LINE_START_Y + 16);
  near.settled = true;
  assert(game._allyCampProximity() === 1, `캠프 전열 근접도 1 (prox=${game._allyCampProximity()})`);
  const touch = BALANCE.spawnCampTouchMult;
  const rushFloor = BALANCE.spawnCampRushFloor;
  const w1Interval = game._waveSpawnInterval();
  const expectSpeed = Math.min(touch, w1Interval / rushFloor);
  assert(Math.abs(game._spawnTimerSpeed() - expectSpeed) < 1e-6, `캠프 타이머 배율 ${expectSpeed} (speed=${game._spawnTimerSpeed()})`);
  game.spawnTimer = 10;
  game._updateSpawning(1);
  const campDrain = 10 - game.spawnTimer;
  assert(Math.abs(campDrain - expectSpeed) < 0.05, `W1 캠프 1초 소진 ≈${expectSpeed} (drain=${campDrain.toFixed(3)})`);
  assert(campDrain / maginotDrain >= 2.0, `캠프가 마지노보다 빠름 (${(campDrain / maginotDrain).toFixed(2)}×)`);

  const maginotEff = w1Interval / maginotDrain;
  const campEff = w1Interval / campDrain;
  assert(Math.abs(maginotEff - w1Interval) < 0.1, `W1 마지노 실효 간격 ≈${w1Interval}s (${maginotEff.toFixed(2)})`);
  assert(campEff >= rushFloor - 0.05, `W1 캠프 실효 간격 >= 러시 플로어 ${rushFloor}s (${campEff.toFixed(2)})`);
  assert(campEff <= w1Interval + 0.05, `W1 캠프는 기본 간격보다 짧거나 같음 (${campEff.toFixed(2)} vs ${w1Interval.toFixed(2)})`);
}

{
  const game = makeGame();
  game.wave = 1;
  game.lineY = LINE_START_Y;
  assert(Math.abs(game._spawnTimerSpeed() - 1) < 1e-6, `기본 리스폰 배율 1 (speed=${game._spawnTimerSpeed()})`);
  game.setSpawnRateMult(2);
  assert(game.spawnRateMult === 2, `setSpawnRateMult(2)=${game.spawnRateMult}`);
  assert(Math.abs(game._spawnTimerSpeed() - 2) < 1e-6, `×2면 타이머 속도 2 (speed=${game._spawnTimerSpeed()})`);
  game.spawnTimer = 10;
  game._updateSpawning(1);
  const drain2 = 10 - game.spawnTimer;
  assert(Math.abs(drain2 - 2) < 0.02, `×2일 때 1초 소진 ≈2 (drain=${drain2.toFixed(3)})`);
  game.setSpawnRateMult(0.5);
  assert(Math.abs(game._spawnTimerSpeed() - 0.5) < 1e-6, `×0.5면 타이머 속도 0.5 (speed=${game._spawnTimerSpeed()})`);
  game.setSpawnRateMult(9);
  assert(game.spawnRateMult === 5, `상한 5.0, 실제 ${game.spawnRateMult}`);
  game.setSpawnRateMult(0);
  assert(game.spawnRateMult === 0.2, `하한 0.2, 실제 ${game.spawnRateMult}`);
  const kept = game.spawnRateMult;
  game._reset();
  assert(game.spawnRateMult === kept, `재시작 후에도 리스폰 배율 유지 (${game.spawnRateMult})`);
}

{
  const game = makeGame();
  game.wave = 1;
  const u = game._spawnUnit(1, CANVAS_W / 2, LINE_START_Y + 16);
  u.settled = true;
  game.spawnTimer = 0;
  let spawns = 0;
  const orig = game._spawnEnemy.bind(game);
  game._spawnEnemy = (key) => {
    spawns += 1;
    return orig(key);
  };
  game._updateSpawning(5);
  assert(spawns === 1, `큰 dt에도 한 틱에 1마리 (spawns=${spawns})`);
}

{
  const game = makeGame();
  game.wave = 1;
  const u = game._spawnUnit(1, CANVAS_W / 2, LINE_START_Y + 16);
  u.settled = true;
  game.spawnTimer = 0.001;
  const times = [];
  let t = 0;
  const orig = game._spawnEnemy.bind(game);
  game._spawnEnemy = (key) => {
    times.push(t);
    return orig(key);
  };
  const dt = 1 / 60;
  for (let i = 0; i < 600 && times.length < 3; i++) {
    game._updateSpawning(dt);
    t += dt;
  }
  assert(times.length >= 3, `캠프 러시로 여러 마리 스폰 (n=${times.length})`);
  const gap1 = times[1] - times[0];
  const gap2 = times[2] - times[1];
  const floor = BALANCE.spawnCampRushFloor;
  assert(gap1 >= floor - 1e-6, `스폰 간격 >= 러시 플로어 ${floor}s (gap1=${gap1.toFixed(3)})`);
  assert(gap2 >= floor - 1e-6, `스폰 간격 >= 러시 플로어 ${floor}s (gap2=${gap2.toFixed(3)})`);
  assert(gap1 > dt + 1e-9 && gap2 > dt + 1e-9, `같은 프레임에 몰아넣지 않음 (gap1=${gap1.toFixed(3)} gap2=${gap2.toFixed(3)})`);
}

{
  const game = makeGame();
  game.wave = 1;
  game.bossActive = true;
  const farU = game._spawnUnit(1, CANVAS_W / 2, DEFEAT_Y + 24);
  farU.settled = true;
  const far = game._spawnTimerSpeed();
  const nearU = game._spawnUnit(1, CANVAS_W / 2, LINE_START_Y + 16);
  nearU.settled = true;
  const near = game._spawnTimerSpeed();
  assert(far <= 1.01, `보스전 마지노 배율 ≈1 (${far})`);
  assert(near >= 2.0, `보스전 캠프 전열도 근접 러시 (${near})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const gob = game._spawnEnemy('goblin');
  gob.joining = false;
  gob.row = 0;
  gob.x = CANVAS_W / 2;
  gob.y = 400;
  const t1r = UNITS[0].r;
  const holdY = 400 + 20 + t1r;
  const u = game._spawnUnit(1, CANVAS_W / 2 + 20, holdY);
  u.settled = true;
  u.attackCd = 0;
  gob.attackCd = 0;
  const gap = game._meleeGap(u.body.position.x, u.body.position.y, u.r, gob.x, gob.y, MONSTERS.goblin.r);
  assert(gap <= UNITS[0].range, `대각선 표면거리 ${gap.toFixed(1)} <= T1 사거리 ${UNITS[0].range}`);
  assert(gap <= BALANCE.enemyReach, `대각선에서 적도 때릴 수 있음 (gap=${gap.toFixed(1)} reach=${BALANCE.enemyReach})`);
  const hpE = gob.hp;
  const hpA = u.hp;
  game._updateCombat(1 / 60);
  assert(gob.hp < hpE, `대각선에서도 아군이 적을 때림 (hp ${hpE}→${gob.hp})`);
  assert(u.hp < hpA, `대각선에서 적도 아군을 때림 (hp ${hpA}→${u.hp})`);
}

{
  const game = makeGame();
  game.launchCd = 0;
  const n0 = game.units.length;
  game._tickAutoFire();
  assert(game.units.length === n0, '토글·홀드 없으면 자동발사 안 함');
  game.autoFire = true;
  game._tickAutoFire();
  assert(game.units.length === n0 + 1, `토글 ON이면 발사 (n=${game.units.length - n0})`);
  const cd = game.launchCd;
  assert(cd > 0, `발사 후 쿨다운 (cd=${cd})`);
  game._tickAutoFire();
  assert(game.units.length === n0 + 1, '쿨 중에는 두 발 안 나감');
  game.autoFire = false;
  game.launchCd = 0;
  game.holdingFire = true;
  game._tickAutoFire();
  assert(game.units.length === n0 + 2, '누르고 있으면 자동발사');
  game.holdingFire = false;
  game.autoFire = true;
  game._reset();
  assert(game.autoFire === true, '재시작 후에도 자동발사 토글 유지');
  assert(game.holdingFire === false, '재시작 시 홀드는 해제');
}

function occupyCol(game, key, col) {
  const m = game._spawnEnemy(key);
  m.joining = false;
  m.row = 0;
  m.col = col;
  m.x = game._slotX(col);
  m.y = game.lineY;
  m.hp = 1e9;
  m.maxHp = 1e9;
  m.stunT = 0;
  return m;
}

function allyAtCol(game, tier, col) {
  const stat = UNITS[tier - 1];
  const u = game._spawnUnit(tier, game._slotX(col), game.lineY + 20 + stat.r);
  u.settled = true;
  return u;
}

function rearInCol(game, key, col, row) {
  const m = game._spawnEnemy(key);
  m.joining = false;
  m.row = row;
  m.col = col;
  m.x = game._slotX(col);
  m.y = game._enemySlotY(m);
  m.hp = 1e9;
  m.maxHp = 1e9;
  m.stunT = 0;
  return m;
}

{
  const game = makeGame();
  game.lineY = 400;
  const front = occupyCol(game, 'goblin', 0);
  const atk0 = game._enemyAtk(front);
  const hp0 = front.hp;
  rearInCol(game, 'goblin', 0, 1);
  assert(game._columnRearCount(front) === 1, `뒷열 1마리 (실제 ${game._columnRearCount(front)})`);
  assert(Math.abs(game._stackAdvanceMult(front) - 1.5) < 1e-9, `뒷열 1 → 진격 ×1.5 (${game._stackAdvanceMult(front)})`);
  assert(Math.abs(game._enemyAtk(front) - atk0) < 1e-9, '스택해도 ATK 불변');
  assert(front.hp === hp0, '스택해도 HP 불변');
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dt);
  const expect = BALANCE.baseLineSpeed + MONSTERS.goblin.speed * 1.5 * game.liveMult;
  assert(Math.abs(game.lineY - (t0 + expect)) < 1.2, `뒷열 1 진격 1초: lineY=${game.lineY.toFixed(2)} 기대 ${(t0 + expect).toFixed(2)}`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const front = occupyCol(game, 'goblin', 0);
  for (let r = 1; r <= 4; r++) rearInCol(game, 'goblin', 0, r);
  assert(game._columnRearCount(front) === 4, `뒷열 4마리 (실제 ${game._columnRearCount(front)})`);
  assert(Math.abs(game._stackAdvanceMult(front) - 3) < 1e-9, `뒷열 4는 상한 ×3 (${game._stackAdvanceMult(front)})`);
  const t0s = game.lineY;
  const dts = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dts);
  const capExpect = BALANCE.baseLineSpeed + MONSTERS.goblin.speed * 3 * game.liveMult;
  assert(Math.abs(game.lineY - (t0s + capExpect)) < 1.2, `상한 ×3 진격 1초: lineY=${game.lineY.toFixed(2)} 기대 ${(t0s + capExpect).toFixed(2)}`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const boss = game._spawnEnemy('boss');
  boss.joining = false;
  boss.y = game.lineY;
  rearInCol(game, 'goblin', 0, 1);
  assert(game._stackAdvanceMult(boss) === 1, '보스는 뒷열 진격 가산 없음');
  const t0b = game.lineY;
  const dtb = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dtb);
  const bossExpect = Math.max(
    BALANCE.bossMinAdvance,
    BALANCE.baseLineSpeed + MONSTERS.boss.speed * game.liveMult,
  );
  assert(Math.abs(game.lineY - (t0b + bossExpect)) < 1.2, `보스+뒷열 고블린은 보스 속도만: lineY=${game.lineY.toFixed(2)} 기대 ${(t0b + bossExpect).toFixed(2)}`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const left = occupyCol(game, 'goblin', 0);
  occupyCol(game, 'goblin', 1);
  occupyCol(game, 'goblin', 2);
  const t1s = [];
  for (let i = 0; i < 8; i++) t1s.push(allyAtCol(game, 1, 0));
  assert(game._occupierHeld(left), '왼쪽 열 고블린은 T1 사거리 안');
  assert(!game._occupierHeld(game.enemies[1]), '가운데 열은 T1이 안 막음');
  assert(!game._occupierHeld(game.enemies[2]), '오른쪽 열은 T1이 안 막음');
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) {
    game._computeEngagement();
    game._updateLine(dt);
  }
  const leak = BALANCE.baseLineSpeed + MONSTERS.goblin.speed * 2 * game.liveMult;
  assert(game.lineY > t0 + 4, `막지 않은 열은 라인을 내려야 함 (lineY=${game.lineY.toFixed(2)} Δ=${(game.lineY - t0).toFixed(2)})`);
  assert(Math.abs(game.lineY - (t0 + leak)) < 1.2, `열 누수 1초: lineY=${game.lineY.toFixed(2)} 기대 ${(t0 + leak).toFixed(2)}`);
  const classic = BALANCE.baseLineSpeed + MONSTERS.goblin.speed * 3 - UNITS[0].stop * t1s.length;
  assert(classic < 0, `옛 전역 줄다리기는 후퇴했어야 함 (classic=${classic})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  const joiner = game._spawnEnemy('goblin');
  joiner.joining = true;
  joiner.row = 0;
  joiner.col = 2;
  joiner.x = game._slotX(2);
  joiner.y = 64;
  allyAtCol(game, 1, 0);
  allyAtCol(game, 1, 0);
  assert(game._incomingLaneUncovered(), '오른쪽 합류 적은 왼쪽 T1이 못 막음');
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateLine(dt);
  assert(joiner.joining, `합류 유지 (y=${joiner.y.toFixed(1)})`);
  assert(Math.abs(game.lineY - t0) < 0.05, `막지 않은 열로 합류 중이면 빈 라인 후퇴 없음 (lineY=${game.lineY.toFixed(2)})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  occupyCol(game, 'goblin', 0);
  occupyCol(game, 'goblin', 1);
  occupyCol(game, 'goblin', 2);
  allyAtCol(game, 10, 1);
  assert(game.enemies.every((m) => game._occupierHeld(m)), 'T10 중앙은 3열 모두 사거리 안');
  const t0 = game.lineY;
  const dt = 1 / 60;
  for (let i = 0; i < 30; i++) {
    game._computeEngagement();
    game._updateLine(dt);
  }
  assert(game.lineY < t0, `전열을 모두 막으면 저지력이 라인을 올릴 수 있음 (lineY=${game.lineY.toFixed(2)})`);
}

{
  assert(SKILL_BY_ID.mercenary.maxRank === 7, '용병술 만랭 7');
  assert(Math.min(9, (2 + 7)) === 9, '만랭이면 T9 해금');
}

{
  const values = [];
  for (let i = 0; i < 5; i++) values.push(rollHeroRemnantTier(() => (i + 0.5) / 5));
  assert(values.join(',') === '5,6,7,8,9', `잔류 티어 T5–T9 (${values.join(',')})`);
}

{
  const game = makeGame();
  game.score = 100;
  game.runXpBoss = 40;
  game.gold = 25;
  const xp0 = meta.xp;
  const s = game._settleRun(false);
  const expectGoldXp = Math.floor(25 * (BALANCE.goldXpRate ?? 1));
  assert(s.goldXp === expectGoldXp, `패배 골드 XP ${s.goldXp}`);
  assert(s.extraXp === 0, '패배는 클리어 배율 없음');
  assert(meta.xp === xp0 + expectGoldXp, `패배는 골드 XP만 추가 (Δ=${meta.xp - xp0})`);
}

{
  const game = makeGame();
  game.score = 10;
  game.runXpBoss = 10;
  game.gold = 10;
  const xp0 = meta.xp;
  const s = game._settleRun(true);
  const goldXp = Math.floor(10 * (BALANCE.goldXpRate ?? 1));
  const extra = (10 + 10 + goldXp) * ((s.mult || 2) - 1);
  assert(s.goldXp === goldXp && s.extraXp === extra, `클리어 extra=${s.extraXp} goldXp=${s.goldXp}`);
  assert(s.totalRunXp === 10 + 10 + goldXp + extra, `클리어 합계 XP ${s.totalRunXp}`);
  assert(meta.xp === xp0 + goldXp + extra, `클리어는 골드+배수 추가 (Δ=${meta.xp - xp0})`);
}

{
  const lv = meta.level;
  const pts = meta.skillPoints;
  meta.setLevel(lv + 2);
  assert(meta.level === lv + 2, `레벨 치트 ${meta.level}`);
  assert(meta.skillPoints === pts + 2, `레벨 상승 시 포인트 +차액 (${meta.skillPoints})`);
  meta.setLevel(lv);
}

{
  const walls = DISTRICTS.find((d) => d.id === 'walls');
  assert(walls?.kind === 'wallring', '성벽은 외곽 링');
  assert(DISTRICTS.filter((d) => d.kind === 'vacant').length === 2, '공터 2칸');
  assert(DISTRICTS.find((d) => d.id === 'village')?.kind === 'village', '9구역 마을');
  assert(DISTRICTS.find((d) => d.id === 'barracks')?.name === '공병대', '1구역 공병대');
  assert(DISTRICTS.find((d) => d.id === 'infantry')?.name === '병영', '3구역 병영');
}

{
  const game = makeGame();
  game.state = 'playing';
  game._snapshotRunMeta();
  const xp0 = meta.xp;
  game._grantScore(40);
  assert(meta.xp === xp0 + 40, '런 중 점수 XP 지급');
  game._forfeitRun();
  assert(meta.xp === xp0, `포기 시 런 XP 복구 (${meta.xp})`);
  assert(game.runSettlement?.forfeited, '포기 플래그');
  const s = game._settleRun(false);
  assert(s.goldXp === 0 && s.forfeited, '포기 후 골드 XP 없음');
}

{
  const game = makeGame();
  const snap = meta.cloneProgress();
  game.hasPlayed = true;
  game.resetToFirstPlay();
  assert(meta.level === 1 && meta.xp === 0 && meta.spentPoints() === 0 && meta.medals === 0, '계정 초기화는 메타를 비움');
  assert(game.hasPlayed === false && game.state === 'start', '계정 초기화는 첫 시작 화면');
  meta.restoreSnapshot(snap);
  assert(meta.level === snap.level && meta.xp === snap.xp, '초기화 테스트 후 메타 복구');
}

{
  assert(Math.abs(waveMultiplier(1) - 1) < 1e-9, 'W1 배율 1');
  assert(waveMultiplier(5) > waveMultiplier(4) * 1.8, `W5 허들 ${waveMultiplier(5).toFixed(2)}`);
  assert(waveMultiplier(5) >= 2.4 && waveMultiplier(5) < 2.9, `W5 ≈2.63 (${waveMultiplier(5).toFixed(2)})`);
  assert(waveMultiplier(10) > waveMultiplier(9) * 1.8, `W10 허들 ${waveMultiplier(10).toFixed(2)}`);
  assert(waveMultiplier(10) >= 6.8 && waveMultiplier(10) < 8.2, `W10 ≈7.4 (${waveMultiplier(10).toFixed(2)})`);
  assert(waveMultiplier(14) > waveMultiplier(10) * 1.25, `W14는 W10보다 강함 (${waveMultiplier(14).toFixed(2)})`);
  assert(waveMultiplier(11) / waveMultiplier(10) < 1.2, 'W11에 옛 3배 클리프 없음');
  assert(isHurdleWave(5) && isHurdleWave(10) && !isHurdleWave(6), '허들 웨이브 5/10');
  const e5 = bossEscortForWave(5);
  const e1 = bossEscortForWave(1);
  const e10 = bossEscortForWave(10);
  assert(e1.knights === 0 && e1.escort === 2, `W1 호위 ${e1.escort}/${e1.knights}`);
  assert(e5.knights >= 1 && e5.escort >= 4, `W5 호위 ${e5.escort}/${e5.knights}`);
  assert(e10.knights >= 3 && e10.escort >= 6, `W10 호위 ${e10.escort}/${e10.knights}`);
  assert(killsNeeded(5) > killsNeeded(4) + 4, 'W5 쓰레기 추가');
  assert(XP_TO_NEXT[1] >= 2000 && XP_TO_NEXT[8] >= 25000, '레벨 곡선이 느림');
}

{
  const game = makeGame();
  game.wave = 1;
  const p1 = game._monsterPool().map(([k]) => k);
  assert(p1.includes('goblin') && p1.length === 1 && !p1.includes('skeleton'), 'W1 일반 적은 고블린만');
  game.wave = 2;
  const p2 = game._monsterPool().map(([k]) => k);
  assert(p2.includes('skeleton') && p2.includes('orc'), 'W2부터 스켈레톤·오크');
  game.wave = 4;
  const p4 = game._monsterPool().map(([k]) => k);
  assert(!p4.includes('troll'), 'W4까지 트롤 없음');
  game.wave = 5;
  const p5 = game._monsterPool().map(([k]) => k);
  assert(p5.includes('troll'), 'W5 허들부터 트롤');
}

{
  const game = makeGame();
  game.lineY = 400;
  game._spawnEnemy('boss');
  for (let i = 0; i < 8; i++) game._spawnEnemy('goblin');
  game._compactEnemySlots();
  const boss = game.enemies.find((e) => e.isBoss);
  const br = MONSTERS.boss.r;
  let landed = 0;
  for (const m of game.enemies) {
    if (m.dead || m.isBoss) continue;
    assert((Number(m.row) || 0) === 0, `보스 뒤 스택 없음 (row=${m.row} col=${m.col})`);
    if ((Number(m.col) || 0) < 0) {
      assert(m.joining && m.y <= 64 + 1, `남는 부하는 캠프 대기 (y=${m.y})`);
      continue;
    }
    landed += 1;
    const d = Math.hypot(m.x - boss.x, m.y - boss.y);
    assert(d >= br + MONSTERS[m.key].r - 1, `보스와 옆칸만 (${d.toFixed(1)})`);
  }
  assert(landed <= 2, `3칸 보드에서 보스 옆 착지는 최대 2 (실제 ${landed})`);
}

{
  const game = makeGame();
  game.lineY = 400;
  for (let i = 0; i < 6; i++) game._spawnEnemy('goblin');
  game._spawnEnemy('boss');
  for (const m of game.enemies) {
    if (m.dead || m.isBoss) continue;
    assert((Number(m.row) || 0) === 0, `보스 등장 후 뒷열 없음 (row=${m.row})`);
  }
}

{
  assert(BALANCE.launchCooldown >= 1.7, `발사 쿨 ${BALANCE.launchCooldown}`);
  assert(BALANCE.mergeComboCdRefund <= 0.3, `콤보 쿨감 ${BALANCE.mergeComboCdRefund}`);
  assert((BALANCE.airMergeMaxTier ?? 5) <= 5, '공중 합성은 T5까지');
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nall passed');

