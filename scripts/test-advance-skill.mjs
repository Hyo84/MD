// Headless audit: advance skill R0 vs R5, plus launch-coast settle.
global.requestAnimationFrame = () => {};
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

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
const { meta } = await import('../src/meta.js');
const { BALANCE, LAUNCHER_Y, LINE_START_Y } = await import('../src/config.js');

function freezeField(game) {
  game.state = 'playing';
  game.spawnTimer = 1e9;
  game._updateSpawning = () => {};
  game.lineY = LINE_START_Y;
}

function setAdvanceRank(game, rank) {
  meta.data.ranks.advance = rank;
  game._fx = meta.getEffects();
}

function runSettled(rank, seconds = 2) {
  const game = new Game(canvas, ui);
  freezeField(game);
  setAdvanceRank(game, rank);
  const u = game._spawnUnit(1, 225, 600);
  u.settled = true;
  const y0 = u.body.position.y;
  const dt = 1 / 60;
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    game.lineY = LINE_START_Y;
    game._update(dt);
  }
  const y1 = u.body.position.y;
  const dy = y0 - y1;
  return {
    rank,
    advanceMult: game._effects().advanceMult,
    y0, y1, dy,
    pxPerSec: dy / seconds,
    expected: BALANCE.unitAdvanceSpeed * game._effects().advanceMult,
    settled: u.settled,
    lineY: game.lineY,
  };
}

function runLaunch(rank, seconds = 4) {
  const game = new Game(canvas, ui);
  freezeField(game);
  setAdvanceRank(game, rank);
  game.currentTier = 1;
  game.aimX = 225;
  game._launchUnit();
  const u = game.units[0];
  const y0 = u.body.position.y;
  const dt = 1 / 60;
  const frames = Math.round(seconds * 60);
  let settledAt = null;
  let settledY = null;
  const samples = [];
  for (let i = 1; i <= frames; i++) {
    game.lineY = LINE_START_Y;
    game._update(dt);
    const t = i / 60;
    if (settledAt == null && u.settled) {
      settledAt = t;
      settledY = u.body.position.y;
    }
    if (i === 12 || i === 24 || i === 36 || i % 60 === 0) {
      samples.push({
        t,
        y: u.body.position.y,
        speed: u.body.speed,
        vy: u.body.velocity.y,
        settled: u.settled,
      });
    }
  }
  return {
    rank,
    launchSpeed: BALANCE.launchSpeed,
    y0,
    yEnd: u.body.position.y,
    settledAt,
    settledY,
    holdY: LINE_START_Y + 20 + u.r,
    coastPx: settledY != null ? y0 - settledY : null,
    samples,
  };
}

console.log('config', {
  unitAdvanceSpeed: BALANCE.unitAdvanceSpeed,
  launchSpeed: BALANCE.launchSpeed,
  perRank: 0.8,
  LAUNCHER_Y,
  LINE_START_Y,
});

console.log('\n=== SETTLED T1 y=600, lineY=90, 2s ===');
const r0 = runSettled(0);
const r5 = runSettled(5);
console.log('R0', r0);
console.log('R5', r5);
console.log('delta-y R0 vs R5', r0.dy.toFixed(2), r5.dy.toFixed(2), 'ratio', (r5.dy / r0.dy).toFixed(3));

console.log('\n=== LAUNCH from launcher, 4s ===');
const l0 = runLaunch(0);
const l5 = runLaunch(5);
console.log('R0 launch', { ...l0, samples: l0.samples });
console.log('R5 launch', { ...l5, samples: l5.samples });
const walk0 = l0.settledY != null ? l0.settledY - l0.holdY : null;
const walk5 = l5.settledY != null ? l5.settledY - l5.holdY : null;
console.log('walk remaining after settle R0/R5', walk0, walk5);
