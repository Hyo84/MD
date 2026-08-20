import Matter from 'matter-js';
import {
  CANVAS_W, CANVAS_H, DEFEAT_Y, LAUNCHER, SPAWN_Y,
  UNITS, MONSTERS, HEROES, HERO_LIFESPAN,
  ATTACK_COOLDOWN, LAUNCH_COOLDOWN,
  FRICTION_AIR_UNIT, FRICTION_AIR_MONSTER,
  MAX_LAUNCH_SPEED, LAUNCH_POWER, killsNeeded,
} from './config.js';
import { Effects } from './effects.js';

const { Engine, World, Bodies, Body, Events } = Matter;

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui; // { startOverlay, gameoverOverlay, finalScore, restartBtn }
    this.effects = new Effects();
    this.state = 'start'; // start | playing | gameover

    this._setupInput();
    this.ui.restartBtn.addEventListener('click', () => this.start());
    this.ui.startOverlay.addEventListener('pointerdown', () => this.start());

    this._reset();
    this._loop = this._loop.bind(this);
    this._lastTime = performance.now();
    requestAnimationFrame(this._loop);
  }

  _reset() {
    if (this.engine) {
      World.clear(this.engine.world, false);
      Engine.clear(this.engine);
    }
    this.engine = Engine.create();
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;

    // 벽: 좌 / 우 / 상 (+안전용 하단)
    const wallOpts = { isStatic: true, restitution: 0.5, friction: 0.05 };
    World.add(this.engine.world, [
      Bodies.rectangle(-20, CANVAS_H / 2, 40, CANVAS_H * 2, wallOpts),
      Bodies.rectangle(CANVAS_W + 20, CANVAS_H / 2, 40, CANVAS_H * 2, wallOpts),
      Bodies.rectangle(CANVAS_W / 2, -20, CANVAS_W * 2, 40, wallOpts),
      Bodies.rectangle(CANVAS_W / 2, CANVAS_H + 20, CANVAS_W * 2, 40, wallOpts),
    ]);

    this.units = [];       // 아군
    this.monsters = [];    // 적군
    this.unitByBodyId = new Map();
    this.mergeQueue = [];

    this.wave = 1;
    this.kills = 0;
    this.score = 0;
    this.spawnTimer = 1.2;
    this.bossActive = false;
    this.bossWarnT = 0;   // >0 이면 보스 경고 중
    this.bossPending = false;

    this.launchCd = 0;
    this.currentTier = this._rollTier();
    this.nextTier = this._rollTier();
    this.drag = null; // { x, y } 현재 드래그 좌표

    this.effects = new Effects();

    Events.on(this.engine, 'collisionStart', (ev) => this._onCollision(ev));
  }

  start() {
    this._reset();
    this.state = 'playing';
    this.ui.startOverlay.classList.add('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
  }

  _gameOver() {
    this.state = 'gameover';
    this.ui.finalScore.textContent = `점수: ${this.score} · 웨이브 ${this.wave}`;
    this.ui.gameoverOverlay.classList.remove('hidden');
  }

  _rollTier() {
    return Math.random() < 0.75 ? 1 : 2;
  }

  // ---------- 입력 ----------
  _setupInput() {
    const toCanvas = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
        y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
      };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      const p = toCanvas(e);
      if (p.y > 560 && this.launchCd <= 0) {
        this.drag = p;
        this.canvas.setPointerCapture(e.pointerId);
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.drag) this.drag = toCanvas(e);
    });
    const release = (e) => {
      if (!this.drag) return;
      const p = toCanvas(e);
      this.drag = null;
      if (this.state !== 'playing' || this.launchCd > 0) return;
      // 슬링샷: 발사대 아래로 당겼을 때만 위로 발사
      const dx = LAUNCHER.x - p.x;
      const dy = LAUNCHER.y - p.y;
      if (Math.hypot(dx, dy) < 15 || dy <= 0) return;
      this._launchUnit(dx, dy);
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', () => { this.drag = null; });
  }

  _launchUnit(dx, dy) {
    const norm = Math.hypot(dx, dy) || 1;
    const speed = Math.min(norm * LAUNCH_POWER, MAX_LAUNCH_SPEED);

    const u = this._spawnUnit(this.currentTier, LAUNCHER.x, LAUNCHER.y);
    Body.setVelocity(u.body, {
      x: (dx / norm) * speed,
      y: -(dy / norm) * speed,
    });

    this.launchCd = LAUNCH_COOLDOWN;
    this.currentTier = this.nextTier;
    this.nextTier = this._rollTier();
  }

  // ---------- 생성 ----------
  _spawnUnit(tier, x, y, heroType = null) {
    const stat = UNITS[tier - 1];
    const body = Bodies.circle(x, y, stat.r, {
      frictionAir: FRICTION_AIR_UNIT,
      restitution: 0.35,
      friction: 0.05,
    });
    Body.setMass(body, stat.mass);
    World.add(this.engine.world, body);

    const u = {
      body, tier,
      hp: stat.hp, maxHp: stat.hp, atk: stat.atk,
      r: stat.r, color: stat.color,
      attackCd: Math.random() * 0.3,
      isMerging: false, dead: false,
      settled: false, age: 0,
      flashT: 0,
      abilityT: 0, // T7 힐 / T9 충격파 / 영웅 스킬 타이머
      heroType,
      heroLife: heroType ? HERO_LIFESPAN : 0,
      valkTick: 0,
    };
    this.units.push(u);
    this.unitByBodyId.set(body.id, u);
    return u;
  }

  _spawnMonster(key, x, y) {
    const stat = MONSTERS[key];
    const body = Bodies.circle(x, y, stat.r, {
      frictionAir: stat.kbResist ? FRICTION_AIR_MONSTER * 3 : FRICTION_AIR_MONSTER,
      restitution: 0.25,
      friction: 0.05,
    });
    Body.setMass(body, stat.mass);
    World.add(this.engine.world, body);

    const m = {
      body, key,
      name: stat.name, icon: stat.icon,
      color: stat.color, outline: stat.outline,
      hp: stat.hp, maxHp: stat.hp, atk: stat.atk,
      r: stat.r, speed: stat.speed, score: stat.score,
      regen: stat.regen || 0, isBoss: !!stat.isBoss,
      attackCd: Math.random() * 0.4,
      stunT: 0, burn: null, flashT: 0, dead: false,
    };
    this.monsters.push(m);
    return m;
  }

  _removeUnit(u) {
    if (u.dead) return;
    u.dead = true;
    World.remove(this.engine.world, u.body);
    this.unitByBodyId.delete(u.body.id);
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  _removeMonster(m) {
    if (m.dead) return;
    m.dead = true;
    World.remove(this.engine.world, m.body);
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
  }

  // ---------- 머지 ----------
  _onCollision(ev) {
    for (const pair of ev.pairs) {
      const a = this.unitByBodyId.get(pair.bodyA.id);
      const b = this.unitByBodyId.get(pair.bodyB.id);
      if (!a || !b) continue;
      if (a.dead || b.dead || a.isMerging || b.isMerging) continue;
      if (a.tier !== b.tier || a.tier >= 10) continue;
      a.isMerging = true;
      b.isMerging = true;
      this.mergeQueue.push([a, b]);
    }
  }

  _processMerges() {
    for (const [a, b] of this.mergeQueue) {
      if (a.dead || b.dead) {
        a.isMerging = false;
        b.isMerging = false;
        continue;
      }
      const mx = (a.body.position.x + b.body.position.x) / 2;
      // 패배선 바로 근처에서 합쳐질 때 억울한 즉사 방지를 위해 살짝 위로 보정
      const my = Math.min((a.body.position.y + b.body.position.y) / 2, DEFEAT_Y - 30);
      const newTier = a.tier + 1;
      this._removeUnit(a);
      this._removeUnit(b);

      if (newTier === 10) {
        this._summonHero(mx, my);
      } else {
        const u = this._spawnUnit(newTier, mx, my);
        u.settled = true;
        this.effects.burst(mx, my, UNITS[newTier - 1].color, 18, 4, 3.5);
        this.effects.floatText(mx, my - 30, UNITS[newTier - 1].name, '#fff', 15, 0.9);
      }
      this.score += newTier * 5;
    }
    this.mergeQueue.length = 0;
  }

  _summonHero(x, y) {
    const types = Object.keys(HEROES);
    const type = types[Math.floor(Math.random() * types.length)];
    const u = this._spawnUnit(10, x, y, type);
    u.settled = true;
    this.effects.burst(x, y, '#FF4500', 40, 6, 5);
    this.effects.burst(x, y, '#FFD700', 30, 4.5, 4);
    this.effects.floatText(CANVAS_W / 2, 300, `영웅 소환! ${HEROES[type].name}`, '#FFD700', 28, 2.0);
  }

  // ---------- 웨이브 / 스폰 ----------
  _monsterPool() {
    const pool = [['goblin', 55], ['orc', 25]];
    if (this.wave >= 2) pool.push(['skeleton', 20]);
    if (this.wave >= 3) pool.push(['troll', 8]);
    return pool;
  }

  _pickMonster() {
    const pool = this._monsterPool();
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [key, w] of pool) {
      r -= w;
      if (r <= 0) return key;
    }
    return 'goblin';
  }

  _updateSpawning(dt) {
    if (this.bossWarnT > 0) {
      this.bossWarnT -= dt;
      if (this.bossWarnT <= 0) {
        const b = this._spawnMonster('boss', CANVAS_W / 2, SPAWN_Y);
        Body.setVelocity(b.body, { x: 0, y: 2 });
        this.bossActive = true;
        this.effects.burst(CANVAS_W / 2, SPAWN_Y, '#B22222', 30, 5, 5);
      }
      return;
    }

    if (!this.bossActive && !this.bossPending && this.kills >= killsNeeded(this.wave)) {
      this.bossPending = true;
      this.bossWarnT = 1.6;
      this.effects.floatText(CANVAS_W / 2, 250, '⚠ 보스 출현! ⚠', '#FF3030', 30, 1.6);
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const interval = Math.max(0.7, 2.3 - this.wave * 0.15) * (this.bossActive ? 1.8 : 1);
      this.spawnTimer = interval * (0.7 + Math.random() * 0.6);
      const key = this._pickMonster();
      const stat = MONSTERS[key];
      const x = stat.r + 15 + Math.random() * (CANVAS_W - stat.r * 2 - 30);
      const m = this._spawnMonster(key, x, SPAWN_Y);
      Body.setVelocity(m.body, { x: 0, y: 1 });
    }
  }

  _onMonsterKilled(m) {
    this.score += m.score;
    this.effects.burst(m.body.position.x, m.body.position.y, m.color, 12, 3, 3);
    this.effects.floatText(m.body.position.x, m.body.position.y - 20, `+${m.score}`, '#ffd', 13, 0.7);
    if (m.isBoss) {
      this.bossActive = false;
      this.bossPending = false;
      this.wave += 1;
      this.kills = 0;
      this.effects.floatText(CANVAS_W / 2, 300, `웨이브 ${this.wave} 시작!`, '#7CFC00', 26, 2.0);
    } else {
      this.kills += 1;
    }
    this._removeMonster(m);
  }

  // ---------- 전투 ----------
  _dist(a, b) {
    return Math.hypot(a.body.position.x - b.body.position.x, a.body.position.y - b.body.position.y);
  }

  _damageMonster(m, dmg, source) {
    m.hp -= dmg;
    m.flashT = 0.12;
    if (m.hp <= 0) this._onMonsterKilled(m);
  }

  _jeanneBuffed(u) {
    if (u.heroType) return false;
    for (const h of this.units) {
      if (h.heroType === 'jeanne' && this._dist(u, h) < 140) return true;
    }
    return false;
  }

  _updateCombat(dt) {
    // 아군 공격
    for (const u of [...this.units]) {
      if (u.dead) continue;
      u.attackCd -= dt;
      if (u.attackCd > 0) continue;
      let target = null, best = Infinity;
      for (const m of this.monsters) {
        const d = this._dist(u, m) - u.r - m.r;
        if (d < 6 && d < best) { best = d; target = m; }
      }
      if (!target) continue;
      u.attackCd = ATTACK_COOLDOWN;

      let dmg = u.atk;
      if (this._jeanneBuffed(u)) dmg *= 1.5;
      this.effects.hitFlash(target.body.position.x, target.body.position.y, '#fff');

      // 특수 능력
      if (u.tier === 5) {
        // 소범위 휩쓸기
        for (const m2 of [...this.monsters]) {
          if (m2 !== target && !m2.dead && this._dist(target, m2) < 60) {
            this._damageMonster(m2, dmg * 0.5, u);
          }
        }
      }
      if (u.tier === 6 && Math.random() < 0.10 && !target.dead) {
        target.stunT = Math.max(target.stunT, 0.5);
        this.effects.floatText(target.body.position.x, target.body.position.y - 24, '기절!', '#87CEFA', 12, 0.5);
      }
      if (u.tier === 8 && !target.dead) {
        target.burn = { dps: u.atk * 0.2, t: 3 };
      }
      if (!target.dead) this._damageMonster(target, dmg, u);
    }

    // 몬스터 공격
    for (const m of [...this.monsters]) {
      if (m.dead || m.stunT > 0) continue;
      m.attackCd -= dt;
      if (m.attackCd > 0) continue;
      let target = null, best = Infinity;
      for (const u of this.units) {
        const d = this._dist(m, u) - m.r - u.r;
        if (d < 6 && d < best) { best = d; target = u; }
      }
      if (!target) continue;
      m.attackCd = ATTACK_COOLDOWN;
      target.hp -= m.atk;
      target.flashT = 0.12;
      this.effects.hitFlash(target.body.position.x, target.body.position.y, '#ff6b6b');
      if (target.hp <= 0) {
        this.effects.burst(target.body.position.x, target.body.position.y, target.color, 10, 3, 3);
        this._removeUnit(target);
      }
    }
  }

  _updateUnitAbilities(dt) {
    for (const u of [...this.units]) {
      if (u.dead) continue;
      u.abilityT += dt;

      // T7 성기사: 2초마다 주변 아군 회복
      if (u.tier === 7 && u.abilityT >= 2) {
        u.abilityT = 0;
        for (const a of this.units) {
          if (a.dead || a === u) continue;
          if (this._dist(u, a) < 110 && a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.04);
            this.effects.burst(a.body.position.x, a.body.position.y - a.r, '#7CFC00', 3, 1.5, 2);
          }
        }
      }

      // T9 대원수: 4초마다 충격파
      if (u.tier === 9 && u.abilityT >= 4) {
        u.abilityT = 0;
        this.effects.burst(u.body.position.x, u.body.position.y, '#9370DB', 24, 5.5, 3.5);
        for (const m of [...this.monsters]) {
          if (m.dead) continue;
          const d = this._dist(u, m);
          if (d < 140) {
            const dx = m.body.position.x - u.body.position.x;
            const dy = m.body.position.y - u.body.position.y;
            const n = Math.hypot(dx, dy) || 1;
            const push = m.kbResist ? 3 : 8;
            Body.setVelocity(m.body, { x: (dx / n) * push, y: (dy / n) * push });
            this._damageMonster(m, u.atk * 0.3, u);
          }
        }
      }

      // T10 영웅
      if (u.heroType) {
        u.heroLife -= dt;
        if (u.heroLife <= 0) {
          this.effects.burst(u.body.position.x, u.body.position.y, '#FFD700', 24, 4, 4);
          this._removeUnit(u);
          continue;
        }

        if (u.heroType === 'arthur' && u.abilityT >= 3) {
          u.abilityT = 0;
          const y = u.body.position.y;
          this.effects.lineFlash(y, '#9be7ff');
          for (const m of [...this.monsters]) {
            if (!m.dead) this._damageMonster(m, u.atk * 0.4, u);
          }
        }

        if (u.heroType === 'valkyrie') {
          u.valkTick += dt;
          const doDamage = u.valkTick >= 0.3;
          if (doDamage) u.valkTick = 0;
          for (const m of [...this.monsters]) {
            if (m.dead) continue;
            const d = this._dist(u, m);
            if (d < 160) {
              const dx = u.body.position.x - m.body.position.x;
              const dy = u.body.position.y - m.body.position.y;
              const n = Math.hypot(dx, dy) || 1;
              Body.applyForce(m.body, m.body.position, {
                x: (dx / n) * 0.0018 * m.body.mass,
                y: (dy / n) * 0.0018 * m.body.mass,
              });
              if (doDamage) this._damageMonster(m, u.atk * 0.12, u);
            }
          }
        }
      }
    }
  }

  _updateMonsters(dt) {
    for (const m of [...this.monsters]) {
      if (m.dead) continue;

      if (m.stunT > 0) {
        m.stunT -= dt;
      } else if (m.body.velocity.y < m.speed) {
        // 아래로 꾸준히 전진
        Body.applyForce(m.body, m.body.position, { x: 0, y: 0.0016 * m.body.mass });
      }

      if (m.burn) {
        m.burn.t -= dt;
        this._damageMonster(m, m.burn.dps * dt, null);
        if (m.dead) continue;
        if (m.burn && m.burn.t <= 0) m.burn = null;
      }

      if (m.regen && m.hp < m.maxHp) {
        m.hp = Math.min(m.maxHp, m.hp + m.regen * dt);
      }

      m.flashT = Math.max(0, m.flashT - dt);
    }
  }

  // ---------- 메인 루프 ----------
  _loop(now) {
    const dt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    if (this.state === 'playing') this._update(dt);
    this._draw();

    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    this.launchCd = Math.max(0, this.launchCd - dt);

    Engine.update(this.engine, 1000 / 60);
    this._processMerges();
    this._updateSpawning(dt);
    this._updateMonsters(dt);
    this._updateCombat(dt);
    this._updateUnitAbilities(dt);
    this.effects.update(dt);

    // 정착 판정 + 패배선 체크
    for (const u of [...this.units]) {
      u.age += dt;
      u.flashT = Math.max(0, u.flashT - dt);
      if (!u.settled && (u.age > 2.5 || (u.age > 0.4 && u.body.speed < 0.8))) {
        u.settled = true;
      }
      if (u.settled && u.body.position.y > DEFEAT_Y) {
        this._gameOver();
        return;
      }
    }
    for (const m of this.monsters) {
      if (m.body.position.y > DEFEAT_Y) {
        this._gameOver();
        return;
      }
    }
  }

  // ---------- 렌더링 ----------
  _draw() {
    const ctx = this.ctx;

    // 배경
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#1a1410');
    grad.addColorStop(0.6, '#241b13');
    grad.addColorStop(1, '#2e2317');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 석재 타일 느낌의 옅은 선
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < CANVAS_H; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }

    // 발사대 구역
    ctx.fillStyle = 'rgba(120, 90, 40, 0.12)';
    ctx.fillRect(0, DEFEAT_Y, CANVAS_W, CANVAS_H - DEFEAT_Y);

    // 패배선 (빛나는 빨간 점선)
    ctx.save();
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 9]);
    ctx.shadowColor = '#ff2222';
    ctx.shadowBlur = 12 + Math.sin(performance.now() / 300) * 5;
    ctx.beginPath();
    ctx.moveTo(0, DEFEAT_Y);
    ctx.lineTo(CANVAS_W, DEFEAT_Y);
    ctx.stroke();
    ctx.restore();

    // 조준선
    if (this.drag && this.state === 'playing') {
      const dx = LAUNCHER.x - this.drag.x;
      const dy = LAUNCHER.y - this.drag.y;
      if (dy > 0) {
        const n = Math.hypot(dx, dy) || 1;
        const len = Math.min(n * 2.2, 340);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 235, 160, 0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.moveTo(LAUNCHER.x, LAUNCHER.y);
        ctx.lineTo(LAUNCHER.x + (dx / n) * len, LAUNCHER.y - Math.abs(dy / n) * len);
        ctx.stroke();
        ctx.restore();
        // 당김 표시선
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(LAUNCHER.x, LAUNCHER.y);
        ctx.lineTo(this.drag.x, this.drag.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 몬스터
    for (const m of this.monsters) {
      const { x, y } = m.body.position;
      ctx.save();
      ctx.fillStyle = m.flashT > 0 ? '#ffffff' : m.color;
      ctx.strokeStyle = m.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (m.stunT > 0) {
        ctx.fillStyle = '#87CEFA';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✦', x, y - m.r - 14);
      }
      if (m.burn) {
        ctx.fillStyle = '#FF8C00';
        ctx.beginPath();
        ctx.arc(x + m.r * 0.5, y - m.r * 0.5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = m.key === 'skeleton' ? '#333' : '#fff';
      ctx.font = `bold ${Math.max(11, m.r * 0.62)}px 'Malgun Gothic', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.icon, x, y + 1);
      ctx.restore();
      this._drawHpBar(x, y - m.r - 9, m.r * 2, m.hp / m.maxHp, '#e74c3c');
    }

    // 아군 유닛
    for (const u of this.units) {
      const { x, y } = u.body.position;
      ctx.save();
      if (u.heroType) {
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 16;
      }
      ctx.fillStyle = u.flashT > 0 ? '#ffffff' : u.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, u.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = (u.tier === 7) ? '#5c4500' : '#fff';
      ctx.font = `bold ${Math.max(12, u.r * 0.7)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (u.heroType) {
        ctx.font = `bold ${u.r * 0.5}px 'Malgun Gothic', sans-serif`;
        ctx.fillText(HEROES[u.heroType].name, x, y + 1);
      } else {
        ctx.fillText(String(u.tier), x, y + 1);
      }
      ctx.restore();
      this._drawHpBar(x, y - u.r - 9, u.r * 2, u.hp / u.maxHp, '#2ecc71');
      if (u.heroType) {
        // 남은 시간 링
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, u.r + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (u.heroLife / HERO_LIFESPAN));
        ctx.stroke();
        ctx.restore();
      }
    }

    // 잔느 오라
    for (const h of this.units) {
      if (h.heroType === 'jeanne') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 223, 100, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.arc(h.body.position.x, h.body.position.y, 140, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 발사 대기 유닛
    if (this.state === 'playing') {
      const stat = UNITS[this.currentTier - 1];
      const ready = this.launchCd <= 0;
      ctx.save();
      ctx.globalAlpha = ready ? 1 : 0.4;
      ctx.fillStyle = stat.color;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(LAUNCHER.x, LAUNCHER.y, stat.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${stat.r * 0.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.currentTier), LAUNCHER.x, LAUNCHER.y + 1);
      ctx.restore();

      // 다음 유닛 미리보기
      const nstat = UNITS[this.nextTier - 1];
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#c9b48a';
      ctx.font = "13px 'Malgun Gothic', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('다음', CANVAS_W - 55, CANVAS_H - 62);
      ctx.fillStyle = nstat.color;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(CANVAS_W - 55, CANVAS_H - 35, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.nextTier), CANVAS_W - 55, CANVAS_H - 34);
      ctx.restore();
    }

    // 이펙트
    this.effects.draw(ctx, CANVAS_W);

    // 보스 경고 점멸
    if (this.bossWarnT > 0 && Math.floor(performance.now() / 200) % 2 === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 40, 40, 0.10)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    // HUD
    this._drawHud();
  }

  _drawHpBar(x, y, w, ratio, color) {
    const ctx = this.ctx;
    const r = Math.max(0, Math.min(1, ratio));
    if (r >= 0.999) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y, w * r, 5);
    ctx.restore();
  }

  _drawHud() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, CANVAS_W, 34);
    ctx.fillStyle = '#f0e6d2';
    ctx.font = "bold 15px 'Malgun Gothic', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`웨이브 ${this.wave}`, 12, 18);

    ctx.textAlign = 'center';
    const need = killsNeeded(this.wave);
    ctx.fillText(this.bossActive ? '보스 전투 중!' : `처치 ${this.kills} / ${need}`, CANVAS_W / 2, 18);

    ctx.textAlign = 'right';
    ctx.fillText(`점수 ${this.score}`, CANVAS_W - 12, 18);
    ctx.restore();
  }
}
