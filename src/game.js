import Matter from 'matter-js';
import {
  CANVAS_W, CANVAS_H, DEFEAT_Y, LINE_START_Y, LAUNCHER_Y,
  BALANCE, UNITS, MONSTERS, HEROES, HERO_LIFESPAN,
  FRICTION_AIR_UNIT, killsNeeded,
} from './config.js';
import { Effects } from './effects.js';

const { Engine, World, Bodies, Body, Events } = Matter;

// 웨이브라인 슬롯 배치
const SLOT_COLS = 7;
const SLOT_MARGIN = 40;
const SLOT_ROW_H = 46;
const slotX = (col) => SLOT_MARGIN + (col * (CANVAS_W - SLOT_MARGIN * 2)) / (SLOT_COLS - 1);

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ui = ui;
    this.state = 'start'; // start | playing | gameover
    this.mouse = null;

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

    const wallOpts = { isStatic: true, restitution: 0.4, friction: 0.05 };
    World.add(this.engine.world, [
      Bodies.rectangle(-20, CANVAS_H / 2, 40, CANVAS_H * 2, wallOpts),
      Bodies.rectangle(CANVAS_W + 20, CANVAS_H / 2, 40, CANVAS_H * 2, wallOpts),
      Bodies.rectangle(CANVAS_W / 2, -20, CANVAS_W * 2, 40, wallOpts),
      Bodies.rectangle(CANVAS_W / 2, CANVAS_H + 20, CANVAS_W * 2, 40, wallOpts),
    ]);

    this.units = [];                 // 아군 (Matter 바디)
    this.enemies = [];               // 적 (라인 부착 엔티티, 물리 없음)
    this.unitByBodyId = new Map();
    this.mergeQueue = [];
    this.occupiedSlots = new Set();  // "row:col"

    this.lineY = LINE_START_Y;       // 웨이브라인 현재 위치
    this.netSpeed = 0;               // HUD 표시용 순 속도 (+아래 / -위)

    this.wave = 1;
    this.kills = 0;
    this.score = 0;
    this.spawnTimer = 1.5;
    this.bossActive = false;
    this.bossPending = false;
    this.bossWarnT = 0;

    this.launchCd = 0;
    this.aimX = CANVAS_W / 2;
    this.dragging = false;
    this.currentTier = this._rollTier();
    this.nextTier = this._rollTier();

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

  // ---------- 입력: 가로 위치 선택 + 수직 발사 ----------
  _setupInput() {
    const toCanvas = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (CANVAS_W / rect.width),
        y: (e.clientY - rect.top) * (CANVAS_H / rect.height),
      };
    };
    const clampAimX = (x) => Math.max(24, Math.min(CANVAS_W - 24, x));

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state !== 'playing') return;
      const p = toCanvas(e);
      if (p.y > 560) {
        this.dragging = true;
        this.aimX = clampAimX(p.x);
        this.canvas.setPointerCapture(e.pointerId);
      }
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toCanvas(e);
      this.mouse = p;
      if (this.dragging) this.aimX = clampAimX(p.x);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.state !== 'playing' || this.launchCd > 0) return;
      this.aimX = clampAimX(toCanvas(e).x);
      this._launchUnit();
    });
    this.canvas.addEventListener('pointercancel', () => { this.dragging = false; });
  }

  _launchUnit() {
    const u = this._spawnUnit(this.currentTier, this.aimX, LAUNCHER_Y);
    Body.setVelocity(u.body, { x: 0, y: -BALANCE.launchSpeed });
    this.launchCd = BALANCE.launchCooldown;
    this.currentTier = this.nextTier;
    this.nextTier = this._rollTier();
  }

  // ---------- 생성 ----------
  _spawnUnit(tier, x, y, heroType = null) {
    const stat = UNITS[tier - 1];
    const body = Bodies.circle(x, y, stat.r, {
      frictionAir: FRICTION_AIR_UNIT,
      restitution: 0.3,
      friction: 0.05,
    });
    Body.setMass(body, stat.mass);
    World.add(this.engine.world, body);

    const u = {
      body, tier,
      hp: stat.hp, maxHp: stat.hp,
      r: stat.r, color: stat.color,
      attackCd: Math.random() * 0.3,
      isMerging: false, dead: false,
      holding: false,
      flashT: 0, abilityT: 0,
      heroType,
      heroLife: heroType ? HERO_LIFESPAN : 0,
      valkTick: 0,
    };
    this.units.push(u);
    this.unitByBodyId.set(body.id, u);
    return u;
  }

  _findSlot() {
    for (let row = 0; row < 30; row++) {
      const free = [];
      for (let col = 0; col < SLOT_COLS; col++) {
        if (!this.occupiedSlots.has(`${row}:${col}`)) free.push(col);
      }
      if (free.length > 0) {
        const col = free[Math.floor(Math.random() * free.length)];
        return { row, col };
      }
    }
    return { row: 0, col: 0 };
  }

  _spawnEnemy(key) {
    const stat = MONSTERS[key];
    const isBoss = !!stat.isBoss;
    let row = 0, col = -1, x = CANVAS_W / 2;
    if (!isBoss) {
      const slot = this._findSlot();
      row = slot.row;
      col = slot.col;
      this.occupiedSlots.add(`${row}:${col}`);
      x = slotX(col) + (Math.random() * 14 - 7);
    }
    const m = {
      key, isBoss, row, col, x,
      y: this.lineY - row * SLOT_ROW_H,
      hp: stat.hp, maxHp: stat.hp,
      attackCd: Math.random() * 0.4,
      stunT: 0, burn: null, flashT: 0, dead: false,
    };
    this.enemies.push(m);
    this.effects.burst(m.x, m.y, stat.color, 8, 2.5, 2.5);
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

  _removeEnemy(m) {
    if (m.dead) return;
    m.dead = true;
    if (!m.isBoss) this.occupiedSlots.delete(`${m.row}:${m.col}`);
    const i = this.enemies.indexOf(m);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  // ---------- 머지 (아군 물리 충돌) ----------
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
      let my = (a.body.position.y + b.body.position.y) / 2;
      my = Math.max(this.lineY + 40, Math.min(my, DEFEAT_Y - 30));
      const newTier = a.tier + 1;
      this._removeUnit(a);
      this._removeUnit(b);

      if (newTier === 10) {
        this._summonHero(mx, my);
      } else {
        this._spawnUnit(newTier, mx, my);
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
    this._spawnUnit(10, x, y, type);
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
        this._spawnEnemy('boss');
        this.bossActive = true;
        this.effects.burst(CANVAS_W / 2, this.lineY, '#B22222', 30, 5, 5);
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
      const interval = Math.max(0.7, BALANCE.spawnInterval - this.wave * 0.15) * (this.bossActive ? 1.8 : 1);
      this.spawnTimer = interval * (0.7 + Math.random() * 0.6);
      this._spawnEnemy(this._pickMonster());
    }
  }

  _onEnemyKilled(m) {
    const stat = MONSTERS[m.key];
    this.score += stat.score;
    this.effects.burst(m.x, m.y, stat.color, 12, 3, 3);
    this.effects.floatText(m.x, m.y - 20, `+${stat.score}`, '#ffd', 13, 0.7);
    if (m.isBoss) {
      this.bossActive = false;
      this.bossPending = false;
      this.wave += 1;
      this.kills = 0;
      this.effects.floatText(CANVAS_W / 2, 300, `웨이브 ${this.wave} 시작!`, '#7CFC00', 26, 2.0);
    } else {
      this.kills += 1;
    }
    this._removeEnemy(m);
  }

  _damageEnemy(m, dmg) {
    if (m.dead) return;
    m.hp -= dmg;
    m.flashT = 0.12;
    if (m.hp <= 0) this._onEnemyKilled(m);
  }

  // ---------- 웨이브라인 이동 (줄다리기) ----------
  _unitStat(u) {
    return UNITS[u.tier - 1];
  }

  _unitEngaged(u) {
    const range = this._unitStat(u).range;
    const { x, y } = u.body.position;
    for (const m of this.enemies) {
      const er = MONSTERS[m.key].r;
      if (Math.hypot(m.x - x, m.y - y) <= range + er) return true;
    }
    return false;
  }

  _updateLine(dt) {
    if (this.enemies.length === 0) {
      this.netSpeed = 0;
      return;
    }
    let advance = BALANCE.baseLineSpeed;
    for (const m of this.enemies) {
      if (m.stunT <= 0) advance += MONSTERS[m.key].speed;
    }
    let stopping = 0;
    for (const u of this.units) {
      if (this._unitEngaged(u)) stopping += this._unitStat(u).stop;
    }
    this.netSpeed = advance - stopping;
    this.lineY += this.netSpeed * dt;
    if (this.lineY < LINE_START_Y) this.lineY = LINE_START_Y;
    if (this.lineY >= DEFEAT_Y) {
      this.lineY = DEFEAT_Y;
      this._gameOver();
      return;
    }
    // 적 위치를 라인에 맞춰 갱신 (뒤 열은 라인 위쪽으로 적층)
    for (const m of this.enemies) {
      m.y = this.lineY - m.row * SLOT_ROW_H;
    }
  }

  // ---------- 아군 유닛: 라인 앞에서 정지 ----------
  _updateUnitHolding() {
    for (const u of this.units) {
      const range = this._unitStat(u).range;
      const gap = u.body.position.y - this.lineY;
      // 사거리 안에 들어오면 전진 정지 (그 자리에서 교전)
      if (gap <= range && u.body.velocity.y < 0) {
        Body.setVelocity(u.body, { x: u.body.velocity.x, y: 0 });
        u.holding = true;
      }
      // 라인이 전진하면 유닛을 밀어냄 (라인 관통 방지)
      const minY = this.lineY + 14 + u.r;
      if (u.body.position.y < minY) {
        Body.setPosition(u.body, { x: u.body.position.x, y: minY });
        if (u.body.velocity.y < 0) Body.setVelocity(u.body, { x: u.body.velocity.x, y: 0 });
      }
    }
  }

  // ---------- 전투 ----------
  _jeanneBuffed(u) {
    if (u.heroType) return false;
    for (const h of this.units) {
      if (h.heroType === 'jeanne') {
        const d = Math.hypot(
          u.body.position.x - h.body.position.x,
          u.body.position.y - h.body.position.y,
        );
        if (d < 140) return true;
      }
    }
    return false;
  }

  _updateCombat(dt) {
    // 아군 → 적
    for (const u of [...this.units]) {
      if (u.dead) continue;
      u.attackCd -= dt;
      if (u.attackCd > 0) continue;
      const stat = this._unitStat(u);
      const { x, y } = u.body.position;
      let target = null, best = Infinity;
      for (const m of this.enemies) {
        const er = MONSTERS[m.key].r;
        const d = Math.hypot(m.x - x, m.y - y) - er;
        if (d <= stat.range && d < best) { best = d; target = m; }
      }
      if (!target) continue;
      u.attackCd = BALANCE.attackCooldown;

      let dmg = stat.atk;
      if (this._jeanneBuffed(u)) dmg *= 1.5;
      this.effects.hitFlash(target.x, target.y, '#fff');

      // 티어 특수 능력
      if (u.tier === 5) {
        for (const m2 of [...this.enemies]) {
          if (m2 !== target && !m2.dead && Math.hypot(m2.x - target.x, m2.y - target.y) < 60) {
            this._damageEnemy(m2, dmg * 0.5);
          }
        }
      }
      if (u.tier === 6 && Math.random() < 0.10 && !target.dead) {
        target.stunT = Math.max(target.stunT, 0.5);
        this.effects.floatText(target.x, target.y - 24, '기절!', '#87CEFA', 12, 0.5);
      }
      if (u.tier === 8 && !target.dead) {
        target.burn = { dps: stat.atk * 0.2, t: 3 };
      }
      if (!target.dead) this._damageEnemy(target, dmg);
    }

    // 적 → 아군
    for (const m of [...this.enemies]) {
      if (m.dead || m.stunT > 0) continue;
      m.attackCd -= dt;
      if (m.attackCd > 0) continue;
      const stat = MONSTERS[m.key];
      const reach = stat.r + BALANCE.enemyReach;
      let target = null, best = Infinity;
      for (const u of this.units) {
        const d = Math.hypot(u.body.position.x - m.x, u.body.position.y - m.y) - u.r;
        if (d <= reach && d < best) { best = d; target = u; }
      }
      if (!target) continue;
      m.attackCd = BALANCE.attackCooldown;
      target.hp -= stat.atk;
      target.flashT = 0.12;
      this.effects.hitFlash(target.body.position.x, target.body.position.y, '#ff6b6b');
      if (target.hp <= 0) {
        this.effects.burst(target.body.position.x, target.body.position.y, target.color, 10, 3, 3);
        this._removeUnit(target);
      }
    }
  }

  _updateEnemyTicks(dt) {
    for (const m of [...this.enemies]) {
      if (m.dead) continue;
      if (m.stunT > 0) m.stunT -= dt;
      if (m.burn) {
        m.burn.t -= dt;
        this._damageEnemy(m, m.burn.dps * dt);
        if (m.dead) continue;
        if (m.burn && m.burn.t <= 0) m.burn = null;
      }
      const stat = MONSTERS[m.key];
      if (stat.regen && m.hp < m.maxHp) {
        m.hp = Math.min(m.maxHp, m.hp + stat.regen * dt);
      }
      m.flashT = Math.max(0, m.flashT - dt);
    }
  }

  _updateUnitAbilities(dt) {
    for (const u of [...this.units]) {
      if (u.dead) continue;
      u.abilityT += dt;
      const stat = this._unitStat(u);

      // T7 성기사: 2초마다 주변 아군 회복
      if (u.tier === 7 && u.abilityT >= 2) {
        u.abilityT = 0;
        for (const a of this.units) {
          if (a.dead || a === u) continue;
          const d = Math.hypot(
            a.body.position.x - u.body.position.x,
            a.body.position.y - u.body.position.y,
          );
          if (d < 110 && a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.04);
            this.effects.burst(a.body.position.x, a.body.position.y - a.r, '#7CFC00', 3, 1.5, 2);
          }
        }
      }

      // T9 대원수: 4초마다 사거리 내 광역 충격파
      if (u.tier === 9 && u.abilityT >= 4) {
        u.abilityT = 0;
        this.effects.burst(u.body.position.x, u.body.position.y, '#9370DB', 24, 5.5, 3.5);
        for (const m of [...this.enemies]) {
          if (m.dead) continue;
          const d = Math.hypot(m.x - u.body.position.x, m.y - u.body.position.y);
          if (d < stat.range) this._damageEnemy(m, stat.atk * 0.3);
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
          this.effects.lineFlash(this.lineY, '#9be7ff');
          for (const m of [...this.enemies]) {
            if (!m.dead) this._damageEnemy(m, stat.atk * 0.4);
          }
        }
        if (u.heroType === 'valkyrie') {
          u.valkTick += dt;
          if (u.valkTick >= 0.3) {
            u.valkTick = 0;
            for (const m of [...this.enemies]) {
              if (m.dead) continue;
              const d = Math.hypot(m.x - u.body.position.x, m.y - u.body.position.y);
              if (d < stat.range) this._damageEnemy(m, stat.atk * 0.12);
            }
          }
        }
      }
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
    this._updateLine(dt);
    if (this.state !== 'playing') return;
    this._updateUnitHolding();
    this._updateCombat(dt);
    this._updateEnemyTicks(dt);
    this._updateUnitAbilities(dt);
    this.effects.update(dt);

    for (const u of this.units) {
      u.flashT = Math.max(0, u.flashT - dt);
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

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < CANVAS_H; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }

    // 적 점령 영역 (라인 위쪽)
    ctx.fillStyle = 'rgba(140, 30, 40, 0.10)';
    ctx.fillRect(0, 0, CANVAS_W, this.lineY);

    // 웨이브라인
    ctx.save();
    ctx.strokeStyle = '#c33a5a';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#e0335a';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, this.lineY);
    ctx.lineTo(CANVAS_W, this.lineY);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 160, 170, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(0, this.lineY);
    ctx.lineTo(CANVAS_W, this.lineY);
    ctx.stroke();
    ctx.restore();

    // 발사대 구역
    ctx.fillStyle = 'rgba(120, 90, 40, 0.12)';
    ctx.fillRect(0, DEFEAT_Y, CANVAS_W, CANVAS_H - DEFEAT_Y);

    // 마지노선 (빛나는 빨간 점선)
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

    // 발사 가이드 (수직 점선)
    if (this.dragging && this.state === 'playing') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 235, 160, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.moveTo(this.aimX, LAUNCHER_Y - 20);
      ctx.lineTo(this.aimX, this.lineY + 20);
      ctx.stroke();
      ctx.restore();
    }

    // 적 (라인 부착)
    for (const m of this.enemies) {
      const stat = MONSTERS[m.key];
      ctx.save();
      ctx.fillStyle = m.flashT > 0 ? '#ffffff' : stat.color;
      ctx.strokeStyle = stat.outline;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, stat.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (m.stunT > 0) {
        ctx.fillStyle = '#87CEFA';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✦', m.x, m.y - stat.r - 14);
      }
      if (m.burn) {
        ctx.fillStyle = '#FF8C00';
        ctx.beginPath();
        ctx.arc(m.x + stat.r * 0.5, m.y - stat.r * 0.5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = m.key === 'skeleton' ? '#333' : '#fff';
      ctx.font = `bold ${Math.max(11, stat.r * 0.62)}px 'Malgun Gothic', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(stat.icon, m.x, m.y + 1);
      ctx.restore();
      this._drawHpBar(m.x, m.y - stat.r - 9, stat.r * 2, m.hp / m.maxHp, '#e74c3c');
    }

    // 사거리 표시 (영웅은 항상, 다른 유닛은 마우스 오버 시)
    this._drawRangeIndicators();

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
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (u.heroType) {
        ctx.font = `bold ${u.r * 0.5}px 'Malgun Gothic', sans-serif`;
        ctx.fillText(HEROES[u.heroType].name, x, y + 1);
      } else {
        ctx.font = `bold ${Math.max(12, u.r * 0.7)}px sans-serif`;
        ctx.fillText(String(u.tier), x, y + 1);
      }
      ctx.restore();
      this._drawHpBar(x, y - u.r - 9, u.r * 2, u.hp / u.maxHp, '#2ecc71');
      if (u.heroType) {
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

    // 발사 대기 유닛 + 다음 유닛
    if (this.state === 'playing') {
      const stat = UNITS[this.currentTier - 1];
      const ready = this.launchCd <= 0;
      ctx.save();
      ctx.globalAlpha = ready ? 1 : 0.4;
      ctx.fillStyle = stat.color;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.aimX, LAUNCHER_Y, stat.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${stat.r * 0.7}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.currentTier), this.aimX, LAUNCHER_Y + 1);
      ctx.restore();

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

    this.effects.draw(ctx, CANVAS_W);

    if (this.bossWarnT > 0 && Math.floor(performance.now() / 200) % 2 === 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 40, 40, 0.10)';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
    }

    this._drawHud();
  }

  _drawRangeIndicators() {
    const ctx = this.ctx;
    for (const u of this.units) {
      const { x, y } = u.body.position;
      const range = this._unitStat(u).range;
      let show = false;
      let alpha = 0.12;
      if (u.heroType) {
        show = true;
        alpha = 0.15;
      } else if (this.mouse && Math.hypot(this.mouse.x - x, this.mouse.y - y) < u.r + 6) {
        show = true;
        alpha = 0.22;
      }
      if (!show) continue;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha + 0.08})`;
      ctx.fillStyle = `rgba(160, 200, 255, ${alpha * 0.35})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(x, y, range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
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
    ctx.fillRect(0, 0, CANVAS_W, 52);
    ctx.fillStyle = '#f0e6d2';
    ctx.font = "bold 15px 'Malgun Gothic', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`웨이브 ${this.wave}`, 12, 16);

    ctx.textAlign = 'center';
    const need = killsNeeded(this.wave);
    ctx.fillText(this.bossActive ? '보스 전투 중!' : `처치 ${this.kills} / ${need}`, CANVAS_W / 2, 16);

    ctx.textAlign = 'right';
    ctx.fillText(`점수 ${this.score}`, CANVAS_W - 12, 16);

    // 라인 순 속도 (줄다리기 상태)
    ctx.textAlign = 'center';
    ctx.font = "bold 14px 'Malgun Gothic', sans-serif";
    const v = this.netSpeed;
    if (Math.abs(v) < 0.05) {
      ctx.fillStyle = '#aaa';
      ctx.fillText('라인 ─ 정지', CANVAS_W / 2, 39);
    } else if (v > 0) {
      ctx.fillStyle = '#ff7060';
      ctx.fillText(`라인 ▼ ${v.toFixed(1)}`, CANVAS_W / 2, 39);
    } else {
      ctx.fillStyle = '#6fe08a';
      ctx.fillText(`라인 ▲ ${(-v).toFixed(1)}`, CANVAS_W / 2, 39);
    }
    ctx.restore();
  }
}
