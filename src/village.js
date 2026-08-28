// 마을(병사 육성): 용맹의 훈장, 티어별 Lv0–10 스탯·패시브.
// 마을 레벨은 건설 포인트. Lv1 시작, Lv2부터 신병막사 → … → 영웅의 첨탑.
// 개인 효과는 유닛마다 따로. 아군 전체/근처 오라는 효과 ID당 최댓값 1회만.

import { UNITS, HEROES, HERO_BOSS_LIMIT, HERO_ASCENSION_ATK_MULT } from './config.js';

export const UNIT_MIN_LEVEL = 0;
export const UNIT_MAX_LEVEL = 10;
export const VILLAGE_START_LEVEL = 1;
export const VILLAGE_MAX_LEVEL = 10;
export const VILLAGE_LEVEL_COST = 1;
export const VILLAGE_CLEAR_WAVE = 30;
export const VILLAGE_CLEAR_BONUS = 1000;

export const VILLAGE_HOUSES = [
  { tier: 1, name: '농장', span: 2 },
  { tier: 2, name: '신병막사', span: 1 },
  { tier: 3, name: '술집', span: 1 },
  { tier: 4, name: '대장간', span: 1 },
  { tier: 5, name: '기사단막사', span: 1 },
  { tier: 6, name: '근위대주둔지', span: 2 },
  { tier: 7, name: '성기사예배당', span: 1 },
  { tier: 8, name: '드래곤성소', span: 1 },
  { tier: 9, name: '저택', span: 2 },
  { tier: 10, name: '영웅의 첨탑', span: 2 },
];

export const MEDAL_COSTS = {
  1: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  2: [150, 300, 500, 700, 1000, 1300, 1600, 1900, 2200, 2500],
  3: [400, 800, 1200, 1800, 2500, 3300, 4200, 5000, 5500, 5700],
  4: [700, 1500, 3000, 4500, 6500, 8500, 11000, 13000, 15000, 17000],
  5: [2000, 4000, 7000, 11000, 15000, 20000, 25000, 30000, 36000, 42000],
  6: [5000, 10000, 18000, 27000, 37000, 48000, 60000, 72000, 85000, 98000],
  7: [10000, 20000, 35000, 55000, 75000, 100000, 125000, 155000, 190000, 230000],
  8: [20000, 40000, 70000, 105000, 145000, 190000, 240000, 295000, 355000, 420000],
  9: [40000, 80000, 130000, 200000, 280000, 370000, 470000, 580000, 700000, 830000],
  10: [80000, 150000, 250000, 380000, 520000, 680000, 850000, 1050000, 1300000, 1650000],
};

const emptyPassives = () => ({
  waveGold: 0,
  firstHitIgnore: 0,
  militiaAdvance: 0,
  awakenChance: 0,
  luckySurvive: 0,
  launchDash: 0,
  atkProcChance: 0,
  atkProcMult: 0,
  deathGoldChance: 0,
  deathGold: 0,
  launchMoveChance: 0,
  launchAtkChance: 0,
  launchAspdChance: 0,
  launchBuffDur: 5,
  frontRegenPerSec: 0,
  shieldDr: 0,
  shieldRadius: 50,
  selfDr: 0,
  deathLineFreezeChance: 0,
  deathLineFreezeDur: 3,
  flatDmg: 0,
  cleaveBonus: 0,
  knockbackChance: 0,
  knockbackPx: 0,
  knightSwap: false,
  crisisDodge: 0,
  crisisRadius: 70,
  captainAdvance: 0,
  captainRadius: 70,
  doubleHitChance: 0,
  holyRegen: 0,
  holyRadius: 110,
  hammerSplash: 0,
  sacrificeShare: 0,
  sacrificeKeep: 1,
  sacrificeRadius: 110,
  miracleOnDeath: false,
  breathDmg: 0,
  fearFreeze: 0,
  fearCd: 30,
  appearHpPct: 0,
  appearExecute: 0,
  armyMove: 0,
  armyAtk: 0,
  armyDr: 0,
  invulnPeriod: 0,
  invulnDur: 3,
  missionReqMult: 1,
  bossKillBonus: 0,
  ascendDmgMult: 1,
  bossMinAdvanceZero: false,
  smitePeriod: 0,
  smiteAtkFrac: 0.35,
  militiaAwakenMult: 1,
  reenterChance: 0,
  heroArmyAtk: 0,
  heroArmyDr: 0,
  enemyAtkDebuff: 0,
  enemySpdDebuff: 0,
  legendKit: false,
});

