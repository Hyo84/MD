// 궁수 레벨·전장 인원 캡·티어 잠금·세이브 마이그레이션
global.requestAnimationFrame = () => {};

import { Game } from '../src/game.js';
import {
  SKILL_BY_ID, DISTRICTS, slotColsForRank,
  archerStatsForLevel, archerLookForLevel, archerCapForCols, archerCombatLevel,
} from '../src/config.js';
import { meta, migrateLegacyArcherRanks } from '../src/meta.js';
import Matter from 'matter-js';

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
  game.enemies.length = 0;
  return game;
}

function step(game, n = 20) {
  const dt = 1 / 60;
  for (let i = 0; i < n; i++) game._update(dt);
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.log(`FAIL  ${msg}`);
  } else {
    console.log(`PASS  ${msg}`);
  }
}

const saved = meta.cloneProgress();

try {
  assert(!SKILL_BY_ID.archerRange && !SKILL_BY_ID.archerAtk && !SKILL_BY_ID.archerAmmo, '옛 궁수 스탯 스킬 제거');
  assert(SKILL_BY_ID.archerLevel?.maxRank === 9, '궁수 레벨 maxRank 9');
  assert(SKILL_BY_ID.archerCount?.maxRank === 6, '궁수 수 maxRank 6');
  assert(SKILL_BY_ID.tierLock?.maxRank === 5, '티어 잠금 maxRank 5');
  assert(DISTRICTS.find((d) => d.id === 'range')?.skills.includes('archerLevel'), '궁수훈련소에 레벨');
  assert(DISTRICTS.find((d) => d.id === 'infantry')?.skills.includes('tierLock'), '병영에 티어 잠금');

  assert(archerCombatLevel(true, 0) === 1, '해금 시 Lv1');
  assert(archerCombatLevel(true, 9) === 10, '랭크 9 → Lv10');
  assert(archerCombatLevel(false, 9) === 0, '미해금이면 레벨 0');
  const lv1 = archerStatsForLevel(1);
  const lv10 = archerStatsForLevel(10);
  assert(lv1.range === 200 && lv1.atk === 24 && lv1.ammo === 10, `Lv1 스탯 ${JSON.stringify(lv1)}`);
  assert(lv10.range === 280 && lv10.atk === 68 && lv10.ammo === 28, `Lv10 스탯 ${JSON.stringify(lv10)}`);
  assert(3 * lv1.ammo * lv1.atk === 720, '3명 Lv1 웨이브 피해 720');
  assert(3 * lv10.ammo * lv10.atk === 5712, '3명 Lv10 웨이브 피해 5712');
  assert(archerLookForLevel(1) === 0 && archerLookForLevel(3) === 0, 'Lv1–3 모습 0');
  assert(archerLookForLevel(4) === 1 && archerLookForLevel(6) === 1, 'Lv4–6 모습 1');
  assert(archerLookForLevel(7) === 2 && archerLookForLevel(9) === 2, 'Lv7–9 모습 2');
  assert(archerLookForLevel(10) === 3, 'Lv10 모습 3');
  assert(archerCapForCols(slotColsForRank(0)) === 3, '3칸 캡');
  assert(archerCapForCols(slotColsForRank(1)) === 5, '5칸 캡');
  assert(archerCapForCols(slotColsForRank(2)) === 7, '7칸 캡');

  {
    const data = { ranks: { archerLevel: 0 }, skillPoints: 2 };
    const refund = migrateLegacyArcherRanks(
      { archerRange: 5, archerAtk: 3, archerAmmo: 4, archerLevel: 0 },
      data,
    );
    assert(data.ranks.archerLevel === 5, `마이그레이션 레벨 ${data.ranks.archerLevel}`);
    assert(refund === 7 && data.skillPoints === 9, `환급 ${refund} pts=${data.skillPoints} (합산 아님)`);
    const skip = { ranks: { archerLevel: 2 }, skillPoints: 0 };
    assert(migrateLegacyArcherRanks({ archerRange: 9, archerLevel: 2 }, skip) === 0, '이미 레벨 있으면 스킵');
  }

  {
    meta.restoreSnapshot({
      level: 20, xp: 0, skillPoints: 1,
      ranks: { wall: 1, archer: 1, archerRange: 5, archerAtk: 2, archerAmmo: 4 },
      medals: 0, unitLevels: {}, villageLevel: 1,
    });
    assert(meta.rank('archerLevel') === 5, `restore 레벨 ${meta.rank('archerLevel')}`);
    assert(meta.skillPoints === 1 + 6, `restore 환급 포인트 ${meta.skillPoints}`);
    const snap = meta.cloneProgress();
    assert(snap.ranks.archerLevel === 5 && snap.ranks.archerRange == null, 'clone에 옛 키 없음');
  }

  {
    meta.resetSkills();
    meta.data.level = 30;
    meta.data.skillPoints = 20;
    meta.data.ranks.wall = 1;
    meta.data.ranks.archer = 1;
    meta.data.ranks.archerCount = 6;
    meta.data.ranks.boardWidth = 0;
    let fx = meta.getEffects();
    assert(fx.archerCount === 3 && fx.archerCap === 3, `3칸 실효 인원 ${fx.archerCount}`);
    meta.data.ranks.archerCount = 2;
    assert(meta.canBuy('archerCount').reason === 'width', '3칸에서 추가 고용은 전장 확장');
    meta.data.ranks.archerCount = 6;
    meta.data.ranks.boardWidth = 1;
    fx = meta.getEffects();
    assert(fx.archerCount === 5 && fx.archerCap === 5, `5칸 실효 인원 ${fx.archerCount}`);
    meta.data.ranks.boardWidth = 2;
    fx = meta.getEffects();
    assert(fx.archerCount === 7 && fx.archerCap === 7, `7칸 실효 인원 ${fx.archerCount}`);
    assert(meta.canBuy('archerCount').reason === 'max', '7칸에서 최대');

    meta.data.ranks.archerLevel = 0;
    fx = meta.getEffects();
    assert(fx.archerLevel === 1 && fx.archerRange === 200 && fx.archerAtk === 24 && fx.archerAmmo === 10, '해금 Lv1 전투');
    meta.data.ranks.archerLevel = 9;
    fx = meta.getEffects();
    assert(fx.archerLevel === 10 && fx.archerRange === 280 && fx.archerLook === 3, `Lv10 look=${fx.archerLook} range=${fx.archerRange}`);
    meta.data.ranks.tierLock = 3;
    assert(meta.getEffects().tierLockSlots === 3, '잠금 슬롯 3');
  }

  {
    const game = makeGame();
    const a = game._spawnUnit(1, 225 - 8, 420);
    const b = game._spawnUnit(1, 225 + 8, 420);
    a.tierLocked = true;
    step(game, 24);
    const alive = game.units.filter((u) => !u.dead);
    assert(alive.length === 2 && alive.every((u) => u.tier === 1), `잠금 시 머지 안 함 count=${alive.length}`);
    a.tierLocked = false;
    Matter.Body.setPosition(a.body, { x: 180, y: 420 });
    Matter.Body.setPosition(b.body, { x: 270, y: 420 });
    step(game, 2);
    Matter.Body.setPosition(a.body, { x: 217, y: 420 });
    Matter.Body.setPosition(b.body, { x: 233, y: 420 });
    Matter.Body.setVelocity(a.body, { x: 0, y: 0 });
    Matter.Body.setVelocity(b.body, { x: 0, y: 0 });
    step(game, 24);
    const after = game.units.filter((u) => !u.dead);
    assert(after.length === 1 && after[0].tier === 2, `잠금 해제 후 T2 count=${after.length} t=${after[0]?.tier}`);
  }

  {
    const game = makeGame();
    game._fx = { ...game._effects(), tierLockSlots: 1 };
    const u = game._spawnUnit(1, 200, 500);
    const other = game._spawnUnit(1, 320, 500);
    const hit = game._tryToggleTierLock({ x: u.body.position.x, y: u.body.position.y });
    assert(hit && u.tierLocked && !other.tierLocked, '클릭한 유닛만 잠금');
    assert(game._lockedCount() === 1, '잠금 1기');
    const full = game._tryToggleTierLock({ x: other.body.position.x, y: other.body.position.y });
    assert(full && !other.tierLocked, '슬롯 없으면 추가 잠금 불가');
    game._tryToggleTierLock({ x: u.body.position.x, y: u.body.position.y });
    assert(!u.tierLocked, '다시 클릭하면 해제');
    const hero = game._spawnUnit(10, 260, 480, 'jeanne');
    game._fx = { ...game._effects(), tierLockSlots: 5 };
    game._tryToggleTierLock({ x: hero.body.position.x, y: hero.body.position.y });
    assert(!hero.tierLocked, '영웅은 잠금 불가');
  }
} finally {
  meta.restoreSnapshot(saved);
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exitCode = 1;
} else {
  console.log('\nall passed');
}
