// 머지 시 아군이 사라지는지 헤드리스로 검증
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
const { CANVAS_W, CANVAS_H, UNITS } = await import('../src/config.js');

function snapshot(game) {
  return game.units.map((u) => {
    const { x, y } = u.body.position;
    const onCanvas = x >= -u.r && x <= CANVAS_W + u.r && y >= -u.r && y <= CANVAS_H + u.r;
    return {
      tier: u.tier,
      x: +x.toFixed(1),
      y: +y.toFixed(1),
      dead: u.dead,
      merging: u.isMerging,
      onCanvas,
    };
  });
}

function summary(units) {
  const tiers = units.map((u) => `T${u.tier}`).sort().join('+') || '(none)';
  const off = units.filter((u) => !u.onCanvas).length;
  const stuck = units.filter((u) => u.merging && !u.dead).length;
  return { count: units.length, tiers, off, stuck };
}

function setupGame() {
  const game = new Game(canvas, ui);
  game.state = 'playing';
  game.spawnTimer = 1e9;
  game.enemies.length = 0;
  game.kills = 0;
  return game;
}

function step(game, n = 12) {
  const dt = 1 / 60;
  for (let i = 0; i < n; i++) game._update(dt);
}

let failed = 0;
const results = [];

function check(name, cond, detail) {
  const ok = !!cond;
  if (!ok) failed++;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

// --- 시나리오 1: T1 두 개가 겹치면 T2 하나 (net -1) ---
{
  const game = setupGame();
  const cx = 225, cy = 420;
  game._spawnUnit(1, cx - 8, cy);
  game._spawnUnit(1, cx + 8, cy);
  const before = game.units.length;
  step(game, 20);
  const after = snapshot(game);
  const s = summary(after);
  check(
    'two T1 → one T2 (net -1)',
    before === 2 && s.count === 1 && after[0]?.tier === 2 && s.off === 0 && s.stuck === 0,
    `before=${before} after=${s.count} ${s.tiers} off=${s.off} stuck=${s.stuck} pos=${JSON.stringify(after)}`,
  );
}

// --- 시나리오 2: T1 세 개가 한 더미 → T2+T1 또는 T3, 절대 0 ---
{
  const game = setupGame();
  const cx = 225, cy = 420;
  game._spawnUnit(1, cx, cy);
  game._spawnUnit(1, cx + 10, cy);
  game._spawnUnit(1, cx + 5, cy + 8);
  const before = game.units.length;
  step(game, 30);
  const after = snapshot(game);
  const s = summary(after);
  const tiers = after.map((u) => u.tier).sort((a, b) => a - b);
  const valid =
    (s.count === 2 && tiers[0] === 1 && tiers[1] === 2) ||
    (s.count === 1 && tiers[0] === 3);
  check(
    'three T1 pile → T2+T1 or T3, never 0',
    before === 3 && valid && s.count >= 1 && s.off === 0 && s.stuck === 0,
    `before=${before} after=${s.count} ${s.tiers} off=${s.off} stuck=${s.stuck} pos=${JSON.stringify(after)}`,
  );
}

// --- 시나리오 3: 머지 옆 방관자 — 캔버스 안에 남아야 함 ---
{
  const game = setupGame();
  const cx = 225, cy = 420;
  game._spawnUnit(1, cx - 8, cy);
  game._spawnUnit(1, cx + 8, cy);
  const bystander = game._spawnUnit(2, cx + 40, cy);
  const before = game.units.length;
  step(game, 20);
  const after = snapshot(game);
  const s = summary(after);
  const bystanderAlive = game.units.includes(bystander) && !bystander.dead;
  const bx = bystander.body?.position?.x ?? NaN;
  const by = bystander.body?.position?.y ?? NaN;
  check(
    'bystander survives merge blast on-canvas',
    before === 3 && bystanderAlive && s.off === 0 && s.count === 2 && s.stuck === 0,
    `before=${before} after=${s.count} ${s.tiers} off=${s.off} bystanderAlive=${bystanderAlive} bystander=(${bx.toFixed?.(1)},${by.toFixed?.(1)}) all=${JSON.stringify(after)}`,
  );
}

// --- 시나리오 4: T1 네 개 클러스터 — 유닛이 전멸하면 안 됨 ---
{
  const game = setupGame();
  const cx = 225, cy = 420;
  game._spawnUnit(1, cx - 10, cy);
  game._spawnUnit(1, cx + 10, cy);
  game._spawnUnit(1, cx, cy - 10);
  game._spawnUnit(1, cx, cy + 10);
  const before = game.units.length;
  step(game, 45);
  const after = snapshot(game);
  const s = summary(after);
  // 4 T1 → 최대 2 T2 or 1 T3+T1 or 1 T4. Net loss at most 3, never 0 units.
  check(
    'four T1 cluster never wipes',
    before === 4 && s.count >= 1 && s.off === 0 && s.stuck === 0,
    `before=${before} after=${s.count} ${s.tiers} off=${s.off} stuck=${s.stuck} pos=${JSON.stringify(after)}`,
  );
}

// --- 시나리오 5: 라인 근처 머지 — 합성 유닛이 라인 너머/오프스크린으로 사라지면 안 됨 ---
{
  const game = setupGame();
  game.lineY = 90;
  const r = UNITS[0].r;
  const cy = game.lineY + 14 + r + 6;
  game._spawnUnit(1, 220, cy);
  game._spawnUnit(1, 236, cy);
  step(game, 20);
  const after = snapshot(game);
  const s = summary(after);
  const minY = game.lineY + 14;
  const allBelowLine = after.every((u) => u.y >= minY - 1);
  check(
    'merge near wave line stays below line',
    s.count === 1 && after[0]?.tier === 2 && s.off === 0 && allBelowLine,
    `after=${s.count} ${s.tiers} off=${s.off} minY=${minY.toFixed(1)} pos=${JSON.stringify(after)}`,
  );
}

console.log(`\n${failed === 0 ? '통과' : '실패'}: ${results.length - failed}/${results.length} 시나리오`);
process.exit(failed === 0 ? 0 : 1);
