// 웨이브 난이도 곡선 확인: 주요 웨이브의 배율과 실효 스탯 출력
import { waveMultiplier, MONSTERS } from '../src/config.js';

console.log('웨이브 | 배율   | 고블린 HP | 고블린 ATK | 보스 HP  | 보스 ATK');
for (const w of [1, 3, 5, 8, 10, 11, 12, 13, 15]) {
  const m = waveMultiplier(w);
  console.log(
    `${String(w).padStart(5)} | x${m.toFixed(2).padStart(5)} | ` +
    `${String(Math.round(MONSTERS.goblin.hp * m)).padStart(8)} | ` +
    `${(MONSTERS.goblin.atk * m).toFixed(1).padStart(9)} | ` +
    `${String(Math.round(MONSTERS.boss.hp * m)).padStart(8)} | ` +
    `${(MONSTERS.boss.atk * m).toFixed(0).padStart(7)}`
  );
}
