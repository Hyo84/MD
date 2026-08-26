// 게임 설정 및 스탯 테이블 (어드민 패널에서 실시간 수정 가능)

export const CANVAS_W = 450;
export const CANVAS_H = 800;
// 전장 슬롯: 기본 3칸, 전장 확장 스킬로 5 → 7칸. MAX 7칸은 extra inset 0(전체 캔버스).
export const BASE_SLOT_COLS = 3;
export const MAX_SLOT_COLS = 7;
// extraInset = (MAX - cols) / 2 * SLOT_INSET_PER_COL → 7칸=0, 5칸=50, 3칸=100. 플레이어블 450 / 350 / 250.
export const SLOT_INSET_PER_COL = 50;
export const SLOT_EDGE_PAD = 40;      // 슬롯을 내면에서 한 칸 더 안쪽 (7칸일 때 기존 40)
export const DEFEAT_Y = 660;      // 마지노선
export const LINE_START_Y = 90;   // 웨이브라인 시작 위치(밀어낼 수 있는 상한)
export const ENEMY_SPAWN_Y = LINE_START_Y; // 적/보스 합류 시작 Y (라인이 여기면 즉시 착지)
export const LAUNCHER_Y = 700;

// 전역 밸런스 (어드민 패널에서 실시간 조정)
export const BALANCE = {
  baseLineSpeed: 6,     // 웨이브라인 기본 전진 속도 (px/초)
  spawnInterval: 2.3,   // 적 스폰 기본 간격 (초, 웨이브에 따라 감소)
  launchCooldown: 1.15, // 발사 쿨다운 (초, 스킬로 감소 · 최저 launchCdFloor)
  launchSpeed: 720,     // 발사 돌진 (px/초). 짧은 버스트 후 진군 테이블로 걸음
  unitAdvanceSpeed: 28, // 진군 테이블이 없을 때 폴백 (px/초)
  // 진군 절대 속도 (px/초). 인덱스 0 = 스킬 없음, 1–5 = 진격 랭크
  advanceSpeedByRank: [28, 34, 42, 52, 64, 80],
  enemyJoinSpeed: 80,   // 적이 밀린 웨이브라인 슬롯까지 내려오는 합류 속도 (px/초)
  bossGatherStrength: 0.6, // 보스 집결 강도 (0=안함, 0.7 초과 시 교전 중인 유닛도 집결, 1=최대)
  gatherSpeed: 40,      // 집결 시 최대 가로 이동 속도 (px/초)
  attackCooldown: 0.8,  // 공격 틱 간격 (초)
  enemyReach: 24,       // 적 근접 공격 사거리 보정 (px). 실제 거리 = 적.r + 24

  // 웨이브 난이도 곡선 (적 HP/ATK 배율, 스폰 시점에 적용)
  gentleRate: 0.10,     // 완만 구간: 웨이브당 +10% (웨이브 10 ≈ 1.9배)
  steepStartWave: 11,   // 가파른 구간 시작 웨이브
  steepFactor: 1.3,     // 가파른 구간: 웨이브당 ×1.3 누적

  // 적 없는 라인: 전열 아군 저지력으로 시작 위치까지 밀어올림
  emptyLinePushScale: 1,  // 저지력 배율 (1 = 교전 저지력과 동일)
  emptyLinePushSlack: 32, // 라인 홀드 위치에서 이 거리(px) 안이면 전열로 취급
};

// T2 발사 기본 확률 (_rollTier). 스킬 t2Bonus가 이 값에 가산.
export const LAUNCH_T2_BASE = 0.25;

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

// 웨이브별 적 스탯 배율: 1~(steepStart-1) 완만 선형, 이후 가파른 지수 증가
export function waveMultiplier(wave) {
  const gentleWaves = Math.min(wave, BALANCE.steepStartWave - 1);
  let mult = 1 + (gentleWaves - 1) * BALANCE.gentleRate;
  if (wave >= BALANCE.steepStartWave) {
    mult *= Math.pow(BALANCE.steepFactor, wave - BALANCE.steepStartWave + 1);
  }
  return mult;
}

// 실효 배율 = 웨이브 곡선 × 실시간 수동 배율
export function effectiveMult(wave, liveMult = 1) {
  return waveMultiplier(wave) * liveMult;
}

