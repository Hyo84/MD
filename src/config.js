// 게임 설정 및 스탯 테이블 (어드민 패널에서 실시간 수정 가능)

export const CANVAS_W = 450;
export const CANVAS_H = 800;
// 전장 슬롯: 기본 3칸, 전장 확장 스킬로 5 → 7칸. MAX 7칸은 extra inset 0(전체 캔버스).
export const BASE_SLOT_COLS = 3;
export const MAX_SLOT_COLS = 7;
// extraInset = (MAX - cols) / 2 * SLOT_INSET_PER_COL → 7칸=0, 5칸=50, 3칸=100. 플레이어블 450 / 350 / 250.
export const SLOT_INSET_PER_COL = 50;
export const SLOT_EDGE_PAD = 40;      // 슬롯을 내면에서 한 칸 더 안쪽 (7칸일 때 기존 40)
export const WALL_DEST_Y = 660;  // 성벽 스프라이트 상단(총안). 마지노선과 분리
export const DEFEAT_Y = 684;     // 마지노선. 성벽 보도로 살짝 내림
export const CAMP_DEST_Y = 32;   // 적 캠프 그리기·아군 침입 판정
export const CAMP_DRAW_H = 162;  // 108 × 1.5
export const LINE_START_Y = CAMP_DEST_Y + CAMP_DRAW_H; // 웨이브라인 상한 = 캠프 하단 (194)
export const ENEMY_SPAWN_Y = CAMP_DEST_Y; // 캠프 상단에서 합류. 라인이 상한이어도 내려오며 착지
export const LAUNCHER_Y = 700;
// 전열 길이 DEFEAT_Y − LINE_START_Y = 490

// 전역 밸런스 (어드민 패널에서 실시간 조정)
export const BALANCE = {
  baseLineSpeed: 9.5,   // 웨이브라인 기본 전진 속도 (px/초). 무투자 3칸이 빈 열을 못 막으면 샘
  // 착지한 보스(_enemyOccupiesLine)가 있을 때 netSpeed 하한. joining 캠프 행군에는 적용 안 함.
  bossMinAdvance: 9,
  // 전열에 적이 붙어 있으면 netSpeed 하한 (px/초). 0이면 없음. 어드민에서 즉시 반영.
  lineMinAdvance: 3,
  spawnInterval: 4.1,   // 1웨이브 적 스폰 간격 (초). 웨이브 1.5 / 리스폰 0.5 템포에 맞춤
  spawnIntervalAccel: 0.22, // interval = base / (1 + (wave-1)*accel)
  spawnIntervalFloor: 0.96,  // 웨이브 곡선 최단 스폰 간격 (초). 캠프 러시는 spawnCampRushFloor
  spawnCampRaidMin: 2,  // 캠프 침입 시 투입 배율 하한 (아군이 캠프 스프라이트 안)
  spawnCampRaidMax: 3,  // 캠프 침입 시 투입 배율 상한
  // 전열 아군이 캠프에 가까워질수록 스폰 타이머가 빨리 줄어듦 (라인 기준이면 시작부터 러시)
  spawnCampApproachRange: 200, // 캠프 하단에서 아군까지 이 거리(px) 안에서 가속. 밖·아군 없음이면 배율 1
  spawnCampTouchMult: 2.2,     // 아군이 캠프 하단에 닿을 때 타이머 소진 배율
  spawnCampApproachEase: 1.5,  // proximity^k. 1=선형, >1이면 캠프 근처에서 급가속
  spawnCampRushFloor: 1.0,     // 러시 실효 최단 간격 (초)
  goldXpRate: 0.2,             // 패배/클리어 시 잔여 골드 → 계정 XP 배율. 한 판 만렙 방지
  clearWave: 30,               // 이 웨이브 보스 처치 시 완전 클리어
  clearRewardMult: 2,          // 완전 클리어 시 런 XP(점수+보스보너스+골드환산) 배율
  bossEscortCount: 2,   // W1–4 기본 호위. 실제 수는 bossEscortForWave
  bossKnightEscorts: 0, // W1–4는 해골기사 없음. 허들부터 증가
  bossMinionCap: 6,     // 보스전 중 필드에 유지할 최대 부하 수
  launchCooldown: 1.75, // 발사 쿨다운 (초, 스킬로 감소 · 최저 launchCdFloor)
  mergeComboCdRefund: 0.25, // 발사체 연속 머지 2회+ 시 남은 발사 쿨 감소 비율
  airMergeMaxTier: 5, // 공중 합성 결과 최대 티어. T6+는 착지한 유닛만
  launchSpeed: 720,     // 발사 돌진 (px/초). 짧은 버스트 후 진군 테이블로 걸음
  unitAdvanceSpeed: 28, // 진군 테이블이 없을 때 폴백 (px/초)
  // 진군 절대 속도 (px/초). 인덱스 0 = 스킬 없음, 1–5 = 진격 랭크
  advanceSpeedByRank: [28, 34, 42, 52, 64, 80],
  enemyJoinSpeed: 80,   // 적이 밀린 웨이브라인 슬롯까지 내려오는 합류 속도 (px/초)
  bossGatherStrength: 0.6, // 보스 집결 강도 (0=안함, 0.7 초과 시 교전 중인 유닛도 집결, 1=최대)
  gatherSpeed: 40,      // 집결 시 최대 가로 이동 속도 (px/초)
  attackCooldown: 0.8,  // 공격 틱 간격 (초)
  enemyReach: 12,       // 적 근접 공격 사거리 보정 (px). 실제 거리 = 적.r + 12

  // 5웨이브 허들. 허들 사이는 완만, 5/10/15/20/25/30에서 급상승(내부 호칭: 통곡의 벽).
  // 무투자(영지 0)는 W5에서 첫 벽, W8~10에서 막히는 게 목표. W14 클리어는 영지 필요.
  // W1–4 ≈ 1.00–1.23, W5 ≈ 2.63, W10 ≈ 7.4, W14 ≈ 9.7, W15 ≈ 20.9
  hurdleEvery: 5,
  intraRate: 0.07,      // 허들 사이 웨이브당 +7%
  hurdleFactor: 2.15,   // 5의 배수 웨이브에서 곱셈 스파이크 (이후 바닥으로 유지)
  bossHurdleExtra: 1.28, // 허들 보스만 HP/ATK 추가 배율. 쓰레기 곡선과 분리
  hurdleKillBonus: 8,   // 허들 웨이브 처치 할당 추가
  // 처치 N 전까지 잡몹은 계속 리필. 필드 상한 = 칸 수 × trashFieldPerCol (주차 포함).
  trashFieldPerCol: 3,

  // 뒷열 스택: ATK/HP는 그대로, 그 열 전열 진격만 1 + perRear*뒷열 수 (상한 cap). 보스는 제외.
  stackAdvancePerRear: 0.5,
  stackAdvanceCap: 3,

  // 적 없는 라인: 전열 아군 저지력으로 시작 위치까지 밀어올림
  emptyLinePushScale: 1,  // 저지력 배율 (1 = 교전 저지력과 동일)
  emptyLinePushSlack: 32, // 라인 홀드 위치에서 이 거리(px) 안이면 전열로 취급
};