// 같은 계열은 상위 랭크가 덮어씀. 다른 계열은 누적.
const TIERS = {
  1: [
    { hp: 50, atk: 5.0, stop: 4.00, name: '세금내요 I', desc: '웨이브 클리어 시 잔존 1명당 +1G', set: { waveGold: 1 } },
    { hp: 53, atk: 5.3, stop: 4.07, name: '살려줘요 I', desc: '첫 피격 시 5% 확률로 회피 (유닛마다 개별)', set: { firstHitIgnore: 0.05 } },
    { hp: 56, atk: 5.6, stop: 4.14, name: '밀지마요 I', desc: '전선 진격 +10% (오라 1회)', set: { militiaAdvance: 0.10 } },
    { hp: 60, atk: 6.0, stop: 4.21, name: '세금내요 II', desc: '웨이브 클리어 시 잔존 1명당 +2G', set: { waveGold: 2 } },
    { hp: 64, atk: 6.4, stop: 4.28, name: '살려줘요 II', desc: '첫 피격 시 10% 확률로 회피 (유닛마다 개별)', set: { firstHitIgnore: 0.10 } },
    { hp: 68, atk: 6.8, stop: 4.35, name: '밀지마요 II', desc: '전선 진격 +20% (오라 1회)', set: { militiaAdvance: 0.20 } },
    { hp: 72, atk: 7.2, stop: 4.42, name: '세금내요 III', desc: '웨이브 클리어 시 잔존 1명당 +3G', set: { waveGold: 3 } },
    { hp: 76, atk: 7.6, stop: 4.50, name: '살려줘요 III', desc: '첫 피격 시 15% 확률로 회피 (유닛마다 개별)', set: { firstHitIgnore: 0.15 } },
    { hp: 80, atk: 8.0, stop: 4.60, name: '밀지마요 III', desc: '전선 진격 +30% (오라 1회)', set: { militiaAdvance: 0.30 } },
    { hp: 80, atk: 8.0, stop: 4.60, name: '지킬게요', desc: '발사 시 0.1%로 영웅 각성 (5웨이브당 1회)', set: { awakenChance: 0.001 } },
  ],
  2: [
    { hp: 110, atk: 12.0, stop: 6.00, name: '초보자행운 I', desc: '치명 피격 시 3%로 체력 1 생존', set: { luckySurvive: 0.03 } },
    { hp: 118, atk: 12.8, stop: 6.10, name: '신병받아라 I', desc: '발사 시 5%로 전선 즉시 이동', set: { launchDash: 0.05 } },
    { hp: 126, atk: 13.6, stop: 6.20, name: '훈련대로함 I', desc: '공격 시 10%로 피해 +10%', set: { atkProcChance: 0.10, atkProcMult: 0.10 } },
    { hp: 134, atk: 14.4, stop: 6.30, name: '초보자행운 II', desc: '치명 피격 시 6%로 체력 1 생존', set: { luckySurvive: 0.06 } },
    { hp: 142, atk: 15.2, stop: 6.40, name: '신병받아라 II', desc: '발사 시 10%로 전선 즉시 이동', set: { launchDash: 0.10 } },
    { hp: 150, atk: 16.0, stop: 6.50, name: '훈련대로함 II', desc: '공격 시 15%로 피해 +15%', set: { atkProcChance: 0.15, atkProcMult: 0.15 } },
    { hp: 158, atk: 16.8, stop: 6.60, name: '초보자행운 III', desc: '치명 피격 시 10%로 체력 1 생존', set: { luckySurvive: 0.10 } },
    { hp: 166, atk: 17.6, stop: 6.70, name: '신병받아라 III', desc: '발사 시 15%로 전선 즉시 이동', set: { launchDash: 0.15 } },
    { hp: 174, atk: 18.4, stop: 6.80, name: '훈련대로함 III', desc: '공격 시 20%로 피해 +20%', set: { atkProcChance: 0.20, atkProcMult: 0.20 } },
    { hp: 180, atk: 19.0, stop: 7.00, name: '신병보험', desc: '사망 시 25%로 15G (합성 제외)', set: { deathGoldChance: 0.25, deathGold: 15 } },
  ],
  3: [
    { hp: 240, atk: 25.0, stop: 9.00, name: '쾌속진격 I', desc: '발사 시 10%로 5초 이동 1.5배', set: { launchMoveChance: 0.10 } },
    { hp: 255, atk: 26.8, stop: 9.12, name: '무기관리 I', desc: '발사 시 10%로 5초 공격력 1.5배', set: { launchAtkChance: 0.10 } },
    { hp: 270, atk: 28.6, stop: 9.24, name: '빠른검술 I', desc: '발사 시 10%로 5초 공속 1.5배', set: { launchAspdChance: 0.10 } },
    { hp: 285, atk: 30.4, stop: 9.36, name: '쾌속진격 II', desc: '발사 시 15%로 5초 이동 1.5배', set: { launchMoveChance: 0.15 } },
    { hp: 300, atk: 32.2, stop: 9.48, name: '무기관리 II', desc: '발사 시 15%로 5초 공격력 1.5배', set: { launchAtkChance: 0.15 } },
    { hp: 315, atk: 34.0, stop: 9.60, name: '빠른검술 II', desc: '발사 시 15%로 5초 공속 1.5배', set: { launchAspdChance: 0.15 } },
    { hp: 330, atk: 35.8, stop: 9.72, name: '쾌속진격 III', desc: '발사 시 20%로 5초 이동 1.5배', set: { launchMoveChance: 0.20 } },
    { hp: 345, atk: 37.6, stop: 9.84, name: '무기관리 III', desc: '발사 시 20%로 5초 공격력 1.5배', set: { launchAtkChance: 0.20 } },
    { hp: 360, atk: 39.0, stop: 9.95, name: '빠른검술 III', desc: '발사 시 20%로 5초 공속 1.5배', set: { launchAspdChance: 0.20 } },
    { hp: 380, atk: 40.0, stop: 10.00, name: '베테랑병사', desc: '발사 버프 지속 10초', set: { launchBuffDur: 10 } },
  ],
  4: [
    { hp: 500, atk: 55.0, stop: 13.00, name: '체력관리 I', desc: '전열에서 초당 체력 4', set: { frontRegenPerSec: 4 } },
    { hp: 535, atk: 58.5, stop: 13.12, name: '방패막기 I', desc: '근처 아군 피해 8% 감소 (오라 1회)', set: { shieldDr: 0.08 } },
    { hp: 570, atk: 62.0, stop: 13.24, name: '갑옷관리 I', desc: '본인 피해 10% 감소', set: { selfDr: 0.10 } },
    { hp: 610, atk: 66.0, stop: 13.36, name: '체력관리 II', desc: '전열에서 초당 체력 8', set: { frontRegenPerSec: 8 } },
    { hp: 650, atk: 70.0, stop: 13.48, name: '방패막기 II', desc: '근처 아군 피해 12% 감소 (오라 1회)', set: { shieldDr: 0.12 } },
    { hp: 690, atk: 74.0, stop: 13.60, name: '갑옷관리 II', desc: '본인 피해 15% 감소', set: { selfDr: 0.15 } },
    { hp: 730, atk: 78.0, stop: 13.72, name: '체력관리 III', desc: '전열에서 초당 체력 12', set: { frontRegenPerSec: 12 } },
    { hp: 765, atk: 82.0, stop: 13.85, name: '방패막기 III', desc: '근처 아군 피해 16% 감소 (오라 1회)', set: { shieldDr: 0.16 } },
    { hp: 790, atk: 85.0, stop: 13.92, name: '갑옷관리 III', desc: '본인 피해 20% 감소', set: { selfDr: 0.20 } },
    { hp: 820, atk: 88.0, stop: 14.00, name: '결사항전', desc: '전열 사망 시 25%로 3초 전선 정지 (지속 중첩 없음)', set: { deathLineFreezeChance: 0.25 } },
  ],
  5: [
    { hp: 1050, atk: 120.0, stop: 18.00, name: '소드비기너 I', desc: '공격 시 고정 피해 +30', set: { flatDmg: 30 } },
    { hp: 1120, atk: 128.0, stop: 18.12, name: '광역공격 I', desc: '클리브 범위 +6px', set: { cleaveBonus: 6 } },
    { hp: 1190, atk: 136.0, stop: 18.24, name: '넉백공격 I', desc: '공격 시 10%로 적 12px 넉백', set: { knockbackChance: 0.10, knockbackPx: 12 } },
    { hp: 1270, atk: 144.0, stop: 18.36, name: '소드비기너 II', desc: '공격 시 고정 피해 +50', set: { flatDmg: 50 } },
    { hp: 1350, atk: 152.0, stop: 18.48, name: '광역공격 II', desc: '클리브 범위 +12px', set: { cleaveBonus: 12 } },
    { hp: 1430, atk: 160.0, stop: 18.60, name: '넉백공격 II', desc: '공격 시 15%로 적 16px 넉백', set: { knockbackChance: 0.15, knockbackPx: 16 } },
    { hp: 1510, atk: 168.0, stop: 18.72, name: '소드비기너 III', desc: '공격 시 고정 피해 +70', set: { flatDmg: 70 } },
    { hp: 1590, atk: 175.0, stop: 18.85, name: '광역공격 III', desc: '클리브 범위 +18px', set: { cleaveBonus: 18 } },
    { hp: 1650, atk: 182.0, stop: 18.92, name: '넉백공격 III', desc: '공격 시 20%로 적 20px 넉백', set: { knockbackChance: 0.20, knockbackPx: 20 } },
    { hp: 1700, atk: 188.0, stop: 19.00, name: '기사도', desc: '전열 도달 시 하위 티어와 선두 교체', set: { knightSwap: true } },
  ],
  6: [
    { hp: 2200, atk: 250.0, stop: 24.00, name: '소드엑스퍼트 I', desc: '공격 시 고정 피해 +70', set: { flatDmg: 70 } },
    { hp: 2350, atk: 267.0, stop: 24.15, name: '위기감지 I', desc: '근처 아군 피격 3% 무효 (오라 1회)', set: { crisisDodge: 0.03 } },
    { hp: 2500, atk: 284.0, stop: 24.30, name: '군단지휘 I', desc: '근처 아군 진격 +20% (오라 1회)', set: { captainAdvance: 0.20 } },
    { hp: 2680, atk: 302.0, stop: 24.45, name: '소드엑스퍼트 II', desc: '공격 시 고정 피해 +100', set: { flatDmg: 100 } },
    { hp: 2860, atk: 320.0, stop: 24.60, name: '위기감지 II', desc: '근처 아군 피격 6% 무효 (오라 1회)', set: { crisisDodge: 0.06 } },
    { hp: 3040, atk: 338.0, stop: 24.75, name: '군단지휘 II', desc: '근처 아군 진격 +35% (오라 1회)', set: { captainAdvance: 0.35 } },
    { hp: 3220, atk: 356.0, stop: 24.90, name: '소드엑스퍼트 III', desc: '공격 시 고정 피해 +130', set: { flatDmg: 130 } },
    { hp: 3380, atk: 372.0, stop: 25.05, name: '위기감지 III', desc: '근처 아군 피격 9% 무효 (오라 1회)', set: { crisisDodge: 0.09 } },
    { hp: 3500, atk: 385.0, stop: 25.20, name: '군단지휘 III', desc: '근처 아군 진격 +50% (오라 1회)', set: { captainAdvance: 0.50 } },
    { hp: 3600, atk: 400.0, stop: 25.40, name: '소드마스터', desc: '공격 틱마다 50%로 1회 추가타', set: { doubleHitChance: 0.50 } },
  ],
  7: [
    { hp: 4600, atk: 520.0, stop: 32.00, name: '신성오라 I', desc: '근처 아군 초당 최대체력 0.5% (오라 1회)', set: { holyRegen: 0.005 } },
    { hp: 4920, atk: 555.0, stop: 32.15, name: '신성망치 I', desc: '공격 시 광역 고정 피해 +100', set: { hammerSplash: 100 } },
    { hp: 5240, atk: 590.0, stop: 32.30, name: '희생정신 I', desc: '근처 피해 15%를 70%로 흡수 (오라 1회)', set: { sacrificeShare: 0.15, sacrificeKeep: 0.70 } },
    { hp: 5600, atk: 630.0, stop: 32.45, name: '신성오라 II', desc: '근처 아군 초당 최대체력 1.0% (오라 1회)', set: { holyRegen: 0.010 } },
    { hp: 5960, atk: 670.0, stop: 32.60, name: '신성망치 II', desc: '공격 시 광역 고정 피해 +160', set: { hammerSplash: 160 } },
    { hp: 6320, atk: 710.0, stop: 32.75, name: '희생정신 II', desc: '근처 피해 25%를 60%로 흡수 (오라 1회)', set: { sacrificeShare: 0.25, sacrificeKeep: 0.60 } },
    { hp: 6680, atk: 750.0, stop: 32.90, name: '신성오라 III', desc: '근처 아군 초당 최대체력 1.5% (오라 1회)', set: { holyRegen: 0.015 } },
    { hp: 7000, atk: 790.0, stop: 33.05, name: '신성망치 III', desc: '공격 시 광역 고정 피해 +220', set: { hammerSplash: 220 } },
    { hp: 7250, atk: 820.0, stop: 33.20, name: '희생정신 III', desc: '근처 피해 35%를 50%로 흡수 (오라 1회)', set: { sacrificeShare: 0.35, sacrificeKeep: 0.50 } },
    { hp: 7450, atk: 850.0, stop: 33.40, name: '기적', desc: '사망 시 전원 회복 (웨이브당 1회)', set: { miracleOnDeath: true } },
  ],
  8: [
    { hp: 9500, atk: 1100, stop: 42.00, name: '드래곤브레스 I', desc: '공격 시 전방 관통 피해 +150', set: { breathDmg: 150 } },
    { hp: 10100, atk: 1170, stop: 42.15, name: '드래곤피어 I', desc: '전선 1.0초 정지 (쿨 30초, 전장 1회)', set: { fearFreeze: 1.0 } },
    { hp: 10700, atk: 1240, stop: 42.30, name: '드래곤웨이브 I', desc: '등장 시 적 현재 체력 6%', set: { appearHpPct: 0.06 } },
    { hp: 11400, atk: 1320, stop: 42.45, name: '드래곤브레스 II', desc: '공격 시 전방 관통 피해 +300', set: { breathDmg: 300 } },
    { hp: 12100, atk: 1400, stop: 42.60, name: '드래곤피어 II', desc: '전선 1.8초 정지 (쿨 30초, 전장 1회)', set: { fearFreeze: 1.8 } },
    { hp: 12800, atk: 1480, stop: 42.75, name: '드래곤웨이브 II', desc: '등장 시 적 현재 체력 12%', set: { appearHpPct: 0.12 } },
    { hp: 13500, atk: 1560, stop: 42.90, name: '드래곤브레스 III', desc: '공격 시 전방 관통 피해 +450', set: { breathDmg: 450 } },
    { hp: 14100, atk: 1640, stop: 43.10, name: '드래곤피어 III', desc: '전선 2.5초 정지 (쿨 30초, 전장 1회)', set: { fearFreeze: 2.5 } },
    { hp: 14600, atk: 1710, stop: 43.30, name: '드래곤웨이브 III', desc: '등장 시 적 현재 체력 18%', set: { appearHpPct: 0.18 } },
    { hp: 15000, atk: 1780, stop: 43.60, name: '드래곤강림', desc: '등장 시 10%로 일반 즉사 / 보스 30%', set: { appearExecute: 0.10 } },
  ],
  9: [
    { hp: 19000, atk: 2300, stop: 55.00, name: '전군진격 I', desc: '전체 아군 이동 +10% (오라 1회)', set: { armyMove: 0.10 } },
    { hp: 21000, atk: 2580, stop: 56.50, name: '전군공격 I', desc: '전체 아군 공격 +8% (오라 1회)', set: { armyAtk: 0.08 } },
    { hp: 23000, atk: 2860, stop: 58.00, name: '전군방어 I', desc: '전체 아군 피해 8% 감소 (오라 1회)', set: { armyDr: 0.08 } },
    { hp: 25500, atk: 3180, stop: 59.80, name: '전군진격 II', desc: '전체 아군 이동 +18% (오라 1회)', set: { armyMove: 0.18 } },
    { hp: 28000, atk: 3500, stop: 61.60, name: '전군공격 II', desc: '전체 아군 공격 +15% (오라 1회)', set: { armyAtk: 0.15 } },
    { hp: 30500, atk: 3820, stop: 63.40, name: '전군방어 II', desc: '전체 아군 피해 15% 감소 (오라 1회)', set: { armyDr: 0.15 } },
    { hp: 33000, atk: 4140, stop: 65.20, name: '전군진격 III', desc: '전체 아군 이동 +25% (오라 1회)', set: { armyMove: 0.25 } },
    { hp: 35500, atk: 4460, stop: 67.00, name: '전군공격 III', desc: '전체 아군 공격 +22% (오라 1회)', set: { armyAtk: 0.22 } },
    { hp: 37200, atk: 4750, stop: 68.50, name: '전군방어 III', desc: '전체 아군 피해 22% 감소 (오라 1회)', set: { armyDr: 0.22 } },
    { hp: 39000, atk: 5000, stop: 70.00, name: '필사즉생', desc: '60초마다 전원 3초 무적 (전장 1회)', set: { invulnPeriod: 60, invulnDur: 3 } },
  ],
  10: [
    { hp: 50000, atk: 6500, stop: 90.00, name: '찬가', desc: '사명 피해 요구 20% 감소', set: { missionReqMult: 0.80 } },
    { hp: 53500, atk: 6950, stop: 92.00, name: '의무', desc: '보스 처치 퇴장 한도 +1', set: { bossKillBonus: 1 } },
    { hp: 57000, atk: 7400, stop: 94.00, name: '승천', desc: '승천 폭발 1.5배', set: { ascendDmgMult: 1.5 } },
    { hp: 61000, atk: 7900, stop: 96.00, name: '용사', desc: '보스 최소 전진을 0으로', set: { bossMinAdvanceZero: true } },
    { hp: 65000, atk: 8400, stop: 98.00, name: '신격', desc: '8초마다 전체 적 신벌 (전장 1회)', set: { smitePeriod: 8 } },
    { hp: 69000, atk: 8900, stop: 100.0, name: '신탁', desc: '민병대 영웅 각성 확률 2배', set: { militiaAwakenMult: 2 } },
    { hp: 73000, atk: 9400, stop: 102.0, name: '강림', desc: '승천 시 15%로 영웅 재강림', set: { reenterChance: 0.15 } },
    { hp: 77000, atk: 9900, stop: 104.0, name: '광휘', desc: '영웅 생존 시 아군 공/방 +25% (오라 1회)', set: { heroArmyAtk: 0.25, heroArmyDr: 0.25 } },
    { hp: 81000, atk: 10400, stop: 106.0, name: '광란', desc: '영웅 생존 시 적 공/이속 -25% (오라 1회)', set: { enemyAtkDebuff: 0.25, enemySpdDebuff: 0.25 } },
    {
      hp: 88000, atk: 11500, stop: 110.0, name: '전설',
      desc: '고유 키트 2배 · 사명 -40% · 아군 +50% · 적 -50%',
      set: {
        missionReqMult: 0.60,
        bossKillBonus: 2,
        ascendDmgMult: 3,
        bossMinAdvanceZero: true,
        smitePeriod: 4,
        militiaAwakenMult: 4,
        reenterChance: 0.30,
        heroArmyAtk: 0.50,
        heroArmyDr: 0.50,
        enemyAtkDebuff: 0.50,
        enemySpdDebuff: 0.50,
        legendKit: true,
      },
    },
  ],
};

