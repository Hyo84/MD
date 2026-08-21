import Matter from 'matter-js';
import {
  CANVAS_W, CANVAS_H, DEFEAT_Y, LINE_START_Y, LAUNCHER_Y,
    BALANCE, UNITS, MONSTERS, HEROES,
    HERO_MISSION_DAMAGE, HERO_MISSION_KILLS, HERO_ASCENSION_ATK_MULT, HERO_ASCENSION_SLOWMO,
    HERO_ASCENSION_REPLACEMENT_TIER, HERO_ASCENSION_BONUS_SCORE,
    LAUNCH_T2_BASE, CHARGE_STUTTER_TIME, MERGE_BLAST_RADIUS, MERGE_BLAST_FORCE,
    FRICTION_AIR_UNIT, killsNeeded, waveMultiplier, effectiveMult,
    LIVE_MULT_STEP, clampLiveMult, PROGRESSION,
} from './config.js';
import { Effects } from './effects.js';
import { meta } from './meta.js';

const { Engine, World, Bodies, Body, Events } = Matter;

const RANGE_MODE_LABELS = ['끄기', '아군만', '전체'];
const ENGINE_DT_CAP_MS = 33.33;
const SLOWMO_SCALE = 0.25;
// Matter Verlet integrates F/m * dt^2. Never feed a px/step impulse through applyForce.
const MERGE_BLAST_MAX_STEP_PX = 24;

function engineStepMs(dt) {
  return Math.min(dt * 1000, ENGINE_DT_CAP_MS);
}

/** Matter 속도는 엔진 스텝당 px. px/초를 이번 스텝 변위로 변환. */
function velFromPxPerSec(pxPerSec, stepMs) {
  return pxPerSec * stepMs / 1000;
}

