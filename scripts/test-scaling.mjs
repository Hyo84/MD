// 웨이브 난이도 곡선 확인: 주요 웨이브의 배율과 실효 스탯 출력
import { waveMultiplier, bossWaveMultiplier, killsNeeded, MONSTERS } from '../src/config.js';

console.log('웨이브 | 쓰레기배율 | 고블린HP | 트롤HP | 보스배율 | 보스HP | 처치할당');
for (const w of [1, 4, 5, 6, 9, 10, 11, 14, 15, 20, 30]) {
  const m = waveMultiplier(w);
  const b = bossWaveMultiplier(w);
  console.log(
    `${String(w).padStart(5)} | x${m.toFixed(2).padStart(5)} | ` +
    `${String(Math.round(MONSTERS.goblin.hp * m)).padStart(7)} | ` +
    `${String(Math.round(MONSTERS.troll.hp * m)).padStart(6)} | ` +
    `x${b.toFixed(2).padStart(5)} | ` +
    `${String(Math.round(MONSTERS.boss.hp * b)).padStart(6)} | ` +
    `${String(killsNeeded(w)).padStart(4)}`
  );
}