// T2 발사 기본 확률 (_rollTier). 정예신병 랭크 0 테이블과 동일.
export const LAUNCH_T2_BASE = 0.25;

/**
 * 정예신병 랭크 0–10. 키 2–5 = 해당 티어 단독 확률, 나머지는 T1.
 * 2랭크마다 상위 티어 해금 (1–2 T2, 3–4 T3, 5–6 T4, 7–10 T5). 랭크 10에서 T5 = 5%.
 */
export const ELITE_RECRUIT_TABLE = [
  { 2: LAUNCH_T2_BASE, 3: 0,    4: 0,    5: 0    }, // 0: 기본 T2 25%
  { 2: 0.30,           3: 0,    4: 0,    5: 0    }, // 1
  { 2: 0.34,           3: 0,    4: 0,    5: 0    }, // 2
  { 2: 0.32,           3: 0.04, 4: 0,    5: 0    }, // 3: T3
  { 2: 0.32,           3: 0.07, 4: 0,    5: 0    }, // 4
  { 2: 0.30,           3: 0.07, 4: 0.02, 5: 0    }, // 5: T4
  { 2: 0.30,           3: 0.08, 4: 0.04, 5: 0    }, // 6
  { 2: 0.28,           3: 0.09, 4: 0.04, 5: 0.02 }, // 7: T5
  { 2: 0.28,           3: 0.10, 4: 0.05, 5: 0.03 }, // 8
  { 2: 0.27,           3: 0.11, 4: 0.06, 5: 0.04 }, // 9
  { 2: 0.26,           3: 0.12, 4: 0.07, 5: 0.05 }, // 10: T5 5%, T1 50%
];

/** 정예신병 랭크 → T1–T5 발사 확률 (합 1). */
export function launchTierChances(rank) {
  const max = ELITE_RECRUIT_TABLE.length - 1;
  const r = Math.max(0, Math.min(max, Math.floor(Number(rank) || 0)));
  const row = ELITE_RECRUIT_TABLE[r];
  const t2 = row[2] || 0;
  const t3 = row[3] || 0;
  const t4 = row[4] || 0;
  const t5 = row[5] || 0;
  return { 1: Math.max(0, 1 - t2 - t3 - t4 - t5), 2: t2, 3: t3, 4: t4, 5: t5 };
}

// 돌격 저지력: 미정착 발사 유닛이 적과 첫 접촉 시 라인 정지
export const CHARGE_STUTTER_TIME = 0.2; // 초 (갱신 스택)

