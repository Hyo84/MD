// 평균 플레이어 병력 vs 보스: 처치 시간·라인 잔여 거리 측정
global.requestAnimationFrame = () => {};

import Matter from 'matter-js';
import { Game } from '../src/game.js';
import { CANVAS_W, DEFEAT_Y, LINE_START_Y, UNITS, MONSTERS, waveMultiplier } from '../src/config.js';

const { Body } = Matter;

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

function placeArmy(game, army) {
  const n = army.length;
  const left = 36;
  const right = CANVAS_W - 36;
  army.forEach((tier, i) => {
    const x = n === 1 ? CANVAS_W / 2 : left + (i / (n - 1)) * (right - left);
    const y = LINE_START_Y + 38 + UNITS[tier - 1].r;
    const u = game._spawnUnit(tier, x, y);
    u.settled = true;
    Body.setVelocity(u.body, { x: 0, y: 0 });
  });
}

function simBossFight({ wave, army, trash = [], keepLaunching = false, maxT = 60 }) {
  const game = new Game(canvas, ui);
  game.state = 'playing';
  game.wave = wave;
  game.spawnTimer = 1e9;
  game.bossActive = true;
  game.bossPending = true;
  game.lineY = LINE_START_Y;

  placeArmy(game, army);
  for (const key of trash) game._spawnEnemy(key);
  game._spawnEnemy('boss');

  const dt = 1 / 60;
  let t = 0;
  let peakLine = game.lineY;
  while (t < maxT && game.state === 'playing') {
    if (keepLaunching) {
      if (game.launchCd <= 0) {
        game.aimX = 50 + Math.random() * (CANVAS_W - 100);
        game.currentTier = Math.random() < 0.75 ? 1 : 2;
        game._launchUnit();
      }
    }
    game._update(dt);
    t += dt;
    if (game.lineY > peakLine) peakLine = game.lineY;
    if (!game.enemies.some((m) => m.isBoss)) {
      return {
        result: 'win',
        t,
        lineY: game.lineY,
        peakLine,
        remaining: DEFEAT_Y - game.lineY,
        peakPush: peakLine - LINE_START_Y,
        unitsLeft: game.units.length,
        enemiesLeft: game.enemies.length,
      };
    }
  }
  const bossAlive = game.enemies.find((m) => m.isBoss);
  return {
    result: game.state === 'playing' ? 'timeout' : 'lose',
    t,
    lineY: game.lineY,
    peakLine,
    remaining: DEFEAT_Y - game.lineY,
    peakPush: peakLine - LINE_START_Y,
    unitsLeft: game.units.length,
    enemiesLeft: game.enemies.length,
    bossHp: bossAlive ? Math.round(bossAlive.hp) : 0,
    bossMax: bossAlive ? bossAlive.maxHp : 0,
  };
}

function trials(opts, n = 3) {
  const rows = [];
  for (let i = 0; i < n; i++) rows.push(simBossFight(opts));
  const wins = rows.filter((r) => r.result === 'win');
  const avgT = wins.length ? wins.reduce((s, r) => s + r.t, 0) / wins.length : null;
  const avgRem = wins.length ? wins.reduce((s, r) => s + r.remaining, 0) / wins.length : null;
  const avgUnits = wins.length ? wins.reduce((s, r) => s + r.unitsLeft, 0) / wins.length : null;
  const avgPeak = wins.length ? wins.reduce((s, r) => s + r.peakPush, 0) / wins.length : null;
  return { rows, wins: wins.length, n, avgT, avgRem, avgUnits, avgPeak };
}

function fmt(trial) {
  const t = trial.avgT != null ? `${trial.avgT.toFixed(1)}s` : '—';
  const rem = trial.avgRem != null ? `${trial.avgRem.toFixed(0)}px` : '—';
  const peak = trial.avgPeak != null ? `${trial.avgPeak.toFixed(0)}px` : '—';
  const u = trial.avgUnits != null ? trial.avgUnits.toFixed(1) : '—';
  const sample = trial.rows.map((r) => {
    if (r.result === 'win') return `win ${r.t.toFixed(1)}s rem=${r.remaining.toFixed(0)} peakPush=${r.peakPush.toFixed(0)}`;
    if (r.result === 'lose') return `LOSE t=${r.t.toFixed(1)}s hp=${r.bossHp}/${r.bossMax} peakPush=${r.peakPush.toFixed(0)}`;
    return `TIMEOUT hp=${r.bossHp}/${r.bossMax} peakPush=${r.peakPush.toFixed(0)}`;
  }).join(' | ');
  return `wins ${trial.wins}/${trial.n}  avgKill=${t}  avgRemain=${rem}  peakPush=${peak}  avgUnits=${u}\n    ${sample}`;
}

