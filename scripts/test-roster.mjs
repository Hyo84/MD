// 적 로스터: T2 스켈레톤 / T3 오크 / 트롤 비전투 재생 / 보스 해골기사 호위
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import { MONSTERS, BALANCE } from '../src/config.js';

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

assert(MONSTERS.skeleton.grade === '2', `스켈레톤 grade 2, 실제 ${MONSTERS.skeleton.grade}`);
assert(MONSTERS.skeleton.r <= MONSTERS.goblin.r + 2, `T2 반경은 고블린과 비슷 (r=${MONSTERS.skeleton.r})`);
assert(MONSTERS.skeleton.sprite === 'skeleton2', `T2 스프라이트 skeleton2, 실제 ${MONSTERS.skeleton.sprite}`);
assert(MONSTERS.orc.grade === '3', `오크 grade 3, 실제 ${MONSTERS.orc.grade}`);
assert(MONSTERS.skelknight.grade === '5', `해골기사 grade 5, 실제 ${MONSTERS.skelknight.grade}`);
assert(MONSTERS.skelknight.bossOnly === true, '해골기사는 보스 전용');
assert(MONSTERS.skelknight.atk > MONSTERS.troll.atk, `해골기사 ATK ${MONSTERS.skelknight.atk} > 트롤 ${MONSTERS.troll.atk}`);
assert(MONSTERS.skelknight.hp < MONSTERS.troll.hp, `해골기사 HP ${MONSTERS.skelknight.hp} < 트롤 ${MONSTERS.troll.hp}`);
assert(MONSTERS.skelknight.sprite === 'skeleton', `해골기사 스프라이트 skeleton, 실제 ${MONSTERS.skelknight.sprite}`);

{
  const game = makeGame();
  game.wave = 1;
  const keys = new Set();
  for (let i = 0; i < 400; i++) keys.add(game._pickMonster());
  assert(keys.has('goblin') && keys.has('skeleton'), `W1 풀에 고블린·스켈레톤 (${[...keys]})`);
  assert(!keys.has('orc') && !keys.has('troll') && !keys.has('skelknight'), `W1에 오크/트롤/기사 없음 (${[...keys]})`);
}

{
  const game = makeGame();
  game.wave = 2;
  const keys = new Set();
  for (let i = 0; i < 400; i++) keys.add(game._pickMonster());
  assert(keys.has('orc'), `W2에 오크 (${[...keys]})`);
  assert(!keys.has('troll') && !keys.has('skelknight'), `W2에 트롤/기사 없음 (${[...keys]})`);
}

{
  const game = makeGame();
  game.wave = 5;
  const counts = { goblin: 0, skeleton: 0, orc: 0, troll: 0, skelknight: 0, other: 0 };
  const n = 2000;
  for (let i = 0; i < n; i++) {
    const k = game._pickMonster();
    if (counts[k] != null) counts[k] += 1;
    else counts.other += 1;
  }
  const trollRate = counts.troll / n;
  assert(trollRate > 0.02 && trollRate < 0.06, `트롤 등장 ~3.85% (실제 ${(trollRate * 100).toFixed(2)}%)`);
  assert(counts.skelknight === 0, `일반 풀에 해골기사 없음 (${counts.skelknight})`);
}

{
  const game = makeGame();
  game.wave = 5;
  const troll = game._spawnEnemy('troll');
  troll.hp = troll.maxHp * 0.5;
  troll.lastHitT = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 60; i++) game._updateEnemyTicks(dt); // 1초, delay 1.2라서 재생 없음
  assert(troll.hp <= troll.maxHp * 0.5 + 1, `피격 직후 1초는 재생 없음 (hp=${troll.hp.toFixed(1)})`);
  game._damageEnemy(troll, 1);
  const hpAfterHit = troll.hp;
  for (let i = 0; i < 30; i++) {
    game._damageEnemy(troll, 0.2);
    game._updateEnemyTicks(dt);
  }
  assert(troll.hp <= hpAfterHit + 1, `계속 맞으면 재생 없음 (hp=${troll.hp.toFixed(1)} hit=${hpAfterHit.toFixed(1)})`);
  troll.hp = troll.maxHp * 0.5;
  troll.lastHitT = 2;
  const before = troll.hp;
  for (let i = 0; i < 60; i++) game._updateEnemyTicks(dt);
  const gained = troll.hp - before;
  const expect = troll.maxHp * MONSTERS.troll.regenPct;
  assert(gained > expect * 0.8 && gained < expect * 1.2, `1초 비전투 재생 ≈${expect.toFixed(0)} 실제 ${gained.toFixed(1)}`);
}

{
  const game = makeGame();
  game.wave = 11;
  game.kills = 999;
  game._beginBossArrival();
  const living = game.enemies.filter((m) => !m.dead);
  const knights = living.filter((m) => m.key === 'skelknight');
  const boss = living.filter((m) => m.isBoss);
  const trash = living.filter((m) => !m.isBoss);
  assert(boss.length === 1, `보스 1마리 (실제 ${boss.length})`);
  assert(knights.length === BALANCE.bossKnightEscorts, `해골기사 ${BALANCE.bossKnightEscorts}마리 (실제 ${knights.length})`);
  assert(trash.length === Math.min(BALANCE.bossEscortCount, BALANCE.bossMinionCap), `총 부하 ${trash.length} (호위 ${BALANCE.bossEscortCount})`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exitCode = 1;
} else {
  console.log('\nall passed');
}