// 머지 팽창 넉백: 합성 중점에서 주변 아군을 밖으로 밀침
export const MERGE_BLAST_RADIUS = 80; // px
export const MERGE_BLAST_FORCE = 360; // px/초 임펄스 (중심에서 최대, 거리 감쇠)

export const LIVE_MULT_MIN = 0.5;
export const LIVE_MULT_MAX = 5.0;
export const LIVE_MULT_STEP = 0.1;

export function clampLiveMult(v) {
  const stepped = Math.round(v * 10) / 10;
  return Math.max(LIVE_MULT_MIN, Math.min(LIVE_MULT_MAX, stepped));
}

// 트롤 비전투 재생 (% of maxHp / 초). HUD·어드민에서 실시간 조절.
export const REGEN_PCT_MIN = 0;
export const REGEN_PCT_MAX = 0.40;
export const REGEN_PCT_STEP = 0.02;

export function clampRegenPct(v) {
  const stepped = Math.round((Number(v) || 0) / REGEN_PCT_STEP) * REGEN_PCT_STEP;
  return Math.max(REGEN_PCT_MIN, Math.min(REGEN_PCT_MAX, Number(stepped.toFixed(2))));
}

// 적 리스폰 속도 배율. 1 = 기본, 2 = 두 배 빠름(간격 절반). HUD·어드민에서 실시간 조절.
export const SPAWN_RATE_MIN = 0.2;
export const SPAWN_RATE_MAX = 5.0;
export const SPAWN_RATE_STEP = 0.1;

export function clampSpawnRate(v) {
  const n = Number(v);
  const base = Number.isFinite(n) ? n : 1;
  const stepped = Math.round(base * 10) / 10;
  return Math.max(SPAWN_RATE_MIN, Math.min(SPAWN_RATE_MAX, stepped));
}

export function isHurdleWave(wave) {
  const every = Math.max(1, Math.round(BALANCE.hurdleEvery || 5));
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return w % every === 0;
}

// 웨이브별 적 HP/ATK 배율. 허들 사이는 intraRate, 5의 배수에서 hurdleFactor.
export function waveMultiplier(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const every = Math.max(1, Math.round(BALANCE.hurdleEvery || 5));
  const intra = Number.isFinite(BALANCE.intraRate) ? BALANCE.intraRate : 0.07;
  const hurdle = Number.isFinite(BALANCE.hurdleFactor) ? BALANCE.hurdleFactor : 2.15;
  let mult = 1;
  for (let i = 2; i <= w; i++) {
    mult *= (i % every === 0) ? hurdle : (1 + intra);
  }
  return mult;
}

/** 보스 등장 호위. 블록(5웨이브)마다 늘고, 허들부터 해골기사. */
export function bossEscortForWave(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const every = Math.max(1, Math.round(BALANCE.hurdleEvery || 5));
  const block = Math.floor(w / every); // W1–4=0, W5–9=1, W10–14=2
  const cap = Math.max(0, Math.round(BALANCE.bossMinionCap ?? 6));
  const base = Math.max(0, Math.round(BALANCE.bossEscortCount ?? 2));
  const escort = Math.min(cap, base + block * 2);
  const knights = block <= 0 ? 0 : Math.min(escort, 1 + (block - 1) * 2);
  return { escort, knights };
}

/** 보스 HP/ATK 배율. 허들 웨이브는 bossHurdleExtra를 추가로 곱함. */
export function bossWaveMultiplier(wave) {
  const m = waveMultiplier(wave);
  if (!isHurdleWave(wave)) return m;
  const extra = Number.isFinite(BALANCE.bossHurdleExtra) ? BALANCE.bossHurdleExtra : 1.28;
  return m * extra;
}

// 실효 배율 = 웨이브 곡선 × 실시간 수동 배율
export function effectiveMult(wave, liveMult = 1) {
  return waveMultiplier(wave) * liveMult;
}