// 아군 유닛 (T1 ~ T10)
// stop = 저지력(교전 중 라인 속도 감소, 적 없을 때 전열 푸시 속도 px/초), range = 공격 사거리(px)
// r = 물리/충돌 반경. drawR = 스프라이트·HP바·등급 숫자용 시각 반경 (전투 스탯과 무관)
export const UNITS = [
  { tier: 1,  name: '민병대',       color: '#D2B48C', r: 16, drawR: 11, hp: 50,    atk: 5,    mass: 1.0,  stop: 4,  range: 36 },
  { tier: 2,  name: '신병',         color: '#C2A679', r: 18, drawR: 13, hp: 110,   atk: 12,   mass: 1.3,  stop: 6,  range: 42 },
  { tier: 3,  name: '경보병',       color: '#CD7F32', r: 20, drawR: 15, hp: 240,   atk: 25,   mass: 1.7,  stop: 9,  range: 50 },
  { tier: 4,  name: '중보병',       color: '#708090', r: 22, drawR: 17, hp: 500,   atk: 55,   mass: 2.2,  stop: 13, range: 58 },
  { tier: 5,  name: '기사단원',     color: '#4682B4', r: 24, drawR: 19, hp: 1050,  atk: 120,  mass: 2.8,  stop: 18, range: 70,
    special: { cleaveRadius: 56, cleaveMult: 0.5 } },
  { tier: 6,  name: '근위대장',     color: '#4169E1', r: 26, drawR: 27, hp: 2200,  atk: 250,  mass: 3.5,  stop: 24, range: 82,
    special: { stunChance: 0.10, stunDuration: 0.5 } },
  { tier: 7,  name: '성기사',       color: '#FFD700', r: 28, drawR: 28, hp: 4600,  atk: 520,  mass: 4.3,  stop: 32, range: 96,
    special: { healPeriod: 2, healRadius: 110, healPct: 0.04 } },
  { tier: 8,  name: '드래곤가디언', color: '#8B0000', r: 30, drawR: 29, hp: 9500,  atk: 1100, mass: 5.3,  stop: 42, range: 112,
    special: { burnAtkFrac: 0.20, burnDuration: 3 } },
  { tier: 9,  name: '대원수',       color: '#4B0082', r: 33, drawR: 30, hp: 19000, atk: 2300, mass: 6.5,  stop: 55, range: 128,
    special: { shockPeriod: 4, shockAtkFrac: 0.3 } },
  { tier: 10, name: '영웅',         color: '#FF4500', r: 38, drawR: 33, hp: 50000, atk: 6500, mass: 10.0, stop: 90, range: 168 },
];

export const HEROES = {
  arthur:   { name: '아서',   desc: '3초마다 전체 검기', period: 3, atkFrac: 0.4 },
  jeanne:   { name: '잔느',   desc: '주변 아군 공격력 +50%', auraRadius: 140, damageBuff: 1.5 },
  valkyrie: { name: '발키리', desc: '사거리 내 회전 베기', tick: 0.3, atkFrac: 0.12 },
};

// T10 사명: 피해 쿼터를 채우면 명예로운 승천. HP로 죽으면 승천 없음.
export const HERO_MISSION_DAMAGE = 80000; // 기본 게이지 (이 영웅 바디가 적에게 가한 피해)
export const HERO_MISSION_KILLS = 25;     // 미사용 대안 쿼터 (킬 모드 스위치 없음)
export const HERO_ASCENSION_ATK_MULT = 1.5;
export const HERO_ASCENSION_SLOWMO = 0.3; // 초 (실시간 슬로모·플래시)
export const HERO_ASCENSION_REPLACEMENT_TIER = 5;
export const HERO_ASCENSION_BONUS_SCORE = 400;

// 적 (웨이브라인에 부착되는 개체)
// speed = 라인 전진 가속 기여 (px/초, 0이면 라인을 밀지 않음)
export const MONSTERS = {
  goblin:   { name: '고블린',     icon: '고', grade: '1', color: '#3CB371', outline: '#1e5c38', r: 15, hp: 40,    atk: 4,   speed: 3,  score: 10 },
  orc:      { name: '오크',       icon: '오', grade: '2', color: '#6B8E23', outline: '#39510f', r: 20, hp: 180,   atk: 18,  speed: 1.5, score: 25 },
  skeleton: { name: '스켈레톤',   icon: '스', grade: '3', color: '#DCDCDC', outline: '#6e6e6e', r: 18, hp: 120,   atk: 14,  speed: 0,  score: 20 },
  troll:    { name: '동굴 트롤',  icon: '트', grade: '4', color: '#556B2F', outline: '#2c3a14', r: 28, hp: 1200,  atk: 80,  speed: 1,  score: 100, regen: 12 },
  boss:     { name: '오크 워로드', icon: '보', grade: '보', color: '#B22222', outline: '#5c0e0e', r: 45, hp: 2300,  atk: 85,  speed: 38, score: 500, isBoss: true },
};

