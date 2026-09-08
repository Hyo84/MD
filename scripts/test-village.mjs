import {
  medalsForClearedWave, medalsForFullClear, VILLAGE_CLEAR_BONUS, UNIT_MAX_LEVEL,
  villageResolve, collectGlobalAuras, uniqueMax, perUnitChance, nextTierCapOk, medalCost,
} from '../src/village.js';
import { UNITS } from '../src/config.js';

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
  let sum = 0;
  for (let w = 1; w <= 30; w++) sum += medalsForClearedWave(w);
  assert(sum + VILLAGE_CLEAR_BONUS === 4150, `풀클리어 훈장 4150 (실제 ${sum + VILLAGE_CLEAR_BONUS})`);
  assert(medalsForFullClear() === 4150, 'medalsForFullClear=4150');
  assert(medalsForClearedWave(1) === 10 && medalsForClearedWave(5) === 10, 'W1-5 = 10');
  assert(medalsForClearedWave(6) === 20 && medalsForClearedWave(30) === 320, '계단 2배');
}

{
  let t1 = 0;
  for (let lv = 1; lv < UNIT_MAX_LEVEL; lv++) t1 += medalCost(1, lv);
  assert(t1 === 4500, `T1 만렙 비용 4500 (실제 ${t1})`);
}

{
  for (let t = 1; t <= 9; t++) {
    assert(nextTierCapOk(t, 10), `T${t} Lv10 < 다음 티어 Lv1의 80%`);
  }
  const t1 = villageResolve(1, 10);
  assert(t1.hp === 80 && t1.atk === 8 && t1.stop === 4.6, 'T1 Lv10 스탯');
  assert(t1.hp < UNITS[1].hp * 0.8, 'T1 HP 상한');
}

{
  const dodge = villageResolve(1, 8).firstHitIgnore;
  assert(dodge === 0.15, `민병대 Lv8 회피 15% (실제 ${dodge})`);
  assert(perUnitChance(dodge, 8) === 0.15, '8명이어도 유닛당 15% (15%×8 아님)');
  const copies = Array.from({ length: 8 }, () => dodge);
  assert(uniqueMax(copies) === 0.15, '같은 오라를 max해도 15%');
}

{
  const units = Array.from({ length: 8 }, () => ({ tier: 1, dead: false }));
  const auras = collectGlobalAuras(units, () => 9);
  assert(auras.militiaAdvance === 0.30, `민병대 진격 오라 중첩 안 됨 +30% (실제 ${auras.militiaAdvance})`);
}

{
  const paladins = [
    { tier: 7, dead: false },
    { tier: 7, dead: false },
    { tier: 7, dead: false },
  ];
  const auras = collectGlobalAuras(paladins, () => 7);
  assert(auras.holyRegen === 0.015, `성기사 신성오라 3명도 1.5%/s 1회 (실제 ${auras.holyRegen})`);
}

{
  const marshals = [
    { tier: 9, dead: false },
    { tier: 9, dead: false },
  ];
  const auras = collectGlobalAuras(marshals, () => 8);
  assert(auras.armyAtk === 0.22, `대원수 전군공격 2명도 +22% 1회 (실제 ${auras.armyAtk})`);
}

{
  const mixed = [
    { tier: 1, dead: false },
    { tier: 9, dead: false },
    { tier: 10, heroType: 'jeanne', dead: false },
  ];
  const auras = collectGlobalAuras(mixed, (t) => (t === 1 ? 9 : t === 9 ? 7 : 8));
  assert(auras.militiaAdvance === 0.30, '다른 오라는 종류별로 따로 1회');
  assert(auras.armyMove === 0.25, '전군진격 1회');
  assert(auras.heroArmyAtk === 0.25, '영웅 광휘 1회');
}

{
  const t4 = villageResolve(4, 10);
  assert(t4.deathLineFreezeChance === 0.03, `결사항전 확률 3% (실제 ${t4.deathLineFreezeChance})`);
  assert(t4.deathLineFreezeDur === 1, `결사항전 1초 (실제 ${t4.deathLineFreezeDur})`);
  const t5i = villageResolve(5, 3);
  const t5ii = villageResolve(5, 6);
  const t5iii = villageResolve(5, 9);
  assert(t5i.knockbackChance === 0.01, `넉백 I 1% (실제 ${t5i.knockbackChance})`);
  assert(t5ii.knockbackChance === 0.01, `넉백 II 1% (실제 ${t5ii.knockbackChance})`);
  assert(t5iii.knockbackChance === 0.02, `넉백 III 2% (실제 ${t5iii.knockbackChance})`);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exitCode = 1;
} else {
  console.log('\nall village tests passed');
}
