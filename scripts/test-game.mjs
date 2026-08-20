// 실제 Game 클래스를 헤드리스로 구동하여 유닛 전진을 관찰
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

const game = new Game(canvas, ui);
game.state = 'playing';

const dt = 1 / 60;
const log = (t) => {
  const us = game.units.map((u) =>
    `T${u.tier} y=${u.body.position.y.toFixed(1)} vy=${u.body.velocity.y.toFixed(3)} settled=${u.settled}`
  ).join(' | ');
  console.log(`t=${t.toFixed(1)}s lineY=${game.lineY.toFixed(1)} enemies=${game.enemies.length} :: ${us || '(유닛 없음)'}`);
};

// 시나리오: 시작 직후 유닛 1개 발사, 15초 관찰
game.aimX = 100;
game._launchUnit();

for (let i = 1; i <= 15 * 60; i++) {
  game._update(dt);
  if (i % 120 === 0) log(i / 60);
}