// 아군 유닛 (T1 ~ T10)
// stop = 저지력(교전 중 라인 속도 감소, 적 없을 때 전열 푸시 속도 px/초), range = 공격 사거리(px)
// r = 물리/충돌 반경. drawR = 스프라이트·HP바·등급 숫자용 시각 반경 (전투 스탯과 무관)
export const UNITS = [
  { tier: 1,  name: '민병대',       color: '#D2B48C', r: 16, drawR: 14, hp: 50,    atk: 5,    mass: 1.0,  stop: 4,  range: 18 },
  { tier: 2,  name: '신병',         color: '#C2A679', r: 18, drawR: 16, hp: 110,   atk: 12,   mass: 1.3,  stop: 6,  range: 21 },
  { tier: 3,  name: '경보병',       color: '#CD7F32', r: 20, drawR: 18, hp: 240,   atk: 25,   mass: 1.7,  stop: 9,  range: 25 },
  { tier: 4,  name: '중보병',       color: '#708090', r: 22, drawR: 20, hp: 500,   atk: 55,   mass: 2.2,  stop: 13, range: 29 },
  { tier: 5,  name: '기사단원',     color: '#4682B4', r: 24, drawR: 22, hp: 1050,  atk: 120,  mass: 2.8,  stop: 18, range: 35,
    special: { cleaveRadius: 28, cleaveMult: 0.5 } },
  { tier: 6,  name: '근위대장',     color: '#4169E1', r: 26, drawR: 27, hp: 2200,  atk: 250,  mass: 3.5,  stop: 24, range: 41,
    special: { stunChance: 0.10, stunDuration: 0.5 } },
  { tier: 7,  name: '성기사',       color: '#FFD700', r: 32, drawR: 34, hp: 4600,  atk: 520,  mass: 4.3,  stop: 32, range: 48,
    special: { healPeriod: 2, healRadius: 110, healPct: 0.04 } },
  { tier: 8,  name: '드래곤가디언', color: '#8B0000', r: 30, drawR: 29, hp: 9500,  atk: 1100, mass: 5.3,  stop: 42, range: 56,
    special: { burnAtkFrac: 0.20, burnDuration: 3 } },
  { tier: 9,  name: '대원수',       color: '#4B0082', r: 33, drawR: 30, hp: 19000, atk: 2300, mass: 6.5,  stop: 55, range: 64,
    special: { shockPeriod: 4, shockAtkFrac: 0.3 } },
  { tier: 10, name: '영웅',         color: '#FF4500', r: 38, drawR: 33, hp: 50000, atk: 6500, mass: 10.0, stop: 90, range: 84 },
];

export const HEROES = {
  arthur:   { name: '아서',   desc: '3초마다 전체 검기', period: 3, atkFrac: 0.4 },
  jeanne:   { name: '잔느',   desc: '주변 아군 공격력 +50%', auraRadius: 140, damageBuff: 1.5 },
  valkyrie: { name: '발키리', desc: '사거리 내 회전 베기', tick: 0.3, atkFrac: 0.12 },
};

// T10 사명: 피해 쿼터를 채우면 명예로운 승천. HP로 죽으면 승천 없음.
// 쿼터 = max(min, base + wave * perWave). W1=20000, W13=80000.
export const HERO_MISSION = {
  min: 20000,
  base: 15000,
  perWave: 5000,
};
export function heroMissionDamage(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  return Math.max(HERO_MISSION.min, HERO_MISSION.base + w * HERO_MISSION.perWave);
}
export const HERO_MISSION_DAMAGE = HERO_MISSION.min; // 폴백 (스폰 시 heroMissionDamage(wave) 사용)
export const HERO_MISSION_KILLS = 25;     // 미사용 대안 쿼터 (킬 모드 스위치 없음)
export const HERO_BOSS_LIMIT = 3;         // 영웅 생존 중 보스 처치 이 횟수면 퇴장 (사명보다 먼저면 승천 없음). 한 보스당 카운트가 제일 많은 영웅 1명만.
export const HERO_ASCENSION_ATK_MULT = 1.5;
export const HERO_ASCENSION_SLOWMO = 0.3; // 초 (실시간 슬로모·플래시)
export const HERO_ASCENSION_REPLACEMENT_TIER = 5; // 폴백. 실제 잔류는 rollHeroRemnantTier
export const HERO_ASCENSION_BONUS_SCORE = 400;
/** 승천·퇴장 잔류 티어 범위 (T5~T9). 영웅의 전당에서 가중치 변경 예정. */
export const HERO_REMNANT_MIN = 5;
export const HERO_REMNANT_MAX = 9;
export const HERO_REMNANT_WEIGHTS = [1, 1, 1, 1, 1];

export function rollHeroRemnantTier(rand = Math.random) {
  const min = HERO_REMNANT_MIN;
  const max = HERO_REMNANT_MAX;
  const n = max - min + 1;
  let w = HERO_REMNANT_WEIGHTS;
  if (!Array.isArray(w) || w.length < n) w = Array.from({ length: n }, () => 1);
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, Number(w[i]) || 0);
  if (!(total > 0)) return min;
  let r = (typeof rand === 'function' ? rand() : Math.random()) * total;
  for (let i = 0; i < n; i++) {
    r -= Math.max(0, Number(w[i]) || 0);
    if (r <= 0) return min + i;
  }
  return max;
}