function colorAlpha(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return `rgba(255,255,255,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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
    this.rangeMode = 1; // 0=끄기, 1=아군만, 2=전체 (재시작 후에도 유지)
    this.liveMult = 1;  // 실시간 난이도 배율 (재시작 후에도 유지)
    this.onLiveMultChange = null;
    this.skillPanelOpen = false;
    this._fx = meta.getEffects();
    this._rangeToggleRect = { x: 0, y: 0, w: 0, h: 0 };
    this._diffMinusRect = { x: 0, y: 0, w: 0, h: 0 };
    this._diffPlusRect = { x: 0, y: 0, w: 0, h: 0 };

    this._setupInput();
    this.ui.restartBtn.addEventListener('click', () => this.start());
    this.ui.startOverlay.addEventListener('pointerdown', () => {
      if (this.skillPanelOpen) return;
      this.start();
    });
    this.onSkillsChanged = () => {
      this._fx = meta.getEffects();
      this._syncDefenseFromMeta(false);
    };
    this._refreshStartMeta();
    meta.onChange(() => this._refreshStartMeta());

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
    this.mergeBlastQueue = [];
    this.occupiedSlots = new Set();  // "row:col"

    this.lineY = LINE_START_Y;       // 웨이브라인 현재 위치
    this.netSpeed = 0;               // HUD 표시용 순 속도 (+아래 / -위)
    this.chargeStutterT = 0;
    this.slowMoT = 0;
    this.ascendFlashT = 0;
    this.shakeT = 0;
    this._stepMs = 1000 / 60;

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
    this.wall = null;
    this.archers = [];
    this.archerShots = [];
    this._fx = meta.getEffects();
    this._syncDefenseFromMeta(true);

    Events.on(this.engine, 'collisionStart', (ev) => this._onCollision(ev));
  }

  _effects() {
    return this._fx || meta.getEffects();
  }

  _refreshStartMeta() {
    if (!this.ui.metaStatus) return;
    this.ui.metaStatus.textContent =
      `레벨 ${meta.level}  ·  XP ${meta.xp} / ${meta.xpNeeded}  ·  포인트 ${meta.skillPoints}`;
  }

  _syncDefenseFromMeta(fresh) {
    const fx = this._effects();
    if (!fx.hasWall) {
      this.wall = null;
      this.archers = [];
      return;
    }
    if (fresh || !this.wall) {
      this.wall = { hp: fx.wallMaxHp, maxHp: fx.wallMaxHp, broken: false };
    } else if (!this.wall.broken) {
      const delta = fx.wallMaxHp - this.wall.maxHp;
      this.wall.maxHp = fx.wallMaxHp;
      if (delta > 0) this.wall.hp = Math.min(this.wall.maxHp, this.wall.hp + delta);
      else this.wall.hp = Math.min(this.wall.hp, this.wall.maxHp);
    }

    if (this.wall.broken || fx.archerCount <= 0) {
      this.archers = [];
      return;
    }

    const n = fx.archerCount;
    if (this.archers.length > n) this.archers.length = n;
    while (this.archers.length < n) {
      this.archers.push({
        ammo: fx.archerAmmo,
        maxAmmo: fx.archerAmmo,
        attackCd: 0.15 + Math.random() * 0.5,
        flashT: 0,
      });
    }
    for (let i = 0; i < this.archers.length; i++) {
      const a = this.archers[i];
      const count = this.archers.length;
      a.x = count <= 1 ? CANVAS_W / 2 : 56 + i * ((CANVAS_W - 112) / (count - 1));
      a.y = DEFEAT_Y - 16;
      const prevMax = a.maxAmmo;
      a.maxAmmo = fx.archerAmmo;
      if (fresh) a.ammo = fx.archerAmmo;
      else if (a.maxAmmo > prevMax) a.ammo = Math.min(a.maxAmmo, a.ammo + (a.maxAmmo - prevMax));
      else a.ammo = Math.min(a.ammo, a.maxAmmo);
    }
  }

  _refillArcherAmmo() {
    const ammo = this._effects().archerAmmo;
    for (const a of this.archers) {
      a.maxAmmo = ammo;
      a.ammo = ammo;
    }
  }

  _grantScore(n) {
    this.score += n;
    this._addRunXp(n);
  }

  _addRunXp(n) {
    const { levelsGained, newLevel } = meta.addXp(n);
    if (levelsGained > 0 && this.effects) {
      this.effects.floatText(CANVAS_W / 2, 210, `레벨 업! Lv.${newLevel}`, '#FFD700', 28, 2.0);
    }
  }

  _unitStop(u) {
    return this._unitStat(u).stop * this._effects().stopMult;
  }

  _launchCooldown() {
    return this._effects().launchCooldown;
  }

  start() {
    const panel = document.getElementById('skillPanel');
    if (panel) panel.classList.add('hidden');
    this.skillPanelOpen = false;
    this._reset();
    this.state = 'playing';
    this.ui.startOverlay.classList.add('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
  }

  _gameOver() {
    this.state = 'gameover';
    this.ui.finalScore.textContent =
      `점수: ${this.score} · 웨이브 ${this.wave} · 레벨 ${meta.level}`;
    this.ui.gameoverOverlay.classList.remove('hidden');
  }

  _rollTier() {
    const fx = this._effects();
    const r = Math.random();
    if (fx.t3Chance > 0 && r < fx.t3Chance) return 3;
    if (r < fx.t3Chance + LAUNCH_T2_BASE + fx.t2Bonus) return 2;
    return 1;
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
      const p = toCanvas(e);
      if (this._hitRect(p, this._rangeToggleRect)) {
        this.rangeMode = (this.rangeMode + 1) % RANGE_MODE_LABELS.length;
        return;
      }
      if (this._hitRect(p, this._diffMinusRect)) {
        this.adjustLiveMult(-LIVE_MULT_STEP);
        return;
      }
      if (this._hitRect(p, this._diffPlusRect)) {
        this.adjustLiveMult(LIVE_MULT_STEP);
        return;
      }
      if (this.skillPanelOpen) return;
      if (this.state !== 'playing') return;
      this.dragging = true;
      this.aimX = clampAimX(p.x);
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toCanvas(e);
      this.mouse = p;
      if (this.skillPanelOpen || this.state !== 'playing') return;
      if (!this.dragging) {
        if (this._hitRect(p, this._rangeToggleRect)) return;
        if (this._hitRect(p, this._diffMinusRect)) return;
        if (this._hitRect(p, this._diffPlusRect)) return;
      }
      this.aimX = clampAimX(p.x);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.aimX = clampAimX(toCanvas(e).x);
      if (this.skillPanelOpen || this.state !== 'playing' || this.launchCd > 0) return;
      this._launchUnit();
    });
    this.canvas.addEventListener('pointercancel', () => { this.dragging = false; });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === '+' || e.key === '=' || e.key === ']' || e.code === 'NumpadAdd') {
          this.adjustLiveMult(LIVE_MULT_STEP);
          e.preventDefault();
        } else if (e.key === '-' || e.key === '_' || e.key === '[' || e.code === 'NumpadSubtract') {
          this.adjustLiveMult(-LIVE_MULT_STEP);
          e.preventDefault();
        }
      });
    }
  }

  setLiveMult(v) {
    const next = clampLiveMult(v);
    if (next === this.liveMult) return this.liveMult;
    this._rescaleEnemiesForLiveMult(next);
    this.liveMult = next;
    if (this.state === 'playing' && this.effects) {
      this.effects.floatText(CANVAS_W / 2, 72, `난이도 ×${next.toFixed(1)}`, '#ffd27a', 16, 0.7);
    }
    this.onLiveMultChange?.();
    return this.liveMult;
  }

  adjustLiveMult(delta) {
    return this.setLiveMult(this.liveMult + delta);
  }

  _rescaleEnemiesForLiveMult(next) {
    for (const m of this.enemies) {
      if (m.dead) continue;
      const ratio = m.maxHp > 0 ? m.hp / m.maxHp : 1;
      const maxHp = Math.max(1, Math.round(MONSTERS[m.key].hp * m.waveMult * next));
      m.maxHp = maxHp;
      m.hp = Math.max(1, Math.round(maxHp * ratio));
      if (m.hp > m.maxHp) m.hp = m.maxHp;
    }
  }

  _enemyAtk(m) {
    return MONSTERS[m.key].atk * m.waveMult * this.liveMult;
  }

  _launchUnit() {
    const u = this._spawnUnit(this.currentTier, this.aimX, LAUNCHER_Y);
    const stepMs = this._stepMs || (1000 / 60);
    Body.setVelocity(u.body, { x: 0, y: -velFromPxPerSec(BALANCE.launchSpeed, stepMs) });
    this.launchCd = this._launchCooldown();
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
      settled: false, age: 0, engaged: false,
      flashT: 0, abilityT: 0,
      heroType,
      missionDamage: 0,
      targetDamage: heroType ? HERO_MISSION_DAMAGE : 0,
      targetKills: heroType ? HERO_MISSION_KILLS : 0,
      firstHit: false,
      valkTick: 0,
    };
    this.units.push(u);
    this.unitByBodyId.set(body.id, u);
    return u;
  }

  // 반지름 기반 스폰 위치 탐색: 기존 적(보스 포함)과 원이 겹치지 않는 빈 슬롯
  _findSpawnSpot(radius, exclude = null) {
    for (let row = 0; row < 30; row++) {
      const candidates = [];
      for (let col = 0; col < SLOT_COLS; col++) {
        if (this.occupiedSlots.has(`${row}:${col}`)) continue;
        const x = slotX(col) + (Math.random() * 14 - 7);
        const y = this.lineY - row * SLOT_ROW_H;
        let overlaps = false;
        for (const m of this.enemies) {
          if (m === exclude) continue;
          const mr = MONSTERS[m.key].r;
          if (Math.hypot(m.x - x, m.y - y) < radius + mr + 2) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps) candidates.push({ row, col, x });
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return null;
  }

  _spawnEnemy(key) {
    const stat = MONSTERS[key];
    const isBoss = !!stat.isBoss;
    let row = 0, col = -1, x = CANVAS_W / 2;
    if (!isBoss) {
      const spot = this._findSpawnSpot(stat.r);
      if (spot) {
        row = spot.row;
        col = spot.col;
        x = spot.x;
      } else {
        // 보드가 극단적으로 가득 찬 경우: 겹침을 무시하고 빈 슬롯 사용
        for (let r2 = 0; r2 < 30 && col < 0; r2++) {
          for (let c2 = 0; c2 < SLOT_COLS; c2++) {
            if (!this.occupiedSlots.has(`${r2}:${c2}`)) { row = r2; col = c2; break; }
          }
        }
        x = slotX(Math.max(0, col)) + (Math.random() * 14 - 7);
      }
      this.occupiedSlots.add(`${row}:${col}`);
    }
    // 실효 배율 = 웨이브 곡선 × 실시간 수동 배율 (HP는 스냅샷, ATK/라인속도는 liveMult 즉시 반영)
    const waveMult = waveMultiplier(this.wave);
    const hp = Math.round(stat.hp * effectiveMult(this.wave, this.liveMult));
    const m = {
      key, isBoss, row, col, x,
      y: this.lineY - row * SLOT_ROW_H,
      hp, maxHp: hp, waveMult,
      attackCd: Math.random() * 0.4,
      stunT: 0, burn: null, flashT: 0, dead: false,
    };
    this.enemies.push(m);

    // 보스 착지 시 이미 그 자리에 있던 적들을 겹치지 않는 슬롯으로 밀어냄
    if (isBoss) {
      for (const other of this.enemies) {
        if (other === m) continue;
        const or2 = MONSTERS[other.key].r;
        if (Math.hypot(other.x - m.x, other.y - m.y) < stat.r + or2 + 2) {
          this.occupiedSlots.delete(`${other.row}:${other.col}`);
          const spot = this._findSpawnSpot(or2, other);
          if (spot) {
            other.row = spot.row;
            other.col = spot.col;
            other.x = spot.x;
            other.y = this.lineY - spot.row * SLOT_ROW_H;
          }
          this.occupiedSlots.add(`${other.row}:${other.col}`);
        }
      }
    }

    this.effects.burst(m.x, m.y, stat.color, 8, 2.5, 2.5);
    return m;
  }

  _removeUnit(u) {
    if (!u || u.dead) return;
    u.dead = true;
    u.isMerging = false;
    World.remove(this.engine.world, u.body);
    this.unitByBodyId.delete(u.body.id);
    const i = this.units.indexOf(u);
    if (i >= 0) this.units.splice(i, 1);
  }

  _unitFromBody(body) {
    if (!body) return null;
    return this.unitByBodyId.get(body.id)
      || (body.parent ? this.unitByBodyId.get(body.parent.id) : null)
      || null;
  }

  _clampFriendlyPos(x, y, r) {
    const minY = this.lineY + 14 + r;
    const maxY = Math.max(minY, DEFEAT_Y - 30);
    const minX = r + 4;
    const maxX = CANVAS_W - r - 4;
    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
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
      const a = this._unitFromBody(pair.bodyA);
      const b = this._unitFromBody(pair.bodyB);
      if (!a || !b || a === b) continue;
      if (a.dead || b.dead || a.isMerging || b.isMerging) continue;
      if (a.tier !== b.tier || a.tier >= 10) continue;
      a.isMerging = true;
      b.isMerging = true;
      this.mergeQueue.push([a, b]);
    }
  }

  _processMerges() {
    const consumed = new Set();
    for (const [a, b] of this.mergeQueue) {
      const aOk = a && !a.dead && !consumed.has(a);
      const bOk = b && !b.dead && !consumed.has(b);
      if (!aOk || !bOk) {
        if (aOk) a.isMerging = false;
        if (bOk) b.isMerging = false;
        continue;
      }
      // One body participates in at most one merge per flush.
      consumed.add(a);
      consumed.add(b);

      const newTier = a.tier + 1;
      const r = UNITS[newTier - 1].r;
      const pos = this._clampFriendlyPos(
        (a.body.position.x + b.body.position.x) / 2,
        (a.body.position.y + b.body.position.y) / 2,
        r,
      );

      this._removeUnit(a);
      this._removeUnit(b);

      if (newTier === 10) {
        const hero = this._summonHero(pos.x, pos.y);
        this._applyMergeShock(pos.x, pos.y, hero);
        this.mergeBlastQueue.push({ x: pos.x, y: pos.y, exclude: hero });
      } else {
        // 합성 유닛은 발사 관성이 없으므로 즉시 전진 가능
        const spawned = this._spawnUnit(newTier, pos.x, pos.y);
        spawned.settled = true;
        this.effects.burst(pos.x, pos.y, UNITS[newTier - 1].color, 18, 4, 3.5);
        this.effects.floatText(pos.x, pos.y - 30, UNITS[newTier - 1].name, '#fff', 15, 0.9);
        this._applyMergeShock(pos.x, pos.y, spawned);
        this.mergeBlastQueue.push({ x: pos.x, y: pos.y, exclude: spawned });
      }
      this._grantScore(newTier * 5);
    }
    this.mergeQueue.length = 0;
    for (const u of this.units) {
      if (u.isMerging) u.isMerging = false;
    }
  }

  _applyMergeShock(x, y, unit) {
    const shock = this._effects().mergeShock;
    if (!shock) return;
    this.effects.burst(x, y, '#ffcc66', 14, 3.6, 3);
    for (const m of [...this.enemies]) {
      if (m.dead) continue;
      if (Math.hypot(m.x - x, m.y - y) <= shock.radius + MONSTERS[m.key].r) {
        this._damageEnemy(m, shock.dmg);
      }
    }
    if (shock.knockback > 0) {
      this.lineY = Math.max(LINE_START_Y, this.lineY - shock.knockback);
      for (const m of this.enemies) m.y = this.lineY - m.row * SLOT_ROW_H;
    }
    if (unit && !unit.dead && shock.healPct > 0) {
      unit.hp = Math.min(unit.maxHp, unit.hp + unit.maxHp * shock.healPct);
    }
  }

  _summonHero(x, y) {
    const types = Object.keys(HEROES);
    const type = types[Math.floor(Math.random() * types.length)];
    const pos = this._clampFriendlyPos(x, y, UNITS[9].r);
    const hero = this._spawnUnit(10, pos.x, pos.y, type);
    hero.settled = true;
    this.effects.burst(x, y, '#FF4500', 40, 6, 5);
    this.effects.burst(x, y, '#FFD700', 30, 4.5, 4);
    this.effects.floatText(CANVAS_W / 2, 300, `영웅 소환! ${HEROES[type].name}`, '#FFD700', 28, 2.0);
    return hero;
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
        this.effects.floatText(CANVAS_W / 2, 330, '보스 출현! 병력 집결!', '#FF9040', 26, 2.0);
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
    this._grantScore(stat.score);
    this.effects.burst(m.x, m.y, stat.color, 12, 3, 3);
    this.effects.floatText(m.x, m.y - 20, `+${stat.score}`, '#ffd', 13, 0.7);
    if (m.isBoss) {
      const bonus = Math.round(PROGRESSION.bossXpPerWave * this.wave);
      this._addRunXp(bonus);
      this.effects.floatText(CANVAS_W / 2, 360, `보스 XP +${bonus}`, '#ffd27a', 18, 1.4);
      this.bossActive = false;
      this.bossPending = false;
      this.wave += 1;
      this.kills = 0;
      this._refillArcherAmmo();
      this.effects.floatText(CANVAS_W / 2, 300, `웨이브 ${this.wave} 시작!`, '#7CFC00', 26, 2.0);
    } else {
      this.kills += 1;
    }
    this._removeEnemy(m);
  }

  _damageEnemy(m, dmg, source = null) {
    if (m.dead) return 0;
    const dealt = Math.min(Math.max(0, dmg), m.hp);
    m.hp -= dmg;
    m.flashT = 0.12;
    if (source && source.heroType && !source.dead) {
      source.missionDamage = (source.missionDamage || 0) + dealt;
    }
    if (m.hp <= 0) this._onEnemyKilled(m);
    return dealt;
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

  // 프레임당 1회 교전 여부 계산 (라인 속도 계산과 전진 로직이 공유)
  _computeEngagement() {
    for (const u of this.units) {
      u.engaged = this.enemies.length > 0 && this._unitEngaged(u);
    }
  }

  // 전열: 라인 홀드 위치(근접 클리어런스) 근처의 정착 유닛
  _unitCanPushEmptyLine(u) {
    if (u.dead || !u.settled) return false;
    const holdY = this.lineY + 20 + u.r;
    return u.body.position.y <= holdY + BALANCE.emptyLinePushSlack;
  }

  _updateLine(dt) {
    this.chargeStutterT = Math.max(0, (this.chargeStutterT || 0) - dt);
    // 돌격 저지력: firstHit 동안 라인 순속도 0 (빈 라인 푸시 포함)
    if (this.chargeStutterT > 0) {
      this.netSpeed = 0;
      for (const m of this.enemies) m.y = this.lineY - m.row * SLOT_ROW_H;
      return;
    }
    // 적이 없으면 전열 아군 저지력으로 시작 위치까지 밀어올림 (보스 대기 중에도 동일)
    if (this.enemies.length === 0) {
      let stopping = 0;
      for (const u of this.units) {
        if (this._unitCanPushEmptyLine(u)) stopping += this._unitStop(u);
      }
      stopping *= BALANCE.emptyLinePushScale;
      this.netSpeed = -stopping;
      this.lineY += this.netSpeed * dt;
      if (this.lineY <= LINE_START_Y) {
        this.lineY = LINE_START_Y;
        this.netSpeed = 0;
      }
      return;
    }
    let advance = BALANCE.baseLineSpeed;
    for (const m of this.enemies) {
      if (m.stunT <= 0) advance += MONSTERS[m.key].speed * this.liveMult;
    }
    let stopping = 0;
    for (const u of this.units) {
      if (u.engaged) stopping += this._unitStop(u);
    }
    this.netSpeed = advance - stopping;
    this.lineY += this.netSpeed * dt;
    if (this.lineY < LINE_START_Y) this.lineY = LINE_START_Y;
    if (this.lineY >= DEFEAT_Y) {
      if (this._tryWallBlock()) {
        // 밀치기 적용됨. 적 위치는 아래에서 갱신
      } else {
        this.lineY = DEFEAT_Y;
        this._gameOver();
        return;
      }
    }
    // 적 위치를 라인에 맞춰 갱신 (뒤 열은 라인 위쪽으로 적층)
    for (const m of this.enemies) {
      m.y = this.lineY - m.row * SLOT_ROW_H;
    }
  }

  // 방어벽: 마지노선 접촉 시 1회 충격. HP가 0이 되면 그 충격의 밀치기는 적용되고 벽은 파괴.
  // 파괴된 뒤 다음 접촉은 게임오버.
  _tryWallBlock() {
    if (!this.wall || this.wall.broken || this.wall.hp <= 0) return false;
    const kb = this._effects().wallKnockback;
    this.wall.hp -= PROGRESSION.wallDmgPerHit;
    this.effects.lineFlash(DEFEAT_Y, '#c9e4ff');
    this.effects.floatText(CANVAS_W / 2, DEFEAT_Y - 36, '방어벽!', '#c9e4ff', 18, 0.8);
    if (this.wall.hp <= 0) {
      this.wall.hp = 0;
      this.wall.broken = true;
      this.archers = [];
      this.effects.burst(CANVAS_W / 2, DEFEAT_Y, '#8899aa', 28, 4, 4);
      this.effects.floatText(CANVAS_W / 2, DEFEAT_Y - 58, '방어벽 파괴', '#ff8080', 20, 1.4);
    }
    this.lineY = Math.max(LINE_START_Y, DEFEAT_Y - kb);
    return true;
  }

  // ---------- 아군 유닛: 착지 후 전진, 실제 교전 시(사거리 내 적) 정지 ----------
  _updateUnitAdvance(dt) {
    const stepMs = this._stepMs || engineStepMs(dt);
    const advTick = velFromPxPerSec(BALANCE.unitAdvanceSpeed * this._effects().advanceMult, stepMs);
    for (const u of this.units) {
      u.age += dt;
      // 발사 관성이 소진되면 정착 → 전진 시작
      if (!u.settled && (u.age > 2.5 || (u.age > 0.4 && u.body.speed < 2))) {
        u.settled = true;
      }
      const pos = u.body.position;
      // 모든 유닛은 근접 파이터: 사거리와 무관하게 라인 바로 앞까지 전진
      // (사거리는 공격 도달 거리로만 사용 — 전진 중에도 사거리 내 적을 공격)
      const minHoldY = this.lineY + 20 + u.r;
      if (pos.y <= minHoldY) {
        if (u.body.velocity.y < 0) {
          Body.setVelocity(u.body, { x: u.body.velocity.x, y: 0 });
        }
      } else if (u.settled) {
        Body.setVelocity(u.body, { x: u.body.velocity.x * 0.9, y: -advTick });
      }
    }
  }

  // ---------- 보스 집결: 교전하지 않는 유닛이 보스 쪽으로 이동 ----------
  _updateBossGather(dt) {
    const strength = Math.max(0, Math.min(1, BALANCE.bossGatherStrength));
    if (strength <= 0) return;
    const boss = this.enemies.find((m) => m.isBoss);
    if (!boss) return;

    const engagedAlsoGather = strength > 0.7;
    const stepMs = this._stepMs || engineStepMs(dt);
    const maxVxTick = velFromPxPerSec(BALANCE.gatherSpeed * strength, stepMs);

    for (const u of this.units) {
      if (!u.settled) continue;
      if (!engagedAlsoGather && u.engaged) continue;
      const dx = boss.x - u.body.position.x;
      if (Math.abs(dx) < 24) continue; // 보스 열 근처면 정지
      const vx = Math.sign(dx) * maxVxTick;
      Body.setVelocity(u.body, { x: vx, y: u.body.velocity.y });
    }
  }

  // ---------- 하드 불변식: 어떤 이유로든 아군이 라인을 넘지 못함 ----------
  _enforceLineBoundary() {
    for (const u of this.units) {
      const minY = this.lineY + 14 + u.r;
      const minX = u.r + 4;
      const maxX = CANVAS_W - u.r - 4;
      let x = u.body.position.x;
      let y = u.body.position.y;
      let vx = u.body.velocity.x;
      let vy = u.body.velocity.y;
      let moved = false;
      if (y < minY) {
        y = minY;
        if (vy < 0) vy = 0;
        moved = true;
      }
      if (x < minX) {
        x = minX;
        if (vx < 0) vx = 0;
        moved = true;
      } else if (x > maxX) {
        x = maxX;
        if (vx > 0) vx = 0;
        moved = true;
      }
      if (moved) {
        Body.setPosition(u.body, { x, y });
        Body.setVelocity(u.body, { x: vx, y: vy });
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
        if (d < HEROES.jeanne.auraRadius) return true;
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
      if (this._jeanneBuffed(u)) dmg *= HEROES.jeanne.damageBuff;
      this.effects.hitFlash(target.x, target.y, '#fff');

      // 티어 특수 능력
      const sp = stat.special;
      if (u.tier === 5 && sp) {
        for (const m2 of [...this.enemies]) {
          if (m2 !== target && !m2.dead && Math.hypot(m2.x - target.x, m2.y - target.y) < sp.cleaveRadius) {
            this._damageEnemy(m2, dmg * sp.cleaveMult, u);
          }
        }
      }
      if (u.tier === 6 && sp && Math.random() < sp.stunChance && !target.dead) {
        target.stunT = Math.max(target.stunT, sp.stunDuration);
        this.effects.floatText(target.x, target.y - 24, '기절!', '#87CEFA', 12, 0.5);
      }
      if (u.tier === 8 && sp && !target.dead) {
        target.burn = { dps: stat.atk * sp.burnAtkFrac, t: sp.burnDuration };
      }
      if (!target.dead) this._damageEnemy(target, dmg, u);
      this._checkHeroMission(u);
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
      target.hp -= this._enemyAtk(m);
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

      const sp = stat.special;
      // T7 성기사: 주기마다 주변 아군 회복
      if (u.tier === 7 && sp && u.abilityT >= sp.healPeriod) {
        u.abilityT = 0;
        for (const a of this.units) {
          if (a.dead || a === u) continue;
          const d = Math.hypot(
            a.body.position.x - u.body.position.x,
            a.body.position.y - u.body.position.y,
          );
          if (d < sp.healRadius && a.hp < a.maxHp) {
            a.hp = Math.min(a.maxHp, a.hp + a.maxHp * sp.healPct);
            this.effects.burst(a.body.position.x, a.body.position.y - a.r, '#7CFC00', 3, 1.5, 2);
          }
        }
      }

      // T9 대원수: 주기마다 사거리 내 광역 충격파
      if (u.tier === 9 && sp && u.abilityT >= sp.shockPeriod) {
        u.abilityT = 0;
        this.effects.burst(u.body.position.x, u.body.position.y, '#9370DB', 24, 5.5, 3.5);
        for (const m of [...this.enemies]) {
          if (m.dead) continue;
          const d = Math.hypot(m.x - u.body.position.x, m.y - u.body.position.y);
          if (d < stat.range) this._damageEnemy(m, stat.atk * sp.shockAtkFrac, u);
        }
      }

      // T10 영웅 (수명 타이머 없음 — 사명 쿼터 또는 HP 사망)
      if (u.heroType) {
        const hero = HEROES[u.heroType];
        if (u.heroType === 'arthur' && u.abilityT >= hero.period) {
          u.abilityT = 0;
          this.effects.lineFlash(this.lineY, '#9be7ff');
          for (const m of [...this.enemies]) {
            if (!m.dead) this._damageEnemy(m, stat.atk * hero.atkFrac, u);
          }
          this._checkHeroMission(u);
        }
        if (u.heroType === 'valkyrie') {
          u.valkTick += dt;
          if (u.valkTick >= hero.tick) {
            u.valkTick = 0;
            for (const m of [...this.enemies]) {
              if (m.dead) continue;
              const d = Math.hypot(m.x - u.body.position.x, m.y - u.body.position.y);
              if (d < stat.range) this._damageEnemy(m, stat.atk * hero.atkFrac, u);
            }
            this._checkHeroMission(u);
          }
        }
      }
    }
  }

  _unitNearFront(u) {
    const holdY = this.lineY + 20 + u.r;
    return u.body.position.y <= holdY + PROGRESSION.regenNearSlack;
  }

  _updateRegen(dt) {
    const pct = this._effects().regenPct;
    if (pct <= 0) return;
    for (const u of this.units) {
      if (u.dead || u.hp >= u.maxHp) continue;
      if (!u.engaged && !this._unitNearFront(u)) continue;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * pct * dt);
    }
  }

  _updateArchers(dt) {
    for (const shot of this.archerShots) shot.life -= dt;
    this.archerShots = this.archerShots.filter((s) => s.life > 0);
    const fx = this._effects();
    if (!this.wall || this.wall.broken || fx.archerCount <= 0) return;

    for (const a of this.archers) {
      a.flashT = Math.max(0, a.flashT - dt);
      a.attackCd -= dt;
      if (a.ammo <= 0 || a.attackCd > 0) continue;
      let target = null;
      let best = Infinity;
      for (const m of this.enemies) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - a.x, m.y - a.y);
        if (d <= fx.archerRange && d < best) {
          best = d;
          target = m;
        }
      }
      if (!target) continue;
      a.attackCd = PROGRESSION.archerInterval;
      a.ammo -= 1;
      a.flashT = 0.1;
      this._damageEnemy(target, fx.archerAtk);
      this.archerShots.push({
        x1: a.x, y1: a.y - 8,
        x2: target.x, y2: target.y,
        life: 0.12,
      });
    }
  }

  _checkHeroMission(u) {
    if (!u || u.dead || !u.heroType || u._ascending) return;
    const quota = u.targetDamage || HERO_MISSION_DAMAGE;
    if ((u.missionDamage || 0) >= quota) this._ascendHero(u);
  }

  _ascendHero(hero) {
    if (!hero || hero.dead || hero._ascending) return;
    hero._ascending = true;
    const x = hero.body.position.x;
    const y = hero.body.position.y;
    const blast = this._unitStat(hero).atk * HERO_ASCENSION_ATK_MULT;

    this.slowMoT = HERO_ASCENSION_SLOWMO;
    this.ascendFlashT = HERO_ASCENSION_SLOWMO;
    this.shakeT = Math.max(this.shakeT || 0, 0.22);

    for (const m of [...this.enemies]) {
      if (!m.dead) this._damageEnemy(m, blast);
    }

    this.lineY = LINE_START_Y;
    this.netSpeed = 0;
    for (const m of this.enemies) m.y = this.lineY - m.row * SLOT_ROW_H;

    this.effects.burst(x, y, '#FFD700', 40, 7, 5);
    this.effects.burst(x, y, '#fff8dc', 24, 5, 4);
    this.effects.floatText(x, y - 40, '명예로운 승천!', '#FFD700', 22, 1.6);
    this._grantScore(HERO_ASCENSION_BONUS_SCORE);

    this._removeUnit(hero);

    const t5 = UNITS[HERO_ASCENSION_REPLACEMENT_TIER - 1];
    const spawn = this._clampFriendlyPos(x, y, t5.r);
    const knight = this._spawnUnit(HERO_ASCENSION_REPLACEMENT_TIER, spawn.x, spawn.y);
    knight.settled = true;
  }

  _updateChargeHits() {
    for (const u of this.units) {
      if (u.dead || u.settled || u.firstHit) continue;
      const { x, y } = u.body.position;
      let hit = false;
      for (const m of this.enemies) {
        if (m.dead) continue;
        if (Math.hypot(m.x - x, m.y - y) <= u.r + MONSTERS[m.key].r) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;
      u.firstHit = true;
      this.chargeStutterT = CHARGE_STUTTER_TIME;
      this.shakeT = Math.max(this.shakeT || 0, 0.12);
      this.effects.hitFlash(x, y, '#ffe8a0');
    }
  }

  _clampBlastVelocity(u, vx, vy) {
    const minY = this.lineY + 14 + u.r;
    const minX = u.r + 4;
    const maxX = CANVAS_W - u.r - 4;
    const maxY = CANVAS_H - u.r - 4;
    const { x, y } = u.body.position;
    if (vy < 0) {
      const room = y - minY;
      vy = room <= 0 ? 0 : Math.max(vy, -room);
    } else if (vy > 0) {
      const room = maxY - y;
      vy = room <= 0 ? 0 : Math.min(vy, room);
    }
    if (vx < 0) {
      const room = x - minX;
      vx = room <= 0 ? 0 : Math.max(vx, -room);
    } else if (vx > 0) {
      const room = maxX - x;
      vx = room <= 0 ? 0 : Math.min(vx, room);
    }
    return { x: vx, y: vy };
  }

  _applyMergeBlasts() {
    if (!this.mergeBlastQueue.length) return;
    const stepMs = this._stepMs || (1000 / 60);
    const maxImpulse = Math.min(velFromPxPerSec(MERGE_BLAST_FORCE, stepMs), MERGE_BLAST_MAX_STEP_PX);
    for (const blast of this.mergeBlastQueue) {
      for (const u of this.units) {
        if (u.dead || u.isMerging || u === blast.exclude) continue;
        const dx = u.body.position.x - blast.x;
        const dy = u.body.position.y - blast.y;
        const dist = Math.hypot(dx, dy);
        if (dist > MERGE_BLAST_RADIUS || dist < 0.001) continue;
        const mag = maxImpulse * (1 - dist / MERGE_BLAST_RADIUS);
        const nx = dx / dist;
        const ny = dy / dist;
        const vel = Body.getVelocity(u.body);
        Body.setVelocity(u.body, this._clampBlastVelocity(u, vel.x + nx * mag, vel.y + ny * mag));
      }
    }
    this.mergeBlastQueue.length = 0;
  }

  // ---------- 메인 루프 ----------
  _loop(now) {
    const rawDt = Math.min((now - this._lastTime) / 1000, 0.05);
    this._lastTime = now;

    if (this.slowMoT > 0) this.slowMoT = Math.max(0, this.slowMoT - rawDt);
    if (this.ascendFlashT > 0) this.ascendFlashT = Math.max(0, this.ascendFlashT - rawDt);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - rawDt);

    const dt = rawDt * (this.slowMoT > 0 ? SLOWMO_SCALE : 1);
    if (this.state === 'playing') this._update(dt);
    this._draw();

    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    this._fx = meta.getEffects();
    this.launchCd = Math.max(0, this.launchCd - dt);

    // Matter 속도는 스텝당 px. 이번 엔진 스텝과 같은 stepMs로 px/초를 변환한다.
    this._stepMs = engineStepMs(dt);
    Engine.update(this.engine, this._stepMs);
    this._processMerges();
    this._updateSpawning(dt);
    this._computeEngagement();
    this._updateChargeHits();
    this._updateLine(dt);
    if (this.state !== 'playing') return;
    this._updateUnitAdvance(dt);
    this._updateBossGather(dt);
    this._updateCombat(dt);
    this._updateRegen(dt);
    this._updateArchers(dt);
    this._updateEnemyTicks(dt);
    this._updateUnitAbilities(dt);
    this._applyMergeBlasts();
    this._enforceLineBoundary();
    this.effects.update(dt);

    for (const u of this.units) {
      u.flashT = Math.max(0, u.flashT - dt);
    }
  }

  // ---------- 렌더링 ----------
  _draw() {
    this._fx = meta.getEffects();
    const ctx = this.ctx;
    const shaking = (this.shakeT || 0) > 0;
    if (shaking) {
      ctx.save();
      const mag = 3.2 * Math.min(1, this.shakeT / 0.12);
      ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
    }

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

    // 마지노선 (빛나는 빨간 점선) + 해금된 방어벽
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
    this._drawWall();

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

    // 사거리 외곽선 (끄기 / 아군만 / 전체)
    if (this.rangeMode !== 0) this._drawRangeIndicators();

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
        const quota = u.targetDamage || HERO_MISSION_DAMAGE;
        const t = quota > 0 ? Math.min(1, (u.missionDamage || 0) / quota) : 0;
        const gw = u.r * 2.2;
        const gx = x - gw / 2;
        const gy = y - u.r - 20;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(gx, gy, gw, 5);
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(gx, gy, gw * t, 5);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.65)';
        ctx.lineWidth = 1;
        ctx.strokeRect(gx, gy, gw, 5);
        ctx.fillStyle = 'rgba(255, 230, 140, 0.9)';
        ctx.font = "9px 'Malgun Gothic', sans-serif";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('사명', x, gy - 1);
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
        ctx.arc(h.body.position.x, h.body.position.y, HEROES.jeanne.auraRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    this._drawArchers();

    // 발사 대기 유닛 + 다음 유닛
    if (this.state === 'playing') {
      const stat = UNITS[this.currentTier - 1];
      const ready = this.launchCd <= 0;
      const maxCd = Math.max(0.001, this._launchCooldown());
      ctx.save();
      ctx.globalAlpha = ready ? 1 : 0.38;
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

      // 발사 쿨다운 바 (플레이어용)
      const barW = 44;
      const barH = 5;
      const bx = this.aimX - barW / 2;
      const by = LAUNCHER_Y + stat.r + 8;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = ready ? '#6fe08a' : '#e8c878';
      ctx.fillRect(bx, by, barW * (ready ? 1 : 1 - this.launchCd / maxCd), barH);
      ctx.restore();

      const nstat = UNITS[this.nextTier - 1];
      ctx.save();
      ctx.globalAlpha = ready ? 0.85 : 0.4;
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

    if (shaking) ctx.restore();

    this._drawHud();

    if ((this.ascendFlashT || 0) > 0) {
      const a = Math.max(0, this.ascendFlashT / HERO_ASCENSION_SLOWMO);
      ctx.fillStyle = `rgba(255, 215, 0, ${a * 0.28})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.38})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }

  _drawWall() {
    if (!this.wall || this.wall.broken) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(70, 82, 96, 0.85)';
    ctx.fillRect(0, DEFEAT_Y - 7, CANVAS_W, 14);
    ctx.strokeStyle = '#c5d0dc';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#9ec0e8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, DEFEAT_Y);
    ctx.lineTo(CANVAS_W, DEFEAT_Y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const ratio = this.wall.maxHp > 0 ? this.wall.hp / this.wall.maxHp : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(40, DEFEAT_Y + 10, CANVAS_W - 80, 6);
    ctx.fillStyle = ratio > 0.35 ? '#8ec8ff' : '#ff8866';
    ctx.fillRect(40, DEFEAT_Y + 10, (CANVAS_W - 80) * ratio, 6);
    ctx.fillStyle = '#dce8f4';
    ctx.font = "11px 'Malgun Gothic', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`방어벽 ${this.wall.hp} / ${this.wall.maxHp}`, CANVAS_W / 2, DEFEAT_Y + 18);
    ctx.restore();
  }

  _drawArchers() {
    const ctx = this.ctx;
    for (const shot of this.archerShots) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, shot.life / 0.12);
      ctx.strokeStyle = '#e8ff9a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(shot.x1, shot.y1);
      ctx.lineTo(shot.x2, shot.y2);
      ctx.stroke();
      ctx.restore();
    }
    if (!this.wall || this.wall.broken || this.archers.length === 0) return;
    for (const a of this.archers) {
      ctx.save();
      ctx.fillStyle = a.flashT > 0 ? '#fff' : (a.ammo > 0 ? '#6b8f3c' : '#4a4a40');
      ctx.strokeStyle = '#2a3a18';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f0e6d2';
      ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('궁', a.x, a.y + 1);
      ctx.fillStyle = a.ammo > 0 ? '#e8ff9a' : '#ff8080';
      ctx.font = "10px 'Malgun Gothic', sans-serif";
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${a.ammo}/${a.maxAmmo}`, a.x, a.y - 13);
      ctx.restore();
    }
  }

  _drawRangeIndicators() {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1.25;
    ctx.setLineDash([]);
    if (this.rangeMode >= 1) {
      for (const u of this.units) {
        const { x, y } = u.body.position;
        ctx.strokeStyle = colorAlpha(u.color, 0.7);
        ctx.beginPath();
        ctx.arc(x, y, this._unitStat(u).range, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.wall && !this.wall.broken) {
        const range = this._effects().archerRange;
        for (const a of this.archers) {
          ctx.strokeStyle = 'rgba(180, 210, 140, 0.45)';
          ctx.beginPath();
          ctx.arc(a.x, a.y, range, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    if (this.rangeMode === 2) {
      for (const m of this.enemies) {
        const stat = MONSTERS[m.key];
        ctx.strokeStyle = colorAlpha(stat.color, 0.65);
        ctx.beginPath();
        ctx.arc(m.x, m.y, stat.r + BALANCE.enemyReach, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _hitRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
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

  _drawHudChip(bx, by, bw, bh, label, fill, stroke) {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8dcc0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
  }

  _drawHud() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, 0, CANVAS_W, 70);
    ctx.fillStyle = '#f0e6d2';
    ctx.font = "bold 15px 'Malgun Gothic', sans-serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`웨이브 ${this.wave}`, 12, 14);

    // 웨이브 배율 × 수동 배율 + 난이도 조절 버튼
    ctx.font = "11px 'Malgun Gothic', sans-serif";
    const waveM = waveMultiplier(this.wave);
    const waveLabel = `웨이브 ×${waveM.toFixed(2)}`;
    ctx.fillStyle = '#b0a284';
    ctx.textAlign = 'left';
    ctx.fillText(waveLabel, 12, 36);
    const liveLabel = `×${this.liveMult.toFixed(1)}`;
    const liveX = 12 + ctx.measureText(waveLabel).width + 5;
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(liveLabel, liveX, 36);
    const btnSize = 18;
    const btnGap = 4;
    const btnY = 27;
    const btnX = liveX + ctx.measureText(liveLabel).width + 7;
    ctx.font = "bold 14px sans-serif";
    this._drawHudChip(btnX, btnY, btnSize, btnSize, '−', 'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)');
    this._drawHudChip(btnX + btnSize + btnGap, btnY, btnSize, btnSize, '+', 'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)');
    this._diffMinusRect = { x: btnX - 2, y: btnY - 2, w: btnSize + 2, h: btnSize + 4 };
    this._diffPlusRect = { x: btnX + btnSize + btnGap, y: btnY - 2, w: btnSize + 2, h: btnSize + 4 };

    ctx.textAlign = 'center';
    const need = killsNeeded(this.wave);
    ctx.fillStyle = '#b0a284';
    ctx.font = "11px 'Malgun Gothic', sans-serif";
    ctx.fillText(this.bossActive ? '보스 전투 중!' : `처치 ${this.kills} / ${need}`, CANVAS_W / 2, 14);

    ctx.textAlign = 'right';
    ctx.fillText(`점수 ${this.score}`, CANVAS_W - 12, 14);

    // 라인 순 속도 (줄다리기 상태) — 좌측 난이도 버튼과 겹치지 않게 약간 우측
    ctx.textAlign = 'center';
    ctx.font = "bold 13px 'Malgun Gothic', sans-serif";
    const lineHudX = 248;
    const v = this.netSpeed;
    if (Math.abs(v) < 0.05) {
      ctx.fillStyle = '#aaa';
      ctx.fillText('라인 ─ 정지', lineHudX, 36);
    } else if (v > 0) {
      ctx.fillStyle = '#ff7060';
      ctx.fillText(`라인 ▼ ${v.toFixed(1)}`, lineHudX, 36);
    } else {
      ctx.fillStyle = '#6fe08a';
      ctx.fillText(`라인 ▲ ${(-v).toFixed(1)}`, lineHudX, 36);
    }

    // 사거리 표시 토글 (끄기 → 아군만 → 전체)
    const label = RANGE_MODE_LABELS[this.rangeMode];
    const text = `사거리 ${label}`;
    ctx.font = "11px 'Malgun Gothic', sans-serif";
    const tw = ctx.measureText(text).width;
    const padX = 8;
    const bw = tw + padX * 2;
    const bh = 18;
    const bx = CANVAS_W - 10 - bw;
    const by = 27;
    this._rangeToggleRect = { x: bx - 4, y: by - 4, w: bw + 8, h: bh + 8 };
    this._drawHudChip(bx, by, bw, bh, text, 'rgba(0,0,0,0.45)', 'rgba(200, 180, 140, 0.55)');
    ctx.fillStyle = this.rangeMode === 0 ? '#8a8070' : '#e8dcc0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);

    // 레벨 / XP / 남은 포인트
    const needXp = meta.xpNeeded;
    const xpRatio = needXp > 0 ? Math.min(1, meta.xp / needXp) : 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8c878';
    ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
    ctx.fillText(`레벨 ${meta.level}`, 12, 58);
    const barX = 72;
    const barW = 250;
    const barH = 8;
    const barY = 54;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#e8c878';
    ctx.fillRect(barX, barY, barW * xpRatio, barH);
    ctx.strokeStyle = 'rgba(200,180,140,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#c9b48a';
    ctx.font = "10px 'Malgun Gothic', sans-serif";
    ctx.fillText(`${meta.xp} / ${needXp}`, barX + barW + 8, 58);
    ctx.textAlign = 'right';
    ctx.fillStyle = meta.skillPoints > 0 ? '#ffe08a' : '#9a8a6a';
    ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
    ctx.fillText(`포인트 ${meta.skillPoints}`, CANVAS_W - 12, 58);

    ctx.restore();
  }
}
