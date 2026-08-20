// 게임 설정 및 스탯 테이블

export const CANVAS_W = 450;
export const CANVAS_H = 800;
export const DEFEAT_Y = 660;
export const LAUNCHER = { x: 225, y: 700 };
export const SPAWN_Y = 60;

// 아군 유닛 (T1 ~ T10)
export const UNITS = [
  { tier: 1,  name: '민병대',       color: '#D2B48C', r: 16, hp: 50,    atk: 5,    mass: 1.0 },
  { tier: 2,  name: '신병',         color: '#C2A679', r: 18, hp: 110,   atk: 12,   mass: 1.3 },
  { tier: 3,  name: '경보병',       color: '#CD7F32', r: 20, hp: 240,   atk: 25,   mass: 1.7 },
  { tier: 4,  name: '중보병',       color: '#708090', r: 22, hp: 500,   atk: 55,   mass: 2.2 },
  { tier: 5,  name: '기사단원',     color: '#4682B4', r: 24, hp: 1050,  atk: 120,  mass: 2.8 },
  { tier: 6,  name: '근위대장',     color: '#4169E1', r: 26, hp: 2200,  atk: 250,  mass: 3.5 },
  { tier: 7,  name: '성기사',       color: '#FFD700', r: 28, hp: 4600,  atk: 520,  mass: 4.3 },
  { tier: 8,  name: '드래곤가디언', color: '#8B0000', r: 30, hp: 9500,  atk: 1100, mass: 5.3 },
  { tier: 9,  name: '대원수',       color: '#4B0082', r: 33, hp: 19000, atk: 2300, mass: 6.5 },
  { tier: 10, name: '영웅',         color: '#FF4500', r: 38, hp: 50000, atk: 6500, mass: 10.0 },
];

export const HEROES = {
  arthur:   { name: '아서',   desc: '3초마다 전선을 가르는 검기' },
  jeanne:   { name: '잔느',   desc: '주변 아군 공격력 +50% 오라' },
  valkyrie: { name: '발키리', desc: '적을 끌어당겨 회전 베기' },
};

export const HERO_LIFESPAN = 15; // 초

// 몬스터
export const MONSTERS = {
  goblin:   { name: '고블린',     icon: '고', color: '#3CB371', outline: '#1e5c38', r: 15, hp: 40,    atk: 4,   mass: 0.8,  speed: 1.7, score: 10 },
  orc:      { name: '오크',       icon: '오', color: '#6B8E23', outline: '#39510f', r: 20, hp: 180,   atk: 18,  mass: 1.8,  speed: 1.0, score: 25 },
  skeleton: { name: '스켈레톤',   icon: '스', color: '#DCDCDC', outline: '#6e6e6e', r: 18, hp: 120,   atk: 14,  mass: 1.5,  speed: 1.1, score: 20, kbResist: true },
  troll:    { name: '동굴 트롤',  icon: '트', color: '#556B2F', outline: '#2c3a14', r: 28, hp: 1200,  atk: 80,  mass: 4.0,  speed: 0.55, score: 100, regen: 12 },
  boss:     { name: '오크 워로드', icon: '보', color: '#B22222', outline: '#5c0e0e', r: 45, hp: 12000, atk: 350, mass: 12.0, speed: 2.2, score: 500, isBoss: true },
};

export const ATTACK_COOLDOWN = 0.8;      // 접촉 공격 쿨다운(초)
export const LAUNCH_COOLDOWN = 0.6;      // 발사 쿨다운(초)
export const FRICTION_AIR_UNIT = 0.03;
export const FRICTION_AIR_MONSTER = 0.02;
export const MAX_LAUNCH_SPEED = 20;
export const LAUNCH_POWER = 0.13;        // 드래그 거리 → 속도 계수

export function killsNeeded(wave) {
  return 10 + wave * 3;
}
