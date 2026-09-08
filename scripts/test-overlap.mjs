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
const { evoBarMetrics } = await import('../src/renderer.js');

const game = new Game(canvas, ui);
game.state = 'playing';

const checkOverlaps = (label) => {
  let bad = 0;
  for (let i = 0; i < game.enemies.length; i++) {
    for (let j = i + 1; j < game.enemies.length; j++) {
      const a = game.enemies[i], b = game.enemies[j];
      if (a.dead || b.dead) continue;
      if (!a.isBoss && (Number(a.col) || 0) < 0) continue;
      if (!b.isBoss && (Number(b.col) || 0) < 0) continue;
      const ay = game._enemyReserveY(a);
      const by = game._enemyReserveY(b);
      const d = Math.hypot(a.x - b.x, ay - by);
      const min = MONSTERS[a.key].r + MONSTERS[b.key].r;
      if (d < min - 0.5) {
        bad++;
        console.log(`  겹침! ${a.key}(r${MONSTERS[a.key].r}) - ${b.key}(r${MONSTERS[b.key].r}) 거리=${d.toFixed(1)} 최소=${min} (예약슬롯)`);
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

{
  const boss = game.enemies.find((m) => m.isBoss);
  const center = game._playfieldCenterX();
  const br = MONSTERS.boss.r;
  if (!boss) {
    console.log('  실패: 보스 없음');
    total += 1;
  } else {
    if (Math.abs(boss.x - center) > 0.5) {
      console.log(`  실패: 보스 x=${boss.x.toFixed(1)} (중앙 ${center})`);
      total += 1;
    } else console.log('보스 중앙 스폰 ok');
    if (boss.joining) console.log('보스 캠프 합류 ok');
    else console.log('보스 즉시 착지 ok');
    if (Math.abs((boss.joining ? game._enemySlotY(boss) : boss.y) - game.lineY) > 0.5) {
      console.log(`  실패: 보스 슬롯 y=${game._enemySlotY(boss).toFixed(1)} lineY=${game.lineY}`);
      total += 1;
    }
    for (const e of game.enemies) {
      if (e === boss || e.dead) continue;
      if ((Number(e.col) || 0) < 0) continue;
      const d = Math.hypot(e.x - boss.x, game._enemyReserveY(e) - game._enemyReserveY(boss));
      if (d < br + MONSTERS[e.key].r - 0.5) {
        console.log(`  실패: 보스 앞 잔여 겹침 ${e.key} d=${d.toFixed(1)}`);
        total += 1;
      }
    }
  }
}

// 시나리오 2: 보스가 있는 상태에서 계속 스폰
for (let i = 0; i < 20; i++) game._spawnEnemy(['goblin', 'orc', 'skeleton', 'troll'][i % 4]);
total += checkOverlaps('보스 + 추가 20 스폰');

// 시나리오 3: 라인이 내려간 상태에서도 확인
game.lineY = 400;
for (const m of game.enemies) m.y = game.lineY - m.row * 46;
for (let i = 0; i < 10; i++) game._spawnEnemy('troll');
total += checkOverlaps('라인 400 + 트롤 10');

{
  const g = new Game(canvas, ui);
  g.state = 'playing';
  g.cheatsEnabled = true;
  const { startX, slot, y, h } = evoBarMetrics();
  const tap = (tier) => g._tryShopBar({ x: startX + (tier - 1) * slot + slot / 2, y: y + h / 2 });
  const before = g.units.length;
  if (!tap(7) || g.currentTier !== 7) {
    console.log(`  실패: 치트 상점 T7 장전 (current=${g.currentTier})`);
    total += 1;
  } else console.log('치트 상점 T7 장전 ok');
  if (g.units.length !== before) {
    console.log('  실패: 상점 클릭이 발사로 샘');
    total += 1;
  } else console.log('상점 클릭은 발사 아님 ok');
  g.aimX = 225;
  g._launchUnit();
  const launched = g.units[g.units.length - 1];
  if (!launched || launched.tier !== 7) {
    console.log(`  실패: 장전 T7 발사 (tier=${launched?.tier})`);
    total += 1;
  } else console.log('장전 T7 발사 ok');
}

console.log(total === 0 ? '\n통과: 겹침 없음' : `\n실패: 총 ${total}쌍 겹침`);
process.exit(total === 0 ? 0 : 1);
