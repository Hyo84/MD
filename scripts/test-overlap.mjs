// 적 스폰 겹침 검증: 보스 + 다수 스폰 후 서로 겹치는 쌍이 없어야 함
global.requestAnimationFrame = () => {};

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

const { Game } = await import('../src/game.js');
const { MONSTERS } = await import('../src/config.js');

const game = new Game(canvas, ui);
game.state = 'playing';

const checkOverlaps = (label) => {
  let bad = 0;
  for (let i = 0; i < game.enemies.length; i++) {
    for (let j = i + 1; j < game.enemies.length; j++) {
      const a = game.enemies[i], b = game.enemies[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const min = MONSTERS[a.key].r + MONSTERS[b.key].r;
      if (d < min - 0.5) {
        bad++;
        console.log(`  겹침! ${a.key}(r${MONSTERS[a.key].r}) - ${b.key}(r${MONSTERS[b.key].r}) 거리=${d.toFixed(1)} 최소=${min}`);
      }
    }
  }
  console.log(`${label}: 적 ${game.enemies.length}개, 겹침 ${bad}쌍`);
  return bad;
};

let total = 0;

// 시나리오 1: 일반 적을 먼저 채운 뒤 보스 스폰 (기존 적 밀어내기 검증)
for (let i = 0; i < 10; i++) game._spawnEnemy(i % 3 === 0 ? 'troll' : 'goblin');
total += checkOverlaps('보스 전 (일반 10)');
game._spawnEnemy('boss');
total += checkOverlaps('보스 스폰 직후');

// 시나리오 2: 보스가 있는 상태에서 계속 스폰
for (let i = 0; i < 20; i++) game._spawnEnemy(['goblin', 'orc', 'skeleton', 'troll'][i % 4]);
total += checkOverlaps('보스 + 추가 20 스폰');

// 시나리오 3: 라인이 내려간 상태에서도 확인
game.lineY = 400;
for (const m of game.enemies) m.y = game.lineY - m.row * 46;
for (let i = 0; i < 10; i++) game._spawnEnemy('troll');
total += checkOverlaps('라인 400 + 트롤 10');

console.log(total === 0 ? '\n통과: 겹침 없음' : `\n실패: 총 ${total}쌍 겹침`);
process.exit(total === 0 ? 0 : 1);