export function clampUnitLevel(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return UNIT_MIN_LEVEL;
  return Math.max(UNIT_MIN_LEVEL, Math.min(UNIT_MAX_LEVEL, v));
}

export function clampVillageLevel(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return VILLAGE_START_LEVEL;
  return Math.max(VILLAGE_START_LEVEL, Math.min(VILLAGE_MAX_LEVEL, v));
}

export function emptyUnitLevels() {
  const levels = {};
  for (let t = 1; t <= 10; t++) levels[t] = UNIT_MIN_LEVEL;
  return levels;
}

export function houseUnlockVillageLevel(tier) {
  const t = Math.floor(Number(tier) || 1);
  return Math.max(1, Math.min(VILLAGE_MAX_LEVEL, t));
}

export function isHouseUnlocked(villageLevel, tier) {
  return clampVillageLevel(villageLevel) >= houseUnlockVillageLevel(tier);
}

export function houseByTier(tier) {
  return VILLAGE_HOUSES.find((h) => h.tier === tier) || null;
}

export function nextVillageUnlock(villageLevel) {
  const next = clampVillageLevel(villageLevel) + 1;
  if (next > VILLAGE_MAX_LEVEL) return null;
  return houseByTier(next);
}

export function medalCost(tier, fromLevel) {
  const costs = MEDAL_COSTS[tier];
  if (!costs) return 0;
  const i = Math.floor(Number(fromLevel) || 0);
  if (i < 0 || i >= costs.length) return 0;
  return costs[i];
}

