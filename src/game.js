import Matter from 'matter-js';
import {
  CANVAS_W, CANVAS_H, DEFEAT_Y, LINE_START_Y, LAUNCHER_Y, ENEMY_SPAWN_Y,
    BALANCE, UNITS, MONSTERS, HEROES,
    HERO_MISSION_DAMAGE, HERO_MISSION_KILLS, HERO_BOSS_LIMIT, HERO_ASCENSION_ATK_MULT, HERO_ASCENSION_SLOWMO,
    HERO_ASCENSION_REPLACEMENT_TIER, HERO_ASCENSION_BONUS_SCORE,
    CHARGE_STUTTER_TIME, MERGE_BLAST_RADIUS, MERGE_BLAST_FORCE,
    FRICTION_AIR_UNIT, killsNeeded, waveMultiplier, effectiveMult,
    LIVE_MULT_STEP, clampLiveMult, PROGRESSION,
    BASE_SLOT_COLS, MAX_SLOT_COLS, getSlotX, playfieldExtraInset, getPlayfieldInset,
} from './config.js';
import { Effects } from './effects.js';
import { meta } from './meta.js';
import { renderer, evoBarMetrics } from './renderer.js';
import { RANGE_MODE_LABELS } from './hud.js';

const { Engine, World, Bodies, Body, Events } = Matter;

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

// 발사는 짧은 돌진만. 관성이 라인까지 실어다 주면 진격 스킬이 안 보인다.
const LAUNCH_BURST_MAX_S = 0.28;
const LAUNCH_BURST_MIN_S = 0.12;