// 적 (웨이브라인에 부착되는 개체)
// speed = 라인 전진 가속 기여 (px/초, 0이면 라인을 밀지 않음)
export const MONSTERS = {
  goblin:     { name: '고블린',     icon: '고', grade: '1',    color: '#3CB371', outline: '#1e5c38', r: 15, hp: 72,   atk: 8,  speed: 6,   score: 10,  gold: 6 },
  skeleton:   { name: '스켈레톤',   icon: '스', grade: '2',    color: '#DCDCDC', outline: '#6e6e6e', r: 16, hp: 255,  atk: 21, speed: 1.5, score: 20,  gold: 12, sprite: 'skeleton2' },
  orc:        { name: '오크',       icon: '오', grade: '3',    color: '#6B8E23', outline: '#39510f', r: 22, hp: 330,  atk: 26, speed: 3,   score: 30,  gold: 18 },
  troll:      { name: '동굴 트롤',  icon: '트', grade: '4',    color: '#556B2F', outline: '#2c3a14', r: 28, hp: 780,  atk: 29, speed: 4.5, score: 100, gold: 50, regenDelay: 1.2, regenPct: 0.11 },
  skelknight: { name: '해골기사',   icon: '기', grade: '5',    color: '#C0C0C0', outline: '#4a4a4a', r: 24, hp: 540,  atk: 39, speed: 4.5, score: 80,  gold: 40, sprite: 'skeleton', bossOnly: true },
  boss:       { name: '오크 워로드', icon: '보스', grade: '보스', color: '#B22222', outline: '#5c0e0e', r: 45, hp: 2250, atk: 27, speed: 19.5, score: 500, gold: 150, isBoss: true },
};

// ---------- 골드 / 하단 티어 상점 ----------
export const ECONOMY = {
  startGold: 0,       // 런 시작 기본 골드 (스킬 startGold와 합산)
  taxPerSec: 0,       // 초당 세금 기본값 (스킬 taxRate와 합산)
  bountyMult: 1,      // 처치 골드 전역 배율 (스킬 bountyGold는 가산 %)
  shopBaseTier: 2,    // 용병술 0랭크일 때 구매 가능 최대 티어 (스킬 없으면 T2만)
};

export const SHOP_MIN_TIER = 2;
export const SHOP_MAX_TIER = 9;
export const SHOP_UNLIMITED = -1; // 웨이브 한도. -1 = 무제한

/** T2–T9 구매. T1은 무료 발사 전용, T10은 T9+T9 합성 전용. limit -1 = ∞ */
export const SHOP = {
  2: { price: 80,    limit: 2 },
  3: { price: 200,   limit: 2 },
  4: { price: 380,   limit: 2 },
  5: { price: 600,   limit: 2 },
  6: { price: 1400,  limit: 2 },
  7: { price: 3000,  limit: 1 },
  8: { price: 6500,  limit: 1 },
  9: { price: 14000, limit: 1 },
};

export function isShopTier(tier) {
  const t = Math.floor(Number(tier) || 0);
  return t >= SHOP_MIN_TIER && t <= SHOP_MAX_TIER && !!SHOP[t];
}

export function formatShopGold(n) {
  const v = Math.abs(Math.floor(Number(n) || 0));
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) {
    const k = v / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return String(v);
}

export const FRICTION_AIR_UNIT = 0.03;

export function killsNeeded(wave) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const every = Math.max(1, Math.round(BALANCE.hurdleEvery || 5));
  let n = 10 + w * 2; // W1=12, W5=20, W10=30
  if (w % every === 0) n += Math.max(0, Math.round(BALANCE.hurdleKillBonus ?? 8));
  return n;
}

// ---------- 메타 진행 (XP / 레벨 / 스킬) ----------
// XP = 처치 점수 + 보스 보너스(bossXpPerWave * 클리어 웨이브) + 잔여 골드 환산.
// 한 판 W5 클리어 ≈ Lv2~3. W10을 뚫어도 Lv4 근처. Lv9는 반복·영지 목표.
export const PROGRESSION = {
  bossXpPerWave: 35,      // 보스 처치 시 추가 XP = 이 값 × 클리어한 웨이브
  launchCdFloor: 0.28,    // 발사 쿨다운 하드 하한 (초)
  regenNearSlack: 48,     // 전열로 간주해 재생이 켜지는 추가 여유 (px)

  // 방어벽: 라인이 마지노선에 닿으면 즉시 게임오버 대신 1회 충격.
  // 충격 시 벽 HP −wallDmgPerHit, 라인을 wallKnockback px 위로 밀어냄 (LINE_START_Y 미만 불가).
  // 그 충격으로 HP가 0이 되면 벽은 파괴되고 밀치기는 적용됨. 다음 접촉은 게임오버.
  wallBaseHp: 3,
  wallDmgPerHit: 1,
  wallBaseKnockback: 70,  // px

  // 궁수: 벽 위에 서서 사거리 안의 적을 사격(합류 포함).
  // 우선순위: 웨이브라인 착지 > 보스 > 강한 적 > 그 외. 웨이브 솔로 불가.
  // 탄약은 웨이브당 지급, 보스 처치(웨이브 증가) 및 런 시작 시 재충전. 소진 시 다음 웨이브까지 정지.
  // 인원 상한은 전장 칸(3/5/7). archerMax는 절대 상한.
  archerMax: 7,
  archerBaseRange: 200,
  archerBaseAtk: 24,
  archerBaseAmmo: 10,
  archerInterval: 1.05,   // 초/발
};

