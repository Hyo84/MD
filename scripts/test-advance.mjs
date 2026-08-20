// 헤드리스 검증: 게임과 동일한 패턴으로 유닛 전진이 실제로 일어나는지 확인
import Matter from 'matter-js';

const { Engine, World, Bodies, Body } = Matter;

const engine = Engine.create();
engine.gravity.x = 0;
engine.gravity.y = 0;

const body = Bodies.circle(225, 500, 16, { frictionAir: 0.03, restitution: 0.3, friction: 0.05 });
Body.setMass(body, 1.0);
World.add(engine.world, body);

const advTick = 12 / 60; // 게임과 동일: unitAdvanceSpeed / 60 = 0.2

console.log('--- 패턴 A: 매 프레임 Engine.update 후 setVelocity (게임과 동일 순서) ---');
console.log('t=0s  y =', body.position.y.toFixed(2));
for (let i = 1; i <= 300; i++) {
  Engine.update(engine, 1000 / 60);
  Body.setVelocity(body, { x: body.velocity.x * 0.9, y: -advTick });
  if (i % 60 === 0) {
    console.log(`t=${i / 60}s  y = ${body.position.y.toFixed(2)}  vel.y = ${body.velocity.y.toFixed(4)}  speed = ${body.speed.toFixed(4)}`);
  }
}

console.log('\n--- 패턴 B: 발사 후 정착 시뮬레이션 (속도 18로 발사, settled 판정 시점) ---');
const engine2 = Engine.create();
engine2.gravity.x = 0;
engine2.gravity.y = 0;
const body2 = Bodies.circle(225, 700, 16, { frictionAir: 0.03, restitution: 0.3, friction: 0.05 });
Body.setMass(body2, 1.0);
World.add(engine2.world, body2);
Body.setVelocity(body2, { x: 0, y: -18 });
let settledAt = -1;
for (let i = 1; i <= 300; i++) {
  Engine.update(engine2, 1000 / 60);
  const age = i / 60;
  if (settledAt < 0 && (age > 2.5 || (age > 0.4 && body2.speed < 2))) settledAt = age;
  if (i % 30 === 0) {
    console.log(`t=${age.toFixed(1)}s  y = ${body2.position.y.toFixed(1)}  speed = ${body2.speed.toFixed(3)}`);
  }
}
console.log('settled 판정 시점:', settledAt.toFixed(2), 's');