// 웨이브라인 슬롯 배치 (열 수는 전장 확장 스킬)
const SLOT_ROW_H = 46;
const SIDE_WALL_THICKNESS = 40;
const JOIN_ARRIVE_EPS = 2;      // 슬롯 Y에 이 거리(px) 안에 들어야 착지
const LINE_CONTACT_EPS = 8;     // 전열 접촉: 중심이 lineY 이 거리 안일 때만 라인 가속
const JOIN_CATCHUP_BONUS = 20;  // 라인이 내려가는 동안 합류 속도 하한 여유

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
    this._evoBarRect = evoBarMetrics();
    this.cheatTier = 0; // 0=random, 1–10 sticky launch cheat (restarts keep it)
    this._cssScale = 1;
    this._drawScale = 1;

    this._setupInput();
    this.ui.restartBtn.addEventListener('click', () => this.start());
    this.ui.startOverlay.addEventListener('pointerdown', () => {
      if (this.skillPanelOpen) return;
      this.start();
    });
    this.slotCols = this._fx.slotCols || BASE_SLOT_COLS;
    this.onSkillsChanged = () => {
      this._fx = meta.getEffects();
      this._syncPlayfieldFromMeta();
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
    this._wallL = null;
    this._wallR = null;
    World.add(this.engine.world, [
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
    this.currentTier = this.cheatTier || this._rollTier();
    this.nextTier = this.cheatTier || this._rollTier();

    this.effects = new Effects();
    this.wall = null;
    this.archers = [];
    this.archerShots = [];
    this._fx = meta.getEffects();
    this._syncPlayfieldFromMeta();
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
    const { left, right } = this._playfieldInner();
    const span = right - left;
    for (let i = 0; i < this.archers.length; i++) {
      const a = this.archers[i];
      const count = this.archers.length;
      a.x = count <= 1 ? (left + right) / 2 : left + 56 + i * ((span - 112) / (count - 1));
      a.y = DEFEAT_Y + 14; // 마지노선 성벽 위(보도)
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

  _playfieldInner() {
    return getPlayfieldInset(this.slotCols || BASE_SLOT_COLS);
  }

  getPlayfieldInset() {
    return this._playfieldInner();
  }

  _slotX(col) {
    return getSlotX(col, this.slotCols || BASE_SLOT_COLS);
  }

  _clampAimX(x) {
    const { left, right } = this._playfieldInner();
    return Math.max(left + 24, Math.min(right - 24, x));
  }

  _friendlyXRange(r) {
    const { left, right } = this._playfieldInner();
    return { minX: left + r + 4, maxX: right - r - 4 };
  }

  _rebuildSideWalls() {
    if (!this.engine) return;
    const extra = playfieldExtraInset(this.slotCols || BASE_SLOT_COLS);
    const wallOpts = { isStatic: true, restitution: 0.4, friction: 0.05 };
    const w = extra + SIDE_WALL_THICKNESS;
    if (this._wallL) World.remove(this.engine.world, this._wallL);
    if (this._wallR) World.remove(this.engine.world, this._wallR);
    this._wallL = Bodies.rectangle(extra - w / 2, CANVAS_H / 2, w, CANVAS_H * 2, wallOpts);
    this._wallR = Bodies.rectangle(CANVAS_W - extra + w / 2, CANVAS_H / 2, w, CANVAS_H * 2, wallOpts);
    World.add(this.engine.world, [this._wallL, this._wallR]);
  }

  _nudgeUnitsIntoPlayfield() {
    if (!this.units) return;
    for (const u of this.units) {
      if (u.dead) continue;
      const { minX, maxX } = this._friendlyXRange(u.r);
      const x = u.body.position.x;
      if (x < minX || x > maxX) {
        Body.setPosition(u.body, { x: Math.max(minX, Math.min(maxX, x)), y: u.body.position.y });
        const vx = u.body.velocity.x;
        Body.setVelocity(u.body, {
          x: (x < minX && vx < 0) || (x > maxX && vx > 0) ? 0 : vx,
          y: u.body.velocity.y,
        });
      }
    }
  }

  _relocateOverflowSlots(cols) {
    if (!this.enemies || !this.occupiedSlots) return;
    for (const m of this.enemies) {
      if (m.dead || m.isBoss) continue;
      if (m.col >= cols) this.occupiedSlots.delete(`${m.row}:${m.col}`);
    }
    for (const m of this.enemies) {
      if (m.dead || m.isBoss) continue;
      if (m.col >= 0 && m.col < cols) continue;
      const spot = this._findSpawnSpot(MONSTERS[m.key].r, m);
      if (spot) {
        m.row = spot.row;
        m.col = spot.col;
        m.x = spot.x;
        if (!m.joining) m.y = this._enemySlotY(m);
        this.occupiedSlots.add(`${m.row}:${m.col}`);
      } else {
        m.col = -1;
      }
    }
    this._compactEnemySlots();
  }

  _syncPlayfieldFromMeta() {
    const prev = this.slotCols;
    const next = Math.max(
      BASE_SLOT_COLS,
      Math.min(MAX_SLOT_COLS, this._effects().slotCols || BASE_SLOT_COLS),
    );
    this.slotCols = next;
    this._rebuildSideWalls();
    this.aimX = this._clampAimX(Number.isFinite(this.aimX) ? this.aimX : CANVAS_W / 2);
    if (Number.isFinite(prev) && next < prev) {
      this._relocateOverflowSlots(next);
      this._nudgeUnitsIntoPlayfield();
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
    const ch = this._effects().launchChances;
    let r = Math.random();
    for (const t of [5, 4, 3, 2]) {
      const p = ch[t] || 0;
      if (p > 0 && r < p) return t;
      r -= p;
    }
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
      if (this._tryEvoCheat(p)) return;
      if (this.skillPanelOpen) return;
      if (this.state !== 'playing') return;
      this.dragging = true;
      this.aimX = this._clampAimX(p.x);
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
        if (this._hitRect(p, this._evoBarRect)) return;
      }
      this.aimX = this._clampAimX(p.x);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.aimX = this._clampAimX(toCanvas(e).x);
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
    this.nextTier = this.cheatTier || this._rollTier();
  }

  _playfieldCenterX() {
    const { left, right } = this._playfieldInner();
    return (left + right) / 2;
  }

  /** Sticky T1–T10 cheat. Same slot again clears back to random. Consumes the click (no launch). */
  _tryEvoCheat(p) {
    const bar = this._evoBarRect || evoBarMetrics();
    if (!this._hitRect(p, bar)) return false;
    const { startX, slot, count } = evoBarMetrics();
    const i = Math.floor((p.x - startX) / slot);
    if (i < 0 || i >= count) return true;
    const tier = i + 1;
    if (this.cheatTier === tier) {
      this.cheatTier = 0;
      this.currentTier = this._rollTier();
      this.nextTier = this._rollTier();
    } else {
      this.cheatTier = tier;
      this.currentTier = tier;
      this.nextTier = tier;
    }
    return true;
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
      bossKills: 0,
      targetDamage: heroType ? HERO_MISSION_DAMAGE : 0,
      targetKills: heroType ? HERO_MISSION_KILLS : 0,
      gatherToBoss: false,
      firstHit: false,
      valkTick: 0,
    };
    this.units.push(u);
    this.unitByBodyId.set(body.id, u);
    return u;
  }

  // 착지 예정/착지 위치. 합류 행군 중은 예약 슬롯, 착지한 적은 실제 중심.
  _enemyReserveY(m) {
    return m.joining ? this._enemySlotY(m) : m.y;
  }

  _slotOverlapsOthers(x, y, radius, exclude = null, joinedOnly = false) {
    for (const m of this.enemies) {
      if (m === exclude || m.dead) continue;
      if (joinedOnly && !this._enemyArrived(m)) continue;
      const mr = MONSTERS[m.key].r;
      const my = joinedOnly ? m.y : this._enemyReserveY(m);
      if (Math.hypot(m.x - x, my - y) < radius + mr + 2) return true;
    }
    return false;
  }

  // 반지름 기반 스폰 위치 탐색: 기존 적(보스 포함)과 원이 겹치지 않는 빈 슬롯
  // 앞열이 겹치면 더 뒷열(스택)로 간다. 겹치는 앞열에 멈춰 밀지 않음.
  _findSpawnSpot(radius, exclude = null, minRow = 0) {
    const cols = this.slotCols || BASE_SLOT_COLS;
    for (let row = Math.max(0, minRow); row < 30; row++) {
      const candidates = [];
      for (let col = 0; col < cols; col++) {
        if (this.occupiedSlots.has(`${row}:${col}`)) continue;
        const x = this._slotX(col) + (Math.random() * 14 - 7);
        const y = this.lineY - row * SLOT_ROW_H;
        if (this._slotOverlapsOthers(x, y, radius, exclude)) continue;
        candidates.push({ row, col, x });
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
    let row = 0, col = -1, x = this._playfieldCenterX();
    if (!isBoss) {
      const spot = this._findSpawnSpot(stat.r);
      if (spot) {
        row = spot.row;
        col = spot.col;
        x = spot.x;
      } else {
        // 앞열이 꽉 찼으면 뒷열 빈 칸. 착지한 적과 겹치면 그 열은 쓰지 않음.
        for (let r2 = 0; r2 < 30 && col < 0; r2++) {
          for (let c2 = 0; c2 < (this.slotCols || BASE_SLOT_COLS); c2++) {
            if (this.occupiedSlots.has(`${r2}:${c2}`)) continue;
            const tx = this._slotX(c2) + (Math.random() * 14 - 7);
            const ty = this.lineY - r2 * SLOT_ROW_H;
            if (this._slotOverlapsOthers(tx, ty, stat.r, null, true)) continue;
            row = r2;
            col = c2;
            x = tx;
            break;
          }
        }
        if (col < 0) {
          row = 0;
          col = 0;
          x = this._slotX(0) + (Math.random() * 14 - 7);
        }
      }
      this.occupiedSlots.add(`${row}:${col}`);
    }
    // 실효 배율 = 웨이브 곡선 × 실시간 수동 배율 (HP는 스냅샷, ATK/라인속도는 liveMult 즉시 반영)
    const waveMult = waveMultiplier(this.wave);
    const hp = Math.round(stat.hp * effectiveMult(this.wave, this.liveMult));
    const slotY = this.lineY - row * SLOT_ROW_H;
    // 보스는 전열 중앙에 즉시 착지해 라인을 민다. 잡몹은 화면 상단에서 합류.
    const spawnY = ENEMY_SPAWN_Y;
    const joining = isBoss ? false : spawnY < slotY - JOIN_ARRIVE_EPS;
    const m = {
      key, isBoss, row, col, x: isBoss ? this._playfieldCenterX() : x,
      y: isBoss ? this.lineY : (joining ? spawnY : slotY),
      joining,
      hp, maxHp: hp, waveMult,
      attackCd: Math.random() * 0.4,
      stunT: 0, burn: null, flashT: 0, dead: false,
    };
    this.enemies.push(m);

    if (isBoss) {
      this._displaceOverlapping(m);
      this._compactEnemySlots();
    }

    this.effects.burst(m.x, m.y, stat.color, 8, 2.5, 2.5);
    return m;
  }

  _displaceOverlapping(anchor) {
    const ar = MONSTERS[anchor.key].r;
    const ay = this._enemySlotY(anchor);
    for (const other of this.enemies) {
      if (other === anchor || other.dead || other.isBoss) continue;
      const or2 = MONSTERS[other.key].r;
      const oy = this._enemyReserveY(other);
      const overlaps = Math.hypot(other.x - anchor.x, oy - ay) < ar + or2 + 2;
      const frontCenter = other.row === 0 && Math.abs(other.x - anchor.x) < ar + or2 + 2;
      if (!overlaps && !frontCenter) continue;
      this.occupiedSlots.delete(`${other.row}:${other.col}`);
      const spot = this._findSpawnSpot(or2, other, 0);
      if (spot) {
        other.row = spot.row;
        other.col = spot.col;
        other.x = spot.x;
        if (!other.joining) other.y = this._enemySlotY(other);
      } else {
        other.row = Math.max((Number(other.row) || 0) + 1, 1);
        if (!other.joining) other.y = this._enemySlotY(other);
      }
      this.occupiedSlots.add(`${other.row}:${other.col}`);
    }
  }

  // 같은 열의 착지 적과 목표 슬롯이 겹치면 더 뒷열로. 옆열 겹침으로 구멍 메우기를 막지 않음.
  _ensureJoinSlotClear(m) {
    if (!m || m.dead || !m.joining) return;
    const stat = MONSTERS[m.key];
    if (m.isBoss) {
      m.x = this._playfieldCenterX();
      this._displaceOverlapping(m);
      return;
    }
    const slotY = this._enemySlotY(m);
    if (!this._slotBlockedInColumn(m, m.x, slotY)) return;
    this.occupiedSlots.delete(`${m.row}:${m.col}`);
    const spot = this._findSpawnSpot(stat.r, m, m.row + 1);
    if (spot) {
      m.row = spot.row;
      m.col = spot.col;
      m.x = spot.x;
    }
    this.occupiedSlots.add(`${m.row}:${m.col}`);
  }

  _slotBlockedInColumn(m, x, y) {
    const radius = MONSTERS[m.key].r;
    for (const other of this.enemies) {
      if (other === m || other.dead || !this._enemyArrived(other)) continue;
      if (!other.isBoss && other.col !== m.col) continue;
      const mr = MONSTERS[other.key].r;
      if (Math.hypot(other.x - x, other.y - y) < radius + mr + 2) return true;
    }
    return false;
  }

  // 열마다 앞줄부터 0..n 밀집. 구멍 난 슬롯은 뒷열이 행군해 메움.
  _compactEnemySlots() {
    if (!this.occupiedSlots) this.occupiedSlots = new Set();
    this.occupiedSlots.clear();
    const cols = this.slotCols || BASE_SLOT_COLS;

    for (const m of this.enemies) {
      if (m.dead || !m.isBoss) continue;
      if (m.y + JOIN_ARRIVE_EPS < this.lineY) m.joining = true;
    }

    const living = this.enemies.filter((m) => !m.dead && !m.isBoss);
    const bosses = this.enemies.filter((m) => !m.dead && m.isBoss);
    const buckets = Array.from({ length: cols }, () => []);
    for (const m of living) {
      let col = Number(m.col);
      if (!Number.isFinite(col) || col < 0 || col >= cols) {
        let best = 0;
        let bestD = Infinity;
        for (let c = 0; c < cols; c++) {
          const d = Math.abs(this._slotX(c) - m.x);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        col = best;
        m.x = this._slotX(col);
      }
      m.col = col;
      buckets[col].push(m);
    }

    const slotBlockedByBoss = (x, y, radius) => {
      for (const b of bosses) {
        const br = MONSTERS[b.key].r;
        const by = b.joining ? this.lineY : b.y;
        if (Math.hypot(b.x - x, by - y) < br + radius + 2) return true;
      }
      return false;
    };

    for (let col = 0; col < cols; col++) {
      const group = buckets[col];
      group.sort((a, b) => b.y - a.y);
      let row = 0;
      for (const m of group) {
        const radius = MONSTERS[m.key].r;
        const x = this._slotX(col);
        while (row < 30 && slotBlockedByBoss(x, this.lineY - row * SLOT_ROW_H, radius)) row += 1;
        m.row = row;
        m.col = col;
        const slotY = this.lineY - row * SLOT_ROW_H;
        if (m.y + JOIN_ARRIVE_EPS < slotY) m.joining = true;
        else {
          m.y = slotY;
          m.joining = false;
        }
        this.occupiedSlots.add(`${row}:${col}`);
        row += 1;
      }
    }
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
    const { minX, maxX } = this._friendlyXRange(r);
    return {
      x: Math.max(minX, Math.min(x, maxX)),
      y: Math.max(minY, Math.min(y, maxY)),
    };
  }

  _removeEnemy(m) {
    if (m.dead) return;
    m.dead = true;
    const i = this.enemies.indexOf(m);
    if (i >= 0) this.enemies.splice(i, 1);
    this._compactEnemySlots();
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
        hero.gatherToBoss = !!(a.gatherToBoss || b.gatherToBoss);
        this._applyMergeShock(pos.x, pos.y, hero);
        this.mergeBlastQueue.push({ x: pos.x, y: pos.y, exclude: hero });
      } else {
        // 합성 유닛은 발사 관성이 없으므로 즉시 전진 가능
        const spawned = this._spawnUnit(newTier, pos.x, pos.y);
        spawned.settled = true;
        spawned.gatherToBoss = !!(a.gatherToBoss || b.gatherToBoss);
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
      this._syncEnemyY(0);
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
    this.effects.floatText(CANVAS_W / 2, 300, '영웅 소환!', '#FFD700', 28, 2.0);
    return hero;
  }

  // ---------- 웨이브 / 스폰 ----------
  _monsterPool() {
    const pool = [['goblin', this.wave <= 1 ? 78 : 55], ['orc', this.wave <= 1 ? 12 : 25]];
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
        this._markBossGather();
        this.effects.burst(CANVAS_W / 2, ENEMY_SPAWN_Y, '#B22222', 30, 5, 5);
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
      this._onBossSlain();
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

  // 예약 슬롯에 착지한 적 (뒷열 스택 포함). 합류/구멍에 떠 있는 적은 제외.
  _enemyArrived(m) {
    if (!m || m.dead || m.joining) return false;
    return m.y + JOIN_ARRIVE_EPS >= this._enemySlotY(m);
  }

  // 전열 접촉만. 뒷열·합류·라인 위 구멍에 떠 있는 적은 라인 속도에 안 넣음.
  _enemyOccupiesLine(m) {
    if (!m || m.dead || m.joining) return false;
    return Math.abs(m.y - this.lineY) <= LINE_CONTACT_EPS;
  }

  joinedEnemies() {
    return this.enemies.filter((m) => this._enemyOccupiesLine(m));
  }

  _unitEngaged(u, onLine) {
    const joined = onLine || this.joinedEnemies();
    const range = this._unitStat(u).range;
    const { x, y } = u.body.position;
    for (const m of joined) {
      const er = MONSTERS[m.key].r;
      if (Math.hypot(m.x - x, m.y - y) <= range + er) return true;
    }
    return false;
  }

  // 프레임당 1회 교전 여부 계산 (라인 속도 계산과 전진 로직이 공유)
  _computeEngagement() {
    const joined = this.joinedEnemies();
    for (const u of this.units) {
      u.engaged = joined.length > 0 && this._unitEngaged(u, joined);
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
      this._syncEnemyY(dt);
      return;
    }
    const joined = this.joinedEnemies();
    // 착지한 적이 없으면 전진하지 않음. 전열 아군 저지력으로 시작 위치까지 밀어올림.
    // 합류 중인 적만 있을 때도 동일 (joining은 라인 속도에 기여하지 않음).
    if (joined.length === 0) {
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
      this._syncEnemyY(dt);
      return;
    }
    let advance = BALANCE.baseLineSpeed;
    for (const m of joined) {
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
    this._syncEnemyY(dt);
  }

  _enemySlotY(m) {
    return this.lineY - (Number(m.row) || 0) * SLOT_ROW_H;
  }

  // 합류 중: 슬롯을 향해 내려감. 착지 후: 라인에 고정.
  _syncEnemyY(dt) {
    const baseJoin = Number.isFinite(BALANCE.enemyJoinSpeed) ? Math.max(0, BALANCE.enemyJoinSpeed) : 80;
    const descent = Math.max(0, this.netSpeed || 0);
    const join = Math.max(baseJoin, descent + JOIN_CATCHUP_BONUS);
    const step = dt || 0;
    // 한 프레임 라인 이동보다 훨씬 위에 있으면 joining이 일찍 꺼진 구멍으로 보고 다시 행군.
    const rejoinSlack = Math.max(12, descent * step + 8);
    for (const m of this.enemies) {
      if (m.dead) continue;
      const slotY = this._enemySlotY(m);
      if (!m.joining && m.y < slotY - rejoinSlack) m.joining = true;
      if (m.joining) {
        this._ensureJoinSlotClear(m);
        const destY = this._enemySlotY(m);
        m.y += join * step;
        if (m.y + JOIN_ARRIVE_EPS >= destY) {
          m.y = destY;
          m.joining = false;
          if (m.isBoss) this._displaceOverlapping(m);
        }
      } else {
        m.y = slotY;
      }
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
    const fx = this._effects();
    const advPx = Number.isFinite(fx.advanceSpeed)
      ? fx.advanceSpeed
      : BALANCE.unitAdvanceSpeed * (fx.advanceMult || 1);
    const advTick = velFromPxPerSec(advPx, stepMs);
    // body.speed는 px/스텝. 고정 숫자 2는 fps에 따라 의미가 달라진다.
    const settleSpeed = velFromPxPerSec(Math.max(advPx * 1.25, 24), stepMs);
    for (const u of this.units) {
      u.age += dt;
      if (!u.settled && (
        u.age >= LAUNCH_BURST_MAX_S
        || (u.age >= LAUNCH_BURST_MIN_S && u.body.speed <= settleSpeed)
      )) {
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

  // ---------- 보스 집결: 등장 시점에 있던 아군만 보스 쪽으로. 이후 발사는 진격 경로 유지 ----------
  _markBossGather() {
    for (const u of this.units) {
      if (!u.dead) u.gatherToBoss = true;
    }
  }

  _updateBossGather(dt) {
    const strength = Math.max(0, Math.min(1, BALANCE.bossGatherStrength));
    if (strength <= 0) return;
    const boss = this.enemies.find((m) => m.isBoss);
    if (!boss) return;

    const engagedAlsoGather = strength > 0.7;
    const stepMs = this._stepMs || engineStepMs(dt);
    const maxVxTick = velFromPxPerSec(BALANCE.gatherSpeed * strength, stepMs);

    for (const u of this.units) {
      if (!u.settled || !u.gatherToBoss) continue;
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
      const { minX, maxX } = this._friendlyXRange(u.r);
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
        if (m.dead || !this._enemyArrived(m)) continue;
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
          if (m2 === target || m2.dead || !this._enemyArrived(m2)) continue;
          if (Math.hypot(m2.x - target.x, m2.y - target.y) < sp.cleaveRadius) {
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
      if (m.dead || m.stunT > 0 || !this._enemyArrived(m)) continue;
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
        if (u.heroType === 'arthur' && hero && u.abilityT >= hero.period) {
          u.abilityT = 0;
          this.effects.lineFlash(this.lineY, '#9be7ff');
          for (const m of [...this.enemies]) {
            if (!m.dead) this._damageEnemy(m, stat.atk * hero.atkFrac, u);
          }
          this._checkHeroMission(u);
        }
        if (u.heroType === 'valkyrie' && hero) {
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

  _onBossSlain() {
    for (const u of [...this.units]) {
      if (u.dead || !u.heroType || u._ascending) continue;
      u.bossKills = (u.bossKills || 0) + 1;
      this._checkHeroMission(u);
    }
  }

  _checkHeroMission(u) {
    if (!u || u.dead || !u.heroType || u._ascending) return;
    const quota = u.targetDamage || HERO_MISSION_DAMAGE;
    if ((u.missionDamage || 0) >= quota) {
      this._ascendHero(u);
      return;
    }
    if ((u.bossKills || 0) >= HERO_BOSS_LIMIT) this._retireHero(u);
  }

  _retireHero(hero) {
    if (!hero || hero.dead || hero._ascending) return;
    hero._ascending = true;
    const x = hero.body.position.x;
    const y = hero.body.position.y;
    this.effects.burst(x, y, '#c9b48a', 22, 4, 4);
    this.effects.floatText(x, y - 36, '영웅 퇴장', '#e8d5a0', 18, 1.3);
    this._removeUnit(hero);
    const t5 = UNITS[HERO_ASCENSION_REPLACEMENT_TIER - 1];
    const spawn = this._clampFriendlyPos(x, y, t5.r);
    const knight = this._spawnUnit(HERO_ASCENSION_REPLACEMENT_TIER, spawn.x, spawn.y);
    knight.settled = true;
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
    this._syncEnemyY(0);

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
        if (m.dead || m.joining || !this._enemyOccupiesLine(m)) continue;
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
    const { minX, maxX } = this._friendlyXRange(u.r);
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

    const paused = this.skillPanelOpen && this.state === 'playing';
    if (!paused) {
      if (this.slowMoT > 0) this.slowMoT = Math.max(0, this.slowMoT - rawDt);
      if (this.ascendFlashT > 0) this.ascendFlashT = Math.max(0, this.ascendFlashT - rawDt);
      if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - rawDt);
      const dt = rawDt * (this.slowMoT > 0 ? SLOWMO_SCALE : 1);
      if (this.state === 'playing') this._update(dt);
    }
    this._draw();

    requestAnimationFrame(this._loop);
  }

  _update(dt) {
    this._fx = meta.getEffects();
    if (this.slotCols !== this._fx.slotCols) this._syncPlayfieldFromMeta();
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

  setViewScale(cssScale) {
    const s = Number(cssScale);
    this._cssScale = Number.isFinite(s) && s > 0 ? s : 1;
    this._syncCanvasBacking();
  }

  _syncCanvasBacking() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(this._cssScale * dpr, 4);
    const w = Math.max(1, Math.round(CANVAS_W * scale));
    const h = Math.max(1, Math.round(CANVAS_H * scale));
    this._drawScale = scale;
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  // ---------- 렌더링 ----------
  _draw() {
    this._syncCanvasBacking();
    const ctx = this.ctx;
    ctx.setTransform(this._drawScale, 0, 0, this._drawScale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    this._fx = meta.getEffects();
    renderer.draw(this, ctx);
  }

  _hitRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }
}