// 인덱스 = 현재 레벨. 값 = 다음 레벨까지 XP. 테이블 이후는 last + extraPerLevel*(level-lastIndex)
export const XP_TO_NEXT = [
  0,
  2200,   // 1→2  W5 클리어 한 판으로 넘김
  3800,   // 2→3
  5800,   // 3→4  W10 클리어 근처
  8500,   // 4→5
  12000,  // 5→6
  16500,  // 6→7
  22000,  // 7→8
  29000,  // 8→9
  38000,  // 9→10
];
export const XP_AFTER_TABLE = 8000; // Lv10+ : 38000 + 8000*(level-9)

export function xpToNextLevel(level) {
  const lv = Math.max(1, Math.floor(level));
  if (lv < XP_TO_NEXT.length) return XP_TO_NEXT[lv];
  return XP_TO_NEXT[XP_TO_NEXT.length - 1] + XP_AFTER_TABLE * (lv - (XP_TO_NEXT.length - 1));
}

/** 전장 확장 랭크 → 슬롯 열 수 (3 / 5 / 7). */
export function slotColsForRank(rank) {
  const r = Math.max(0, Math.floor(Number(rank) || 0));
  return Math.min(MAX_SLOT_COLS, BASE_SLOT_COLS + r * 2);
}

/** 측면 벽 extra inset. 7칸=0, 5칸=50, 3칸=100. */
export function playfieldExtraInset(cols) {
  const c = Math.max(BASE_SLOT_COLS, Math.min(MAX_SLOT_COLS, Math.floor(Number(cols) || BASE_SLOT_COLS)));
  return (MAX_SLOT_COLS - c) / 2 * SLOT_INSET_PER_COL;
}

/** 플레이어블 좌·우 X. 7칸=0–450, 5칸=50–400, 3칸=100–350. */
export function getPlayfieldInset(cols) {
  const extra = playfieldExtraInset(cols);
  return { left: extra, right: CANVAS_W - extra };
}

/** 첫/마지막 슬롯 X에 쓰는 마진 = 벽 inset + 슬롯 패딩. */
export function playfieldMargin(cols) {
  return playfieldExtraInset(cols) + SLOT_EDGE_PAD;
}

export function getSlotX(col, totalCols) {
  if (totalCols <= 1) return CANVAS_W / 2;
  const margin = playfieldMargin(totalCols);
  return margin + col * ((CANVAS_W - margin * 2) / (totalCols - 1));
}

/** 인덱스 = 궁수 레벨 1–10. 해금 시 Lv1. */
export const ARCHER_LEVELS = [
  null,
  { range: 200, atk: 24, ammo: 10 },
  { range: 210, atk: 28, ammo: 12 },
  { range: 220, atk: 32, ammo: 14 },
  { range: 230, atk: 38, ammo: 16 },
  { range: 240, atk: 44, ammo: 18 },
  { range: 250, atk: 50, ammo: 20 },
  { range: 260, atk: 56, ammo: 22 },
  { range: 270, atk: 60, ammo: 24 },
  { range: 275, atk: 64, ammo: 26 },
  { range: 280, atk: 68, ammo: 28 },
];
export const ARCHER_LEVEL_MAX = 10;

export function archerCombatLevel(hasArcher, levelRank) {
  if (!hasArcher) return 0;
  const r = Math.max(0, Math.floor(Number(levelRank) || 0));
  return Math.max(1, Math.min(ARCHER_LEVEL_MAX, 1 + r));
}

export function archerStatsForLevel(level) {
  const lv = Math.max(1, Math.min(ARCHER_LEVEL_MAX, Math.floor(Number(level) || 1)));
  if (lv === 1) {
    return {
      range: PROGRESSION.archerBaseRange,
      atk: PROGRESSION.archerBaseAtk,
      ammo: PROGRESSION.archerBaseAmmo,
    };
  }
  return ARCHER_LEVELS[lv] || ARCHER_LEVELS[1];
}

/** 0=지금(Lv1–3), 1=상위1(4–6), 2=상위2(7–9), 3=최종(10). */
export function archerLookForLevel(level) {
  const lv = Math.max(0, Math.floor(Number(level) || 0));
  if (lv >= 10) return 3;
  if (lv >= 7) return 2;
  if (lv >= 4) return 1;
  return 0;
}

export function archerCapForCols(cols) {
  const c = Math.max(BASE_SLOT_COLS, Math.min(MAX_SLOT_COLS, Math.floor(Number(cols) || BASE_SLOT_COLS)));
  return c;
}

