// 다수 유닛 발사 시나리오: 충돌/군집 상황에서 전진 정지가 발생하는지 관찰
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
let launchTimer = 0;
const lanes = [80, 150, 225, 300, 370];
let lane = 0;

for (let i = 1; i <= 40 * 60; i++) {
  launchTimer -= dt;
  if (launchTimer <= 0 && game.launchCd <= 0) {
    game.aimX = lanes[lane++ % lanes.length];
    game._launchUnit();
    launchTimer = 0.8;
  }
  game._update(dt);
  if (game.state !== 'playing') {
    console.log(`게임오버 at t=${(i / 60).toFixed(1)}s lineY=${game.lineY.toFixed(1)}`);
    break;
  }
  if (i % 300 === 0) {
    const ys = game.units.map((u) => u.body.position.y.toFixed(0)).join(',');
    const settled = game.units.filter((u) => u.settled).length;
    const advancing = game.units.filter((u) => u.body.velocity.y < -0.05).length;
    console.log(
      `t=${(i / 60).toFixed(0)}s lineY=${game.lineY.toFixed(0)} 적=${game.enemies.length} ` +
      `유닛=${game.units.length}(정착 ${settled}, 전진중 ${advancing}) y=[${ys}]`
    );
  }
}