const WAVE1_ARMY = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2]; // 10 T1 + 2 T2
const WAVE5_ARMY = [2, 2, 2, 2, 3, 3, 3, 4, 4, 5];       // 4 T2 + 3 T3 + 2 T4 + 1 T5

function report(tag) {
  const boss = MONSTERS.boss;
  const w1 = waveMultiplier(1);
  const w5 = waveMultiplier(5);
  const w11 = waveMultiplier(11);
  console.log(`\n======== ${tag}  HP=${boss.hp} ATK=${boss.atk} speed=${boss.speed} ========`);
  console.log(`W1 실효 HP=${Math.round(boss.hp * w1)} ATK=${(boss.atk * w1).toFixed(0)}`);
  console.log(`W5 실효 HP=${Math.round(boss.hp * w5)} ATK=${(boss.atk * w5).toFixed(0)}`);
  console.log(`W11 실효 HP=${Math.round(boss.hp * w11)} ATK=${(boss.atk * w11).toFixed(0)}`);

  const w1n = trials({ wave: 1, army: WAVE1_ARMY, trash: ['goblin', 'goblin', 'goblin'], keepLaunching: false });
  const w1y = trials({ wave: 1, army: WAVE1_ARMY, trash: ['goblin', 'goblin', 'goblin'], keepLaunching: true });
  const w5n = trials({ wave: 5, army: WAVE5_ARMY, trash: ['goblin', 'goblin', 'orc', 'skeleton'], keepLaunching: false });
  const w5y = trials({ wave: 5, army: WAVE5_ARMY, trash: ['goblin', 'goblin', 'orc', 'skeleton'], keepLaunching: true });
  const w1weak = trials({ wave: 1, army: [1, 1, 1, 1, 1, 1, 1, 1, 2, 2], trash: ['goblin', 'goblin', 'goblin'], keepLaunching: true });
  const w11n = trials({
    wave: 11,
    army: [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
    trash: ['skelknight', 'skelknight', 'goblin', 'skeleton'],
    keepLaunching: true,
    maxT: 90,
  });
  const w11strong = trials({
    wave: 11,
    army: [2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5],
    trash: ['skelknight', 'skelknight', 'orc', 'skeleton', 'troll'],
    keepLaunching: true,
    maxT: 90,
  });
  const w8n = trials({
    wave: 8,
    army: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
    trash: ['skelknight', 'skelknight', 'goblin', 'skeleton'],
    keepLaunching: true,
    maxT: 90,
  });
  const w10n = trials({
    wave: 10,
    army: [1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
    trash: ['skelknight', 'skelknight', 'goblin', 'skeleton'],
    keepLaunching: true,
    maxT: 90,
  });
  const w5typical = trials({
    wave: 5,
    army: [1, 1, 1, 1, 2, 2, 2, 2, 3, 3],
    trash: ['goblin', 'goblin', 'orc', 'skeleton'],
    keepLaunching: true,
  });
  console.log('W1 click   :', fmt(w1y));
  console.log('W1 no-click:', fmt(w1n));
  console.log('W1 weak+clk:', fmt(w1weak));
  console.log('W5 click   :', fmt(w5y));
  console.log('W5 no-click:', fmt(w5n));
  console.log('W5 typical :', fmt(w5typical));
  console.log('W8 no-skill-ish click:', fmt(w8n));
  console.log('W10 no-skill-ish click:', fmt(w10n));
  console.log('W11 no-skill-ish click:', fmt(w11n));
  console.log('W11 strong no-skill:', fmt(w11strong));
}

report('현재값');