export const SKILL_TREES = [
  { id: 'combat', name: '전투' },
  { id: 'frontline', name: '전열' },
  { id: 'merge', name: '머지' },
  { id: 'economy', name: '경제' },
  { id: 'wall', name: '방어벽' },
  { id: 'archer', name: '궁수' },
];

/** 영지 10구역. 성벽은 외곽 링, 위성 공터 2 + 마을 + 중앙 영주 성. */
export const DISTRICTS = [
  { id: 'barracks', zone: 1, name: '공병대', kind: 'military', skills: ['launchCd', 'advance', 'regen'] },
  { id: 'tactics', zone: 2, name: '전술소', kind: 'military', skills: ['stopping', 'boardWidth'] },
  { id: 'infantry', zone: 3, name: '병영', kind: 'military', skills: ['eliteRecruit', 'mergeShock', 'tierLock'] },
  { id: 'market', zone: 4, name: '시장', kind: 'economy', skills: ['startGold', 'taxRate'] },
  { id: 'guild', zone: 5, name: '용병길드', kind: 'economy', skills: ['mercenary', 'bountyGold'] },
  { id: 'vacant3', zone: 6, name: '공터', kind: 'vacant', skills: [] },
  { id: 'range', zone: 7, name: '궁수훈련소', kind: 'defense', skills: ['archer', 'archerCount', 'archerLevel'] },
  { id: 'vacant1', zone: 8, name: '공터', kind: 'vacant', skills: [] },
  { id: 'village', zone: 9, name: '마을', kind: 'village', skills: [] },
  { id: 'keep', zone: 10, name: '영주 성', kind: 'keep', skills: [] },
  { id: 'walls', zone: 0, name: '성벽', kind: 'wallring', skills: ['wall', 'wallHp', 'wallKb'] },
];

export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