export const FRICTION_AIR_UNIT = 0.03;

export function killsNeeded(wave) {
  return 10 + wave * 3;
}

// ---------- 메타 진행 (XP / 레벨 / 스킬) ----------
// XP = 기존 점수 + 보스 처치 보너스(bossXpPerWave * 클리어한 웨이브).
// 쓰레기 처치보다 웨이브 클리어/보스 킬이 유리하도록 보너스를 크게 둠.
//
// 레벨 곡선 목표:
//   Lv2 ≈ 1웨이브 보스 직후, Lv5 ≈ 웨이브 5–7 무난한 런, Lv10은 장기 목표.
// xpToNext[i] = 레벨 i → i+1 에 필요한 XP (1-indexed).
export const PROGRESSION = {
  bossXpPerWave: 200,     // 보스 처치 시 추가 XP = 이 값 × 클리어한 웨이브
  launchCdFloor: 0.25,    // 발사 쿨다운 하드 하한 (초)
  regenNearSlack: 48,     // 전열로 간주해 재생이 켜지는 추가 여유 (px)

  // 방어벽: 라인이 마지노선에 닿으면 즉시 게임오버 대신 1회 충격.
  // 충격 시 벽 HP −wallDmgPerHit, 라인을 wallKnockback px 위로 밀어냄 (LINE_START_Y 미만 불가).
  // 그 충격으로 HP가 0이 되면 벽은 파괴되고 밀치기는 적용됨. 다음 접촉은 게임오버.
  wallBaseHp: 3,
  wallDmgPerHit: 1,
  wallBaseKnockback: 70,  // px

  // 궁수: 벽 위에 서서 사거리 안의 웨이브라인 적을 사격. 웨이브 솔로 불가.
  // 탄약은 웨이브당 지급, 보스 처치(웨이브 증가) 및 런 시작 시 재충전. 소진 시 다음 웨이브까지 정지.
  archerMax: 3,
  archerBaseRange: 160,
  archerBaseAtk: 7,
  archerBaseAmmo: 10,
  archerInterval: 1.05,   // 초/발
};

// 인덱스 = 현재 레벨. 값 = 다음 레벨까지 XP. 테이블 이후는 last + extraPerLevel*(level-lastIndex)
export const XP_TO_NEXT = [
  0,
  800,    // 1→2
  1300,   // 2→3
  2000,   // 3→4
  2800,   // 4→5
  3800,   // 5→6
  5200,   // 6→7
  7000,   // 7→8
  9200,   // 8→9
  12000,  // 9→10
];
export const XP_AFTER_TABLE = 3000; // Lv10+ : 12000 + 3000*(level-9) 형태로 증가

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

export const SKILL_TREES = [
  { id: 'combat', name: '전투' },
  { id: 'frontline', name: '전열' },
  { id: 'merge', name: '머지' },
  { id: 'wall', name: '방어벽' },
  { id: 'archer', name: '궁수' },
];

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
    perRank: 0.16, // 초 감소
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
    id: 'higherTier',
    name: '상위 병사 확률',
    tree: 'merge',
    maxRank: 5,
    cost: 1,
    unlockLevel: 3,
    requires: null,
    t2PerRank: 0.03,
    t3StartRank: 3,
    t3PerRank: 0.02, // 랭크 3부터 (rank - 2) * 이 값
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
    knockbackPerRank: 6,
    healPctPerRank: 0.04,
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
    maxRank: 4, // 실제 수는 min(해금 1 + 랭크, PROGRESSION.archerMax)
    cost: 1,
    unlockLevel: 8,
    requires: 'archer',
    extraPerRank: 1,
  },
  {
    id: 'archerRange',
    name: '궁수 사거리',
    tree: 'archer',
    maxRank: 5,
    cost: 1,
    unlockLevel: 8,
    requires: 'archer',
    perRank: 36,
  },
  {
    id: 'archerAtk',
    name: '궁수 공격력',
    tree: 'archer',
    maxRank: 5,
    cost: 1,
    unlockLevel: 8,
    rankLevelStep: 2,
    requires: 'archer',
    perRank: 4,
  },
  {
    id: 'archerAmmo',
    name: '궁수 탄약',
    tree: 'archer',
    maxRank: 5,
    cost: 1,
    unlockLevel: 8,
    requires: 'archer',
    perRank: 4, // 웨이브당 발수
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
