// 게임 설정 및 스탯 테이블 (어드민 패널에서 실시간 수정 가능)

export const CANVAS_W = 450;
export const CANVAS_H = 800;
export const DEFEAT_Y = 660;      // 마지노선
export const LINE_START_Y = 90;   // 웨이브라인 시작 위치(밀어낼 수 있는 상한)
export const LAUNCHER_Y = 700;

// 전역 밸런스 (어드민 패널에서 실시간 조정)
export const BALANCE = {
  baseLineSpeed: 6,     // 웨이브라인 기본 전진 속도 (px/초)
  spawnInterval: 2.3,   // 적 스폰 기본 간격 (초, 웨이브에 따라 감소)
  launchCooldown: 0.6,  // 발사 쿨다운 (초)
  launchSpeed: 18,      // 발사 속도
  unitAdvanceSpeed: 30, // 착지 후 아군 전진 속도 (px/초)
  bossGatherStrength: 0.6, // 보스 집결 강도 (0=안함, 0.7 초과 시 교전 중인 유닛도 집결, 1=최대)
  gatherSpeed: 40,      // 집결 시 최대 가로 이동 속도 (px/초)
  attackCooldown: 0.8,  // 공격 틱 간격 (초)
  enemyReach: 50,       // 적 근접 공격 사거리 보정 (px)

  // 웨이브 난이도 곡선 (적 HP/ATK 배율, 스폰 시점에 적용)
  gentleRate: 0.10,     // 완만 구간: 웨이브당 +10% (웨이브 10 ≈ 1.9배)
  steepStartWave: 11,   // 가파른 구간 시작 웨이브
  steepFactor: 1.3,     // 가파른 구간: 웨이브당 ×1.3 누적
};

// 웨이브별 적 스탯 배율: 1~(steepStart-1) 완만 선형, 이후 가파른 지수 증가
export function waveMultiplier(wave) {
  const gentleWaves = Math.min(wave, BALANCE.steepStartWave - 1);
  let mult = 1 + (gentleWaves - 1) * BALANCE.gentleRate;
  if (wave >= BALANCE.steepStartWave) {
    mult *= Math.pow(BALANCE.steepFactor, wave - BALANCE.steepStartWave + 1);
  }
  return mult;
}

// 아군 유닛 (T1 ~ T10)
// stop = 저지력(교전 중 라인 속도 감소량 px/초), range = 공격 사거리(px)
export const UNITS = [
  { tier: 1,  name: '민병대',       color: '#D2B48C', r: 16, hp: 50,    atk: 5,    mass: 1.0,  stop: 4,  range: 40 },
  { tier: 2,  name: '신병',         color: '#C2A679', r: 18, hp: 110,   atk: 12,   mass: 1.3,  stop: 6,  range: 50 },
  { tier: 3,  name: '경보병',       color: '#CD7F32', r: 20, hp: 240,   atk: 25,   mass: 1.7,  stop: 9,  range: 62 },
  { tier: 4,  name: '중보병',       color: '#708090', r: 22, hp: 500,   atk: 55,   mass: 2.2,  stop: 13, range: 75 },
  { tier: 5,  name: '기사단원',     color: '#4682B4', r: 24, hp: 1050,  atk: 120,  mass: 2.8,  stop: 18, range: 90 },
  { tier: 6,  name: '근위대장',     color: '#4169E1', r: 26, hp: 2200,  atk: 250,  mass: 3.5,  stop: 24, range: 108 },
  { tier: 7,  name: '성기사',       color: '#FFD700', r: 28, hp: 4600,  atk: 520,  mass: 4.3,  stop: 32, range: 128 },
  { tier: 8,  name: '드래곤가디언', color: '#8B0000', r: 30, hp: 9500,  atk: 1100, mass: 5.3,  stop: 42, range: 150 },
  { tier: 9,  name: '대원수',       color: '#4B0082', r: 33, hp: 19000, atk: 2300, mass: 6.5,  stop: 55, range: 180 },
  { tier: 10, name: '영웅',         color: '#FF4500', r: 38, hp: 50000, atk: 6500, mass: 10.0, stop: 90, range: 225 },
];

export const HEROES = {
  arthur:   { name: '아서',   desc: '3초마다 전체 검기' },
  jeanne:   { name: '잔느',   desc: '주변 아군 공격력 +50%' },
  valkyrie: { name: '발키리', desc: '사거리 내 회전 베기' },
};

export const HERO_LIFESPAN = 15; // 초

// 적 (웨이브라인에 부착되는 개체)
// speed = 라인 전진 가속 기여 (px/초, 0이면 라인을 밀지 않음)
export const MONSTERS = {
  goblin:   { name: '고블린',     icon: '고', color: '#3CB371', outline: '#1e5c38', r: 15, hp: 40,    atk: 4,   speed: 3,  score: 10 },
  orc:      { name: '오크',       icon: '오', color: '#6B8E23', outline: '#39510f', r: 20, hp: 180,   atk: 18,  speed: 1.5, score: 25 },
  skeleton: { name: '스켈레톤',   icon: '스', color: '#DCDCDC', outline: '#6e6e6e', r: 18, hp: 120,   atk: 14,  speed: 0,  score: 20 },
  troll:    { name: '동굴 트롤',  icon: '트', color: '#556B2F', outline: '#2c3a14', r: 28, hp: 1200,  atk: 80,  speed: 1,  score: 100, regen: 12 },
  boss:     { name: '오크 워로드', icon: '보', color: '#B22222', outline: '#5c0e0e', r: 45, hp: 2300,  atk: 85,  speed: 38, score: 500, isBoss: true },
};

export const FRICTION_AIR_UNIT = 0.03;

export function killsNeeded(wave) {
  return 10 + wave * 3;
}