// cost = 랭크당 포인트. maxRank 1 은 온/오프 해금.
// requires: 선행 스킬 id (해당 랭크 ≥ 1).
// rankLevelStep: 랭크마다 필요한 플레이어 레벨 증가 (기본 1).
//   랭크 N 해금 레벨 = unlockLevel + (N - 1) * rankLevelStep
export const SKILLS = [
  {
    id: 'launchCd',
    name: '발사 쿨감',
    tree: 'combat',
    maxRank: 5,
    cost: 1,
    unlockLevel: 1,
    rankLevelStep: 2,
    requires: null,
    perRank: 0.32, // 초 감소. 기본 1.75 → R5는 하한에 근접
  },
  {
    id: 'advance',
    name: '진격 속도',
    tree: 'combat',
    maxRank: 5,
    cost: 1,
    unlockLevel: 1,
    requires: null,
    perRank: 0.80, // 미사용(이동은 BALANCE.advanceSpeedByRank). 스킬 설명은 테이블에서 생성
  },
  {
    id: 'regen',
    name: '재생',
    tree: 'combat',
    maxRank: 5,
    cost: 1,
    unlockLevel: 1,
    requires: null,
    perRank: 0.004, // 최대 HP의 %/초 (전투·전열에서만)
  },
  {
    id: 'stopping',
    name: '저지력 증가',
    tree: 'frontline',
    maxRank: 5,
    cost: 1,
    unlockLevel: 1,
    requires: null,
    perRank: 0.08, // +8%/랭크
  },
  {
    id: 'boardWidth',
    name: '전장 확장',
    desc: '전장 슬롯을 넓혀 병력 배치 공간과 사격 통로를 확보합니다. (기본 3칸 → 1랭크 5칸 → 2랭크 7칸)',
    tree: 'frontline',
    maxRank: 2,
    cost: 1,
    unlockLevel: 5,
    rankLevelStep: 2,
    requires: null,
  },
  {
    id: 'eliteRecruit',
    name: '정예신병',
    desc: '발사 유닛 T2~T5 확률. 2랭크마다 상위 티어 해금. 최대에서 T5 약 5%.',
    tree: 'merge',
    maxRank: 10,
    cost: 1,
    unlockLevel: 1,
    rankLevelStep: 1,
    requires: null,
  },
  {
    id: 'mergeShock',
    name: '머지 충격',
    tree: 'merge',
    maxRank: 5,
    cost: 1,
    unlockLevel: 3,
    requires: null,
    dmgPerRank: 18,
    radiusBase: 30,
    radiusPerRank: 6,
    minResultTier: 6, // T6+ 합성 결과에만 충격. T5 이하는 피해·라인 넉백 없음.
    knockbackChance: 0.05, // 합성마다 라인 넉백. 피해·힐은 항상(T6+).
    knockbackPerRank: 6,
    healPctPerRank: 0.04,
  },
  {
    id: 'tierLock',
    name: '티어 잠금',
    desc: '유닛을 눌러 합성을 막습니다. 등급에 자물쇠. 최대 5기.',
    tree: 'merge',
    maxRank: 5,
    cost: 1,
    unlockLevel: 3,
    requires: null,
    perRank: 1,
  },
  {
    id: 'wall',
    name: '방어벽 설치',
    tree: 'wall',
    maxRank: 1,
    cost: 1,
    unlockLevel: 3,
    requires: null,
  },
  {
    id: 'wallHp',
    name: '방어벽 강화',
    tree: 'wall',
    maxRank: 5,
    cost: 1,
    unlockLevel: 5,
    requires: 'wall',
    hpPerRank: 2,
  },
  {
    id: 'wallKb',
    name: '밀치기 거리',
    tree: 'wall',
    maxRank: 5,
    cost: 1,
    unlockLevel: 5,
    rankLevelStep: 2,
    requires: 'wall',
    kbPerRank: 22,
  },
  {
    id: 'archer',
    name: '궁수 해금',
    tree: 'archer',
    maxRank: 1,
    cost: 1,
    unlockLevel: 8,
    requires: 'wall',
  },
  {
    id: 'archerCount',
    name: '궁수 수',
    tree: 'archer',
    maxRank: 6, // 해금 1 + 랭크. 실효 상한은 전장 칸(3/5/7) − 1
    cost: 1,
    unlockLevel: 8,
    requires: 'archer',
    extraPerRank: 1,
  },
  {
    id: 'archerLevel',
    name: '궁수 레벨',
    desc: '해금 시 레벨 1. 랭크당 +1, 최대 10. 사거리·공격·탄약이 같이 오르고 4/7/10에서 모습이 바뀝니다.',
    tree: 'archer',
    maxRank: 9,
    cost: 1,
    unlockLevel: 8,
    requires: 'archer',
  },
  {
    id: 'startGold',
    name: '초기 자금',
    desc: '게임 시작 시 골드를 추가로 지급합니다.',
    tree: 'economy',
    maxRank: 10,
    cost: 1,
    unlockLevel: 1,
    requires: null,
    perRank: 50,
  },
  {
    id: 'taxRate',
    name: '세금 징수',
    desc: '초당 골드를 자동으로 획득합니다.',
    tree: 'economy',
    maxRank: 10,
    cost: 1,
    unlockLevel: 2,
    requires: null,
    perRank: 1.5,
  },
  {
    id: 'bountyGold',
    name: '바운티 헌터',
    desc: '적 처치 시 획득 골드가 늘어납니다.',
    tree: 'economy',
    maxRank: 10,
    cost: 1,
    unlockLevel: 3,
    requires: null,
    perRank: 0.10,
  },
  {
    id: 'mercenary',
    name: '용병술',
    desc: '하단 티어표에서 구매할 수 있는 최대 티어를 해금합니다. 기본 T2, 만랭 T9.',
    tree: 'economy',
    maxRank: 7,
    cost: 1,
    unlockLevel: 4,
    requires: null,
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/** 진군 랭크(0=스킬 없음 … 5)의 절대 전진 속도 px/초. 테이블 없으면 unitAdvanceSpeed. */
export function advanceSpeedForRank(rank) {
  const table = BALANCE.advanceSpeedByRank;
  const max = Array.isArray(table) && table.length > 0 ? table.length - 1 : 5;
  const r = Math.max(0, Math.min(max, Math.floor(Number(rank) || 0)));
  const v = Array.isArray(table) ? table[r] : undefined;
  if (Number.isFinite(v)) return v;
  return Number.isFinite(BALANCE.unitAdvanceSpeed) ? BALANCE.unitAdvanceSpeed : 28;
}

/** 랭크 N(1부터)을 사려면 필요한 플레이어 레벨. rankLevelStep 기본 1. */
export function rankUnlockLevel(skill, rank) {
  const step = Number.isFinite(skill.rankLevelStep) ? skill.rankLevelStep : 1;
  return skill.unlockLevel + (rank - 1) * step;
}

export const META_STORAGE_KEY = 'md.knightslide.meta.v1';
export const BRANDING_STORAGE_KEY = 'md.knightslide.branding.v1';
export const CHEATS_STORAGE_KEY = 'md.knightslide.cheats.v1';
export const AUTO_FIRE_STORAGE_KEY = 'md.knightslide.autofire.v1';
export const PLAYED_STORAGE_KEY = 'md.knightslide.hasPlayed.v1';
export const TUTORIAL_STORAGE_KEY = 'md.knightslide.tutorial.v1';
export const AUTO_UNLOCK_STORAGE_KEY = 'md.knightslide.autoUnlock.v1';
export const AUDIO_STORAGE_KEY = 'md.knightslide.audio.v1';

/** Start overlay / document.title. Admin 패널에서 수정, localStorage에 유지. */
export const BRANDING = {
  title: '⚔ KnightSlide',
  subtitle: '프로토타입 v0.0.5',
};