export function medalsForClearedWave(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 0));
  if (w < 1 || w > VILLAGE_CLEAR_WAVE) return 0;
  const band = Math.ceil(w / 5);
  return 10 * (2 ** (band - 1));
}

export function medalsForFullClear() {
  let n = VILLAGE_CLEAR_BONUS;
  for (let w = 1; w <= VILLAGE_CLEAR_WAVE; w++) n += medalsForClearedWave(w);
  return n;
}

export function formatMedals(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v >= 1000000) {
    const m = v / 1000000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2)}M`;
  }
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) {
    const k = v / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(v);
}

export function villageLevels(tier) {
  return TIERS[tier] || [];
}

export function villageResolve(tier, level) {
  const lv = clampUnitLevel(level);
  const rows = villageLevels(tier);
  const p = emptyPassives();
  const base = UNITS[tier - 1];
  if (!rows.length || lv <= 0) {
    return {
      ...p,
      hp: base?.hp || 1,
      atk: base?.atk || 0,
      stop: base?.stop || 0,
      name: '미훈련',
      desc: '숙소 훈련 전 기본 병사',
    };
  }
  const row = rows[lv - 1] || rows[0];
  for (let i = 0; i < lv; i++) {
    const s = rows[i]?.set;
    if (s) Object.assign(p, s);
  }
  return {
    ...p,
    hp: row.hp,
    atk: row.atk,
    stop: row.stop,
    name: row.name,
    desc: row.desc,
  };
}

export function ownedPassives(tier, level) {
  const lv = clampUnitLevel(level);
  const rows = villageLevels(tier);
  const seen = new Map();
  for (let i = 0; i < lv; i++) {
    const row = rows[i];
    if (!row) continue;
    const family = row.name.replace(/\s+(I|II|III)$/, '');
    seen.set(family, { level: i + 1, name: row.name, desc: row.desc });
  }
  return [...seen.values()];
}

export function unitCombatStat(tier, level) {
  const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  const base = UNITS[t - 1];
  const v = villageResolve(t, level);
  const special = base.special ? { ...base.special } : null;
  if (special && v.cleaveBonus) {
    special.cleaveRadius = (special.cleaveRadius || 0) + v.cleaveBonus;
  }
  return {
    ...base,
    hp: v.hp,
    atk: v.atk,
    stop: v.stop,
    special,
    village: v,
  };
}

export function uniqueMax(values) {
  let best = 0;
  for (const v of values || []) {
    const n = Number(v) || 0;
    if (n > best) best = n;
  }
  return best;
}

export function bestNearbyAura(target, sources, radius, valueOf, distOf) {
  let best = 0;
  let bestSrc = null;
  for (const src of sources || []) {
    if (!src || src === target) continue;
    const r = Number(radius) || 0;
    if (r <= 0) continue;
    const d = distOf(target, src);
    if (d > r) continue;
    const val = Number(valueOf(src)) || 0;
    if (val > best) {
      best = val;
      bestSrc = src;
    }
  }
  return { value: best, source: bestSrc };
}

/** 개인 확률은 중첩하지 않음. 복사본 n마리여도 유닛당 확률은 그대로. */
export function perUnitChance(chance, _copyCount) {
  return Math.max(0, Number(chance) || 0);
}

export function collectGlobalAuras(units, levelOf) {
  const auras = {
    militiaAdvance: 0,
    armyMove: 0,
    armyAtk: 0,
    armyDr: 0,
    heroArmyAtk: 0,
    heroArmyDr: 0,
    enemyAtkDebuff: 0,
    enemySpdDebuff: 0,
    bossMinAdvanceZero: false,
    smitePeriod: 0,
    smiteAtkFrac: 0.35,
    militiaAwakenMult: 1,
    missionReqMult: 1,
    bossKillBonus: 0,
    ascendDmgMult: 1,
    reenterChance: 0,
    legendKit: false,
    invulnPeriod: 0,
    invulnDur: 3,
    fearFreeze: 0,
    holyRegen: 0,
    holyRadius: 110,
    paladinHealPct: 0,
    paladinHealRadius: 110,
    paladinHealPeriod: 2,
  };
  for (const u of units || []) {
    if (!u || u.dead) continue;
    const lv = levelOf ? levelOf(u.tier) : 0;
    const p = villageResolve(u.tier, lv);
    auras.militiaAdvance = Math.max(auras.militiaAdvance, p.militiaAdvance || 0);
    auras.armyMove = Math.max(auras.armyMove, p.armyMove || 0);
    auras.armyAtk = Math.max(auras.armyAtk, p.armyAtk || 0);
    auras.armyDr = Math.max(auras.armyDr, p.armyDr || 0);
    auras.fearFreeze = Math.max(auras.fearFreeze, p.fearFreeze || 0);
    if ((p.holyRegen || 0) > auras.holyRegen) {
      auras.holyRegen = p.holyRegen;
      auras.holyRadius = p.holyRadius || 110;
    }
    if (p.invulnPeriod > 0) {
      auras.invulnPeriod = p.invulnPeriod;
      auras.invulnDur = p.invulnDur || 3;
    }
    if (u.tier === 10 || u.heroType) {
      auras.heroArmyAtk = Math.max(auras.heroArmyAtk, p.heroArmyAtk || 0);
      auras.heroArmyDr = Math.max(auras.heroArmyDr, p.heroArmyDr || 0);
      auras.enemyAtkDebuff = Math.max(auras.enemyAtkDebuff, p.enemyAtkDebuff || 0);
      auras.enemySpdDebuff = Math.max(auras.enemySpdDebuff, p.enemySpdDebuff || 0);
      auras.bossMinAdvanceZero = auras.bossMinAdvanceZero || !!p.bossMinAdvanceZero;
      if (p.smitePeriod > 0) {
        auras.smitePeriod = auras.smitePeriod > 0
          ? Math.min(auras.smitePeriod, p.smitePeriod)
          : p.smitePeriod;
        auras.smiteAtkFrac = p.smiteAtkFrac || 0.35;
      }
      auras.militiaAwakenMult = Math.max(auras.militiaAwakenMult, p.militiaAwakenMult || 1);
      auras.missionReqMult = Math.min(auras.missionReqMult, p.missionReqMult || 1);
      auras.bossKillBonus = Math.max(auras.bossKillBonus, p.bossKillBonus || 0);
      auras.ascendDmgMult = Math.max(auras.ascendDmgMult, p.ascendDmgMult || 1);
      auras.reenterChance = Math.max(auras.reenterChance, p.reenterChance || 0);
      auras.legendKit = auras.legendKit || !!p.legendKit;
    }
  }
  return auras;
}

export function heroKit(type, level, auras) {
  const base = HEROES[type];
  if (!base) return null;
  const kit = { ...base };
  const legend = !!(auras?.legendKit || villageResolve(10, level).legendKit);
  if (legend) {
    if (type === 'arthur') {
      kit.period = (base.period || 3) * 0.5;
      kit.atkFrac = (base.atkFrac || 0.4) * 2;
    } else if (type === 'jeanne') {
      kit.damageBuff = 1 + ((base.damageBuff || 1.5) - 1) * 2;
    } else if (type === 'valkyrie') {
      kit.tick = (base.tick || 0.3) * 0.5;
      kit.atkFrac = (base.atkFrac || 0.12) * 2;
    }
  }
  return kit;
}

export function heroBossLimit(auras) {
  return HERO_BOSS_LIMIT + Math.max(0, Math.floor(auras?.bossKillBonus || 0));
}

export function heroAscendAtkMult(auras) {
  return HERO_ASCENSION_ATK_MULT * Math.max(1, auras?.ascendDmgMult || 1);
}

export function nextTierCapOk(tier, level = UNIT_MAX_LEVEL) {
  if (tier >= 10) return true;
  const cur = villageResolve(tier, level);
  const next = UNITS[tier];
  if (!next) return true;
  return cur.hp < next.hp * 0.8
    && cur.atk < next.atk * 0.8
    && cur.stop < next.stop * 0.8;
}
