import Matter from 'matter-js';
import {
    CANVAS_W, CANVAS_H, DEFEAT_Y, LINE_START_Y, LAUNCHER_Y, ENEMY_SPAWN_Y,
    CAMP_DEST_Y, CAMP_DRAW_H,
    BALANCE, UNITS, MONSTERS, HEROES,
    HERO_MISSION_KILLS, HERO_ASCENSION_SLOWMO,
    HERO_ASCENSION_REPLACEMENT_TIER, HERO_ASCENSION_BONUS_SCORE, heroMissionDamage,
    rollHeroRemnantTier,
    CHARGE_STUTTER_TIME, MERGE_BLAST_RADIUS, MERGE_BLAST_FORCE,
    FRICTION_AIR_UNIT, killsNeeded, waveMultiplier, bossWaveMultiplier,
    LIVE_MULT_STEP, clampLiveMult, PROGRESSION,
    clampRegenPct, clampSpawnRate,
    BASE_SLOT_COLS, MAX_SLOT_COLS, getSlotX, playfieldExtraInset, getPlayfieldInset,
    CHEATS_STORAGE_KEY, AUTO_FIRE_STORAGE_KEY, PLAYED_STORAGE_KEY, SHOP, SHOP_MIN_TIER, SHOP_MAX_TIER, isShopTier, formatShopGold,
    bossEscortForWave,
} from './config.js';
import { Effects } from './effects.js';
import { meta } from './meta.js';
import {
  unitCombatStat, collectGlobalAuras, villageResolve, heroKit, heroBossLimit, heroAscendAtkMult,
  medalsForClearedWave, VILLAGE_CLEAR_WAVE, VILLAGE_CLEAR_BONUS, formatMedals,
} from './village.js';
import { showConfirm } from './confirm.js';
import { renderer, evoBarMetrics, autoFireRect, bottomHudMetrics } from './renderer.js';
import { RANGE_MODE_LABELS } from './hud.js';
import { audio } from './audio.js';
import {
  TUTORIAL_INTRO_STEPS, TUTORIAL_AUTO_STEP, setupTutorialUi,
  tutorialPhase, autoUnlockSaved, markTutorialStarted, markTutorialIntroDone, markTutorialDone,
  markAutoUnlocked, resetTutorialProgress,
} from './tutorial.js';

const { Engine, World, Bodies, Body, Events } = Matter;

const ENGINE_DT_CAP_MS = 33.33;
const SLOWMO_SCALE = 0.25;
// Matter Verlet integrates F/m * dt^2. Never feed a px/step impulse through applyForce.

function engineStepMs(dt) {
  return Math.min(dt * 1000, ENGINE_DT_CAP_MS);
}

// Matter 0.20 setVelocity는 px/초가 아니라 「16.67ms당 px」(baseDelta). 프레임 dt를 곱하면
// timeScale과 이중 스케일이 되어 발사체가 한 프레임에 전장 끝까지 튀기도 한다.
const MATTER_BASE_MS = 1000 / 60;
const CAT_ALLY = 0x0001;
const CAT_SHOT = 0x0002;

function matterVel(pxPerSec) {
  return (Number(pxPerSec) || 0) * MATTER_BASE_MS / 1000;
}

function setVelPxS(body, vx, vy) {
  Body.setVelocity(body, { x: matterVel(vx), y: matterVel(vy) });
}

function getVelPxS(body) {
  const v = Body.getVelocity(body);
  return { x: v.x * (1000 / MATTER_BASE_MS), y: v.y * (1000 / MATTER_BASE_MS) };
}

function allyCollisionFilter(asShot) {
  return asShot
    ? { category: CAT_SHOT, mask: CAT_SHOT, group: 0 }
    : { category: CAT_ALLY, mask: CAT_ALLY, group: 0 };
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
    this.spawnRateMult = 1; // 적 리스폰 속도 배율 (재시작 후에도 유지)
    this.autoFire = false;
    try { this.autoFire = localStorage.getItem(AUTO_FIRE_STORAGE_KEY) === '1'; } catch { /* ignore */ }
    this.holdingFire = false;
    this.onLiveMultChange = null;
    this.onSpawnRateChange = null;
    this.onRegenChange = null;
    this.skillPanelOpen = false;
    this._fx = meta.getEffects();
    this._rangeToggleRect = { x: 0, y: 0, w: 0, h: 0 };
    this._diffMinusRect = { x: 0, y: 0, w: 0, h: 0 };
    this._diffPlusRect = { x: 0, y: 0, w: 0, h: 0 };
    this._evoBarRect = evoBarMetrics();
    this.cheatsEnabled = false;
    try { this.cheatsEnabled = localStorage.getItem(CHEATS_STORAGE_KEY) === '1'; } catch { /* ignore */ }
    this.onCheatsChange = null;
    this.onGoldChange = null;
    this.onPlayStateChange = null;
    this.openEstate = null;
    this._cssScale = 1;
    this._drawScale = 1;
    this._runMetaSnap = null;
    this.hasPlayed = this._loadHasPlayed();
    this.tutorialFreeze = false;
    this.tutorialAnchor = '';
    this._tutorialQueue = [];
    this._lockAutoUntilWave2 = false;
    this._tutorialUi = setupTutorialUi(this, this.ui.tutorialOverlay);

    this._setupInput();
    this.ui.restartBtn.addEventListener('click', () => this.start());
    this.ui.startOverlay.addEventListener('pointerdown', (e) => {
      if (this.skillPanelOpen) return;
      if (this.hasPlayed) return;
      if (e.target.closest?.('button')) return;
      this.start();
    });
    this.ui.startPlayBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.start();
    });
    this.ui.startEstateBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.openEstate?.();
    });
    this._syncStartOverlay();
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
    this.waveTrashSpawned = 0;
    this.score = 0;
    this.gold = 0;
    this.mergeCombo = 0;
    this._resetShopBuys();
    this.spawnTimer = BALANCE.spawnInterval * 0.75;
    this.holdingFire = false;
    this.bossActive = false;
    this.bossPending = false;
    this.bossWarnT = 0;
    this.victory = false;
    this._runSettled = false;
    this.runXpBoss = 0;
    this.runMedals = 0;
    this.runSettlement = null;
    this.resultWave = 1;
    this.lineFreezeT = 0;
    this.dragonFearCd = 0;
    this.marshalInvulnCd = 0;
    this._marshalInvulnArmed = false;
    this.heroSmiteT = 0;
    this._miracleWave = -1;
    this._awakenBucket = -1;
    this._villageAura = collectGlobalAuras([], () => 1);

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
    this.gold = this._fx.startGold || 0;
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
      `레벨 ${meta.level}  ·  XP ${meta.xp} / ${meta.xpNeeded}  ·  건설 ${meta.skillPoints}  ·  훈장 ${formatMedals(meta.medals)}`;
  }

  _loadHasPlayed() {
    try {
      if (localStorage.getItem(PLAYED_STORAGE_KEY) === '1') return true;
    } catch { /* ignore */ }
    if (meta.level > 1 || meta.xp > 0 || meta.spentPoints() > 0) {
      this._markPlayed(true);
      return true;
    }
    return false;
  }

  _markPlayed(silent = false) {
    this.hasPlayed = true;
    try { localStorage.setItem(PLAYED_STORAGE_KEY, '1'); } catch { /* ignore */ }
    if (!silent) this._syncStartOverlay();
  }

  _syncStartOverlay() {
    const first = !this.hasPlayed;
    this.ui.tapToStart?.classList.toggle('hidden', !first);
    this.ui.startChoices?.classList.toggle('hidden', first);
    this.ui.startOverlay?.classList.toggle('choose', !first);
  }

  _hasTutorialUi() {
    return !!this._tutorialUi;
  }

  _needTutorialIntro() {
    if (!this._hasTutorialUi()) return false;
    const phase = tutorialPhase();
    if (phase === 'done' || phase === 'intro') return false;
    if (phase === 'started') return true;
    return !this.hasPlayed;
  }

  _needAutoLock() {
    if (!this._hasTutorialUi()) return false;
    if (autoUnlockSaved()) return false;
    const phase = tutorialPhase();
    if (phase === 'done') return false;
    if (phase === 'intro' || phase === 'started') return true;
    if (this.hasPlayed) return false;
    return true;
  }

  autoUnlocked() {
    if (this.wave >= 2) return true;
    if (!this._lockAutoUntilWave2) return true;
    return autoUnlockSaved();
  }

  _beginTutorialIfNeeded(needIntro, lockAuto) {
    this._hideTutorial();
    if (needIntro) {
      markTutorialStarted();
      this._tutorialQueue = TUTORIAL_INTRO_STEPS.map((s) => s);
      this._showNextTutorial();
      return;
    }
    this.tutorialFreeze = false;
    this.tutorialAnchor = '';
    if (lockAuto) this._lockAutoUntilWave2 = true;
  }

  _showNextTutorial() {
    const step = this._tutorialQueue.shift();
    if (!step) {
      this._finishTutorialSegment();
      return;
    }
    this.tutorialFreeze = true;
    this.tutorialAnchor = step.anchor || '';
    this._tutorialStep = step;
    this._tutorialUi?.show(step, this.lineY);
  }

  _finishTutorialSegment() {
    const stepId = this._tutorialStep?.id;
    this._tutorialStep = null;
    this.tutorialFreeze = false;
    this.tutorialAnchor = '';
    this._tutorialUi?.hide();
    if (stepId === 'play') markTutorialIntroDone();
    if (stepId === 'auto') {
      this._unlockAutoFire();
      markTutorialDone();
    }
  }

  tutorialAdvance() {
    if (!this._tutorialStep) return;
    if (this._tutorialQueue.length === 0) {
      this._finishTutorialSegment();
      return;
    }
    this._showNextTutorial();
  }

  _hideTutorial() {
    this._tutorialQueue = [];
    this._tutorialStep = null;
    this.tutorialFreeze = false;
    this.tutorialAnchor = '';
    this._tutorialUi?.hide();
  }

  _unlockAutoFire() {
    this._lockAutoUntilWave2 = false;
    markAutoUnlocked();
  }

  _maybeOfferAutoTutorial() {
    if (this.wave < 2) return;
    const wasLocked = this._lockAutoUntilWave2 || tutorialPhase() === 'intro';
    this._lockAutoUntilWave2 = false;
    if (!wasLocked) return;
    markAutoUnlocked();
    if (!this._hasTutorialUi()) {
      markTutorialDone();
      return;
    }
    if (tutorialPhase() === 'done') return;
    this._tutorialQueue = [TUTORIAL_AUTO_STEP];
    this._showNextTutorial();
  }

  _notifyPlayState() {
    this.onPlayStateChange?.(this.state);
  }

  _snapshotRunMeta() {
    this._runMetaSnap = meta.cloneProgress();
  }

  _forfeitRun() {
    if (this._runMetaSnap) {
      meta.restoreSnapshot(this._runMetaSnap);
      this.onSkillsChanged?.();
    }
    this._runSettled = true;
    this.runSettlement = {
      forfeited: true,
      victory: false,
      scoreXp: 0,
      bossXp: 0,
      gold: 0,
      goldXp: 0,
      extraXp: 0,
      grantNow: 0,
      totalRunXp: 0,
      medals: 0,
    };
  }

  async requestRestart() {
    if (this.state !== 'playing') {
      this.start();
      return;
    }
    const ok = await showConfirm({
      title: '재시작',
      message: '이번 웨이브의 점수·골드 XP 보상이 없습니다. 바로 다시 시작할까요?',
      confirmText: '재시작',
      cancelText: '취소',
      danger: true,
    });
    if (!ok || this.state !== 'playing') return;
    this._forfeitRun();
    this.start();
  }

  async requestAbandon() {
    if (this.state !== 'playing') return;
    const ok = await showConfirm({
      title: '포기',
      message: '포기하면 이번 웨이브의 점수·골드 XP 보상이 없습니다. 시작 화면으로 돌아갈까요?',
      confirmText: '포기',
      cancelText: '취소',
      danger: true,
    });
    if (!ok || this.state !== 'playing') return;
    this.abandonToMenu();
  }

  abandonToMenu() {
    this.holdingFire = false;
    this._forfeitRun();
    this._hideTutorial();
    this.state = 'start';
    this._reset();
    this.onGoldChange?.();
    this.ui.startOverlay.classList.remove('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
    this._syncStartOverlay();
    this._notifyPlayState();
    audio.setMode('menu');
  }

  resetToFirstPlay() {
    this.holdingFire = false;
    meta.resetAccount();
    this.setCheatsEnabled(false);
    this.autoFire = false;
    try { localStorage.removeItem(AUTO_FIRE_STORAGE_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(PLAYED_STORAGE_KEY); } catch { /* ignore */ }
    resetTutorialProgress();
    this.hasPlayed = false;
    this._lockAutoUntilWave2 = false;
    this._hideTutorial();
    this._runMetaSnap = null;
    this.state = 'start';
    this._reset();
    this.onGoldChange?.();
    this.onSkillsChanged?.();
    if (typeof document !== 'undefined') {
      document.getElementById('skillPanel')?.classList.add('hidden');
      document.getElementById('estatePanel')?.classList.add('hidden');
      document.getElementById('villagePanel')?.classList.add('hidden');
      document.getElementById('adminPanel')?.classList.add('hidden');
    }
    this.skillPanelOpen = false;
    this._hideTutorial();
    this.ui.startOverlay.classList.remove('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
    this._syncStartOverlay();
    this._refreshStartMeta();
    this._notifyPlayState();
    audio.setMode('menu');
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
        look: fx.archerLook || 0,
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
      a.look = fx.archerLook || 0;
      if (fresh) a.ammo = fx.archerAmmo;
      else if (a.maxAmmo > prevMax) a.ammo = Math.min(a.maxAmmo, a.ammo + (a.maxAmmo - prevMax));
      else a.ammo = Math.min(a.ammo, a.maxAmmo);
    }
  }

  _lockedCount() {
    let n = 0;
    for (const u of this.units) {
      if (!u.dead && u.tierLocked) n += 1;
    }
    return n;
  }

  _tryToggleTierLock(p) {
    const slots = this._effects().tierLockSlots || 0;
    if (slots <= 0 || !p) return false;
    let best = null;
    let bestD = Infinity;
    for (const u of this.units) {
      if (u.dead || u.heroType || u.tier >= 10) continue;
      const { x, y } = u.body.position;
      const d = Math.hypot(p.x - x, p.y - y);
      const hit = (u.r || 12) + 8;
      if (d <= hit && d < bestD) {
        best = u;
        bestD = d;
      }
    }
    if (!best) return false;
    const { x, y } = best.body.position;
    if (best.tierLocked) {
      best.tierLocked = false;
      this.effects?.floatText(x, y - best.r - 12, '잠금 해제', '#c8e8d0', 13, 0.7);
    } else if (this._lockedCount() >= slots) {
      this.effects?.floatText(x, y - best.r - 12, '잠금 슬롯 없음', '#ffd27a', 13, 0.7);
    } else {
      best.tierLocked = true;
      this.effects?.floatText(x, y - best.r - 12, '티어 잠금', '#e8c878', 13, 0.7);
    }
    return true;
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
        const v = getVelPxS(u.body);
        if ((x < minX && v.x < 0) || (x > maxX && v.x > 0)) v.x = 0;
        setVelPxS(u.body, v.x, v.y);
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
    const needIntro = this._needTutorialIntro();
    const lockAuto = this._needAutoLock();
    const panel = typeof document !== 'undefined' ? document.getElementById('skillPanel') : null;
    if (panel) panel.classList.add('hidden');
    const estate = typeof document !== 'undefined' ? document.getElementById('estatePanel') : null;
    if (estate) estate.classList.add('hidden');
    const village = typeof document !== 'undefined' ? document.getElementById('villagePanel') : null;
    if (village) village.classList.add('hidden');
    this.skillPanelOpen = false;
    this._reset();
    this._snapshotRunMeta();
    this._markPlayed();
    if (lockAuto) {
      this._lockAutoUntilWave2 = true;
      this.autoFire = false;
    } else {
      this._lockAutoUntilWave2 = false;
    }
    this.onGoldChange?.();
    this.state = 'playing';
    this.ui.startOverlay.classList.add('hidden');
    this.ui.gameoverOverlay.classList.add('hidden');
    this._notifyPlayState();
    this._beginTutorialIfNeeded(needIntro, lockAuto);
    audio.setMode('play');
  }

  _settleRun(victory) {
    if (this._runSettled) return this.runSettlement;
    this._runSettled = true;
    const gold = Math.max(0, Math.floor(this.gold || 0));
    const rate = Number.isFinite(BALANCE.goldXpRate) ? Math.max(0, BALANCE.goldXpRate) : 1;
    const goldXp = Math.floor(gold * rate);
    const scoreXp = Math.max(0, Math.floor(this.score || 0));
    const bossXp = Math.max(0, Math.floor(this.runXpBoss || 0));
    const mult = victory
      ? Math.max(1, Number(BALANCE.clearRewardMult) || 2)
      : 1;
    const extra = victory ? (scoreXp + bossXp + goldXp) * (mult - 1) : 0;
    const grantNow = goldXp + extra;
    if (grantNow > 0) this._addRunXp(grantNow);
    this.runSettlement = {
      victory: !!victory,
      scoreXp,
      bossXp,
      gold,
      goldXp,
      extraXp: extra,
      grantNow,
      mult,
      totalRunXp: scoreXp + bossXp + goldXp + extra,
      medals: Math.max(0, Math.floor(this.runMedals || 0)),
    };
    return this.runSettlement;
  }

  _showResultOverlay(victory) {
    const s = this._settleRun(victory);
    const title = this.ui.resultTitle || this.ui.gameoverOverlay?.querySelector('h1');
    if (title) title.textContent = victory ? '완전 클리어!' : '패배';
    if (this.ui.finalScore) {
      this.ui.finalScore.textContent =
        `점수 ${this.score} · 골드 ${s.gold} · 웨이브 ${this.resultWave || this.wave} · 레벨 ${meta.level}`;
    }
    const xpEl = this.ui.resultXp;
    if (xpEl) {
      const lines = [
        `전투 점수 XP ${s.scoreXp}`,
        `보스 보너스 XP ${s.bossXp}`,
        `잔여 골드 환산 XP ${s.goldXp} (+${s.gold}G)`,
      ];
      if (victory) {
        lines.push(`완전 클리어 보상 ×${s.mult} (추가 XP ${s.extraXp})`);
      }
      lines.push(`이번 런 훈장 +${s.medals || 0}`);
      lines.push(`이번 런 합계 XP ${s.totalRunXp}`);
      xpEl.innerHTML = lines.map((t) => `<span>${t}</span>`).join('');
    }
    this.ui.gameoverOverlay.classList.remove('hidden');
    this._hideTutorial();
  }

  _gameOver() {
    if (this.state === 'gameover') return;
    this.holdingFire = false;
    this.state = 'gameover';
    this.victory = false;
    this.resultWave = this.wave;
    this._showResultOverlay(false);
    this._notifyPlayState();
    audio.play('defeat');
    audio.setMode('result');
  }

  _runComplete() {
    if (this.state === 'gameover') return;
    this.holdingFire = false;
    this.state = 'gameover';
    this.victory = true;
    this._showResultOverlay(true);
    this._notifyPlayState();
    audio.play('victory');
    audio.setMode('result');
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
      e.preventDefault();
      const p = toCanvas(e);
      if (this._hitRect(p, this._rangeToggleRect)) {
        this.rangeMode = (this.rangeMode + 1) % RANGE_MODE_LABELS.length;
        return;
      }
      if (this.cheatsEnabled && this._hitRect(p, this._diffMinusRect)) {
        this.adjustLiveMult(-LIVE_MULT_STEP);
        return;
      }
      if (this.cheatsEnabled && this._hitRect(p, this._diffPlusRect)) {
        this.adjustLiveMult(LIVE_MULT_STEP);
        return;
      }
      if (this._hitRect(p, autoFireRect())) {
        if (!this.autoUnlocked()) {
          this.effects?.floatText(CANVAS_W / 2, 72, '1웨이브 클리어 후 해금', '#ffd27a', 15, 0.8);
          return;
        }
        this.setAutoFire(!this.autoFire);
        return;
      }
      if (this._tryShopBar(p)) return;
      if (this._hitDockHud(p)) return;
      if (this.skillPanelOpen) return;
      if (this.tutorialFreeze) return;
      if (this.state !== 'playing') return;
      this._tryToggleTierLock(p);
      this.dragging = true;
      this.holdingFire = true;
      this.aimX = this._clampAimX(p.x);
      this.canvas.setPointerCapture(e.pointerId);
      this._tickAutoFire();
    }, { passive: false });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toCanvas(e);
      this.mouse = p;
      if (this.skillPanelOpen || this.tutorialFreeze || this.state !== 'playing') return;
      if (!this.dragging) {
        if (this._hitRect(p, this._rangeToggleRect)) return;
        if (this.cheatsEnabled && this._hitRect(p, this._diffMinusRect)) return;
        if (this.cheatsEnabled && this._hitRect(p, this._diffPlusRect)) return;
        if (this._hitRect(p, this._evoBarRect)) return;
        if (this._hitDockHud(p)) return;
      }
      this.aimX = this._clampAimX(p.x);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.holdingFire = false;
      this.aimX = this._clampAimX(toCanvas(e).x);
    });
    this.canvas.addEventListener('pointercancel', () => {
      this.dragging = false;
      this.holdingFire = false;
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (this.cheatsEnabled && (e.key === '+' || e.key === '=' || e.key === ']' || e.code === 'NumpadAdd')) {
          this.adjustLiveMult(LIVE_MULT_STEP);
          e.preventDefault();
        } else if (this.cheatsEnabled && (e.key === '-' || e.key === '_' || e.key === '[' || e.code === 'NumpadSubtract')) {
          this.adjustLiveMult(-LIVE_MULT_STEP);
          e.preventDefault();
        } else if (e.code === 'Space' || e.key === ' ') {
          if (this.tutorialFreeze) {
            this.tutorialAdvance();
            e.preventDefault();
          } else if (this.state === 'playing' && !this.skillPanelOpen) {
            if (!this.autoUnlocked()) {
              this.effects?.floatText(CANVAS_W / 2, 72, '1웨이브 클리어 후 해금', '#ffd27a', 15, 0.8);
            } else {
              this.setAutoFire(!this.autoFire);
            }
            e.preventDefault();
          }
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

  _hitDockHud(p) {
    const m = bottomHudMetrics();
    if (this._hitRect(p, m.gold) || this._hitRect(p, m.next) || this._hitRect(p, m.auto)) return true;
    if ((this._effects().tierLockSlots || 0) > 0 && this._hitRect(p, m.lock)) return true;
    return false;
  }

  setAutoFire(on) {
    const next = !!on;
    if (next && !this.autoUnlocked()) {
      if (this.state === 'playing' && this.effects) {
        this.effects.floatText(CANVAS_W / 2, 72, '1웨이브 클리어 후 해금', '#ffd27a', 15, 0.8);
      }
      return this.autoFire;
    }
    if (next === this.autoFire) return this.autoFire;
    this.autoFire = next;
    try { localStorage.setItem(AUTO_FIRE_STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    if (this.state === 'playing' && this.effects) {
      this.effects.floatText(CANVAS_W / 2, 72, next ? '자동발사 ON' : '자동발사 OFF', '#7ec8ff', 16, 0.7);
    }
    return this.autoFire;
  }

  _tickAutoFire() {
    if (this.state !== 'playing' || this.skillPanelOpen || this.tutorialFreeze) return;
    if (this.launchCd > 0) return;
    if ((this.autoFire && this.autoUnlocked()) || this.holdingFire) this._launchUnit();
  }

  trollRegenPct() {
    return clampRegenPct(MONSTERS.troll?.regenPct);
  }

  setTrollRegenPct(v) {
    const next = clampRegenPct(v);
    if (!MONSTERS.troll) return next;
    if (next === clampRegenPct(MONSTERS.troll.regenPct)) {
      MONSTERS.troll.regenPct = next;
      return next;
    }
    MONSTERS.troll.regenPct = next;
    if (this.state === 'playing' && this.effects) {
      this.effects.floatText(CANVAS_W / 2, 72, `트롤 재생 ${Math.round(next * 100)}%/s`, '#7CFC00', 16, 0.7);
    }
    this.onRegenChange?.();
    return next;
  }

  adjustTrollRegenPct(delta) {
    return this.setTrollRegenPct(this.trollRegenPct() + delta);
  }

  setSpawnRateMult(v) {
    const next = clampSpawnRate(v);
    if (next === this.spawnRateMult) return this.spawnRateMult;
    this.spawnRateMult = next;
    if (this.state === 'playing' && this.effects) {
      this.effects.floatText(CANVAS_W / 2, 72, `리스폰 ×${next.toFixed(1)}`, '#7ec8ff', 16, 0.7);
    }
    this.onSpawnRateChange?.();
    return this.spawnRateMult;
  }

  adjustSpawnRateMult(delta) {
    return this.setSpawnRateMult(this.spawnRateMult + delta);
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
    const debuff = Math.max(0, 1 - (this._villageAura?.enemyAtkDebuff || 0));
    return MONSTERS[m.key].atk * m.waveMult * this.liveMult * debuff;
  }

  _launchUnit() {
    const u = this._spawnUnit(this.currentTier, this.aimX, LAUNCHER_Y);
    if (!u) {
      this.launchCd = this._launchCooldown();
      this.currentTier = this.nextTier;
      this.nextTier = this._rollTier();
      return;
    }
    u.fromLaunch = true;
    u.body.collisionFilter = allyCollisionFilter(true);
    setVelPxS(u.body, 0, -BALANCE.launchSpeed);
    this.launchCd = this._launchCooldown();
    this.currentTier = this.nextTier;
    this.nextTier = this._rollTier();
    this._applyLaunchPassives(u);
    audio.play('launch');
  }

  setCheatsEnabled(on) {
    const next = !!on;
    this.cheatsEnabled = next;
    try { localStorage.setItem(CHEATS_STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    this.onCheatsChange?.();
    return this.cheatsEnabled;
  }

  addGold(n) {
    const amt = Number(n);
    if (!Number.isFinite(amt) || amt === 0) return this.gold;
    this.gold = Math.max(0, this.gold + amt);
    this.onGoldChange?.();
    return this.gold;
  }

  setGold(n) {
    const v = Number(n);
    this.gold = Number.isFinite(v) ? Math.max(0, v) : 0;
    this.onGoldChange?.();
    return this.gold;
  }

  _resetShopBuys() {
    this.waveShopBuys = {};
    for (let t = SHOP_MIN_TIER; t <= SHOP_MAX_TIER; t++) this.waveShopBuys[t] = 0;
  }

  shopView(tier) {
    const t = Math.floor(Number(tier) || 0);
    const cheat = !!this.cheatsEnabled;
    const buyable = isShopTier(t);
    const fx = this._effects();
    const maxTier = cheat ? SHOP_MAX_TIER : (fx.shopMaxTier || 3);
    const def = SHOP[t];
    const price = def?.price ?? 0;
    const limit = def?.limit ?? 0;
    const used = this.waveShopBuys?.[t] || 0;
    const unlimited = limit < 0;
    const remaining = unlimited ? Infinity : Math.max(0, limit - used);
    const locked = !buyable || (!cheat && t > maxTier);
    const soldOut = buyable && !cheat && !unlimited && remaining <= 0;
    const broke = buyable && !cheat && !locked && !soldOut && this.gold < price;
    const dim = !buyable || locked || soldOut || broke;
    const canBuy = buyable && !locked && !soldOut && (cheat || this.gold >= price);
    return { tier: t, buyable, locked, soldOut, broke, dim, canBuy, price, limit, used, remaining, unlimited, maxTier, cheat };
  }

  _grantGold(n, x, y) {
    const amt = Math.max(0, Number(n) || 0);
    if (amt <= 0) return 0;
    this.gold += amt;
    this.onGoldChange?.();
    if (this.effects && Number.isFinite(x) && Number.isFinite(y)) {
      this.effects.floatText(x, y, `+${Math.round(amt)}G`, '#ffd27a', 13, 0.75);
    }
    return amt;
  }

  _playfieldCenterX() {
    const { left, right } = this._playfieldInner();
    return (left + right) / 2;
  }

  /** 하단 티어표: 구매 후 발사대(currentTier)에 장전. 클릭은 항상 소비(발사 없음). */
  _tryShopBar(p) {
    const bar = this._evoBarRect || evoBarMetrics();
    if (!this._hitRect(p, bar)) return false;
    if (this.state !== 'playing') return true;
    const { startX, slot, count } = evoBarMetrics();
    const i = Math.floor((p.x - startX) / slot);
    if (i < 0 || i >= count) return true;
    this._tryBuyTier(i + 1);
    return true;
  }

  _tryBuyTier(tier) {
    const view = this.shopView(tier);
    if (!view.buyable) {
      this.effects?.floatText(this.aimX, LAUNCHER_Y - 48, tier === 10 ? '합성 전용' : '무료 발사', '#c9b48a', 14, 0.7);
      return false;
    }
    if (view.locked) {
      this.effects?.floatText(this.aimX, LAUNCHER_Y - 48, '용병술 필요', '#c9b48a', 14, 0.8);
      return false;
    }
    if (view.soldOut) {
      this.effects?.floatText(this.aimX, LAUNCHER_Y - 48, '이번 웨이브 한도', '#ff8080', 14, 0.8);
      return false;
    }
    if (view.broke) {
      this.effects?.floatText(this.aimX, LAUNCHER_Y - 48, '골드 부족', '#ff8080', 14, 0.8);
      return false;
    }
    if (!view.cheat) {
      this.gold -= view.price;
      this.waveShopBuys[tier] = (this.waveShopBuys[tier] || 0) + 1;
      this.onGoldChange?.();
    }
    this.currentTier = tier;
    const paid = view.cheat ? '치트 장전' : `${formatShopGold(view.price)}G`;
    this.effects?.floatText(this.aimX, LAUNCHER_Y - 48, `T${tier} 장전 (${paid})`, '#ffd27a', 15, 0.85);
    return true;
  }

  // ---------- 생성 ----------
  _spawnUnit(tier, x, y, heroType = null) {
    const stat = unitCombatStat(tier, meta.unitLevel(tier));
    const body = Bodies.circle(x, y, stat.r, {
      frictionAir: FRICTION_AIR_UNIT,
      restitution: 0.3,
      friction: 0.05,
      collisionFilter: allyCollisionFilter(false),
    });
    Body.setMass(body, stat.mass);
    World.add(this.engine.world, body);

    const hp = Math.max(1, Math.round(stat.hp));
    const u = {
      body, tier,
      hp, maxHp: hp,
      r: stat.r, color: stat.color,
      attackCd: Math.random() * 0.3,
      isMerging: false, dead: false,
      settled: false, age: 0, engaged: false,
      flashT: 0, abilityT: 0,
      heroType,
      missionDamage: 0,
      bossKills: 0,
      targetDamage: heroType
        ? Math.max(1, Math.round(heroMissionDamage(this.wave) * villageResolve(10, meta.unitLevel(10)).missionReqMult))
        : 0,
      targetKills: heroType ? HERO_MISSION_KILLS : 0,
      gatherToBoss: false,
      firstHit: false,
      tierLocked: false,
      valkTick: 0,
      invulnT: 0,
      buffMoveT: 0,
      buffAtkT: 0,
      buffAspdT: 0,
      miracleRegenT: 0,
    };
    this.units.push(u);
    this.unitByBodyId.set(body.id, u);
    this._onUnitAppeared(u);
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

  _hasLivingBoss(exclude = null) {
    return this.enemies.some((m) => m !== exclude && !m.dead && m.isBoss);
  }

  // 반지름 기반 스폰 위치 탐색: 기존 적(보스 포함)과 원이 겹치지 않는 빈 슬롯
  // 앞열이 겹치면 더 뒷열(스택)로 간다. 보스가 있으면 뒷열은 쓰지 않고 옆칸만.
  _findSpawnSpot(radius, exclude = null, minRow = 0) {
    const cols = this.slotCols || BASE_SLOT_COLS;
    const bossPresent = this._hasLivingBoss(exclude);
    const maxRow = bossPresent ? 1 : 30;
    const startRow = Math.max(0, minRow);
    if (startRow >= maxRow) return null;
    for (let row = startRow; row < maxRow; row++) {
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
      } else if (this._hasLivingBoss()) {
        return null;
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
    // 허들 보스는 bossHurdleExtra를 waveMult에 포함해 ATK·라이브 리스케일도 같이 탐.
    const waveMult = isBoss ? bossWaveMultiplier(this.wave) : waveMultiplier(this.wave);
    const hp = Math.round(stat.hp * waveMult * this.liveMult);
    const slotY = isBoss ? this.lineY : (this.lineY - row * SLOT_ROW_H);
    const spawnY = ENEMY_SPAWN_Y;
    const joining = spawnY < slotY - JOIN_ARRIVE_EPS;
    const m = {
      key, isBoss, row, col, x: isBoss ? this._playfieldCenterX() : x,
      y: joining ? spawnY : slotY,
      joining,
      hp, maxHp: hp, waveMult,
      attackCd: Math.random() * 0.4,
      stunT: 0, burn: null, flashT: 0, lastHitT: 999, dead: false,
    };
    this.enemies.push(m);

    if (isBoss) this._compactEnemySlots();

    if (!isBoss && !this.bossActive) this.waveTrashSpawned = (this.waveTrashSpawned || 0) + 1;
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
      } else if (this._hasLivingBoss()) {
        other.row = 0;
        other.col = -1;
        other.joining = true;
        other.y = ENEMY_SPAWN_Y;
        other.x = this._slotX(0);
      } else {
        other.row = Math.max((Number(other.row) || 0) + 1, 1);
        if (!other.joining) other.y = this._enemySlotY(other);
      }
      if ((Number(other.col) || 0) >= 0) this.occupiedSlots.add(`${other.row}:${other.col}`);
    }
  }

  // 같은 열의 착지 적과 목표 슬롯이 겹치면 더 뒷열로. 옆열 겹침으로 구멍 메우기를 막지 않음.
  _ensureJoinSlotClear(m) {
    if (!m || m.dead || !m.joining) return;
    if (!m.isBoss && (Number(m.col) < 0)) return;
    const stat = MONSTERS[m.key];
    if (m.isBoss) {
      m.x = this._playfieldCenterX();
      this._displaceOverlapping(m);
      return;
    }
    const slotY = this._enemySlotY(m);
    if (!this._slotBlockedInColumn(m, m.x, slotY)) return;
    this.occupiedSlots.delete(`${m.row}:${m.col}`);
    const nextRow = this._hasLivingBoss() ? 0 : m.row + 1;
    const spot = this._findSpawnSpot(stat.r, m, nextRow);
    if (spot) {
      m.row = spot.row;
      m.col = spot.col;
      m.x = spot.x;
    } else if (this._hasLivingBoss()) {
      m.row = 0;
      m.col = -1;
      m.joining = true;
      m.y = ENEMY_SPAWN_Y;
      m.x = this._slotX(0);
      return;
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

    if (bosses.length > 0) {
      const used = new Set();
      const assignFront = (m, col) => {
        const x = this._slotX(col);
        m.row = 0;
        m.col = col;
        m.x = x;
        const slotY = this.lineY;
        if (m.y + JOIN_ARRIVE_EPS < slotY) m.joining = true;
        else {
          m.y = slotY;
          m.joining = false;
        }
        used.add(col);
        this.occupiedSlots.add(`0:${col}`);
      };
      const parkAtCamp = (m) => {
        m.row = 0;
        m.col = -1;
        m.joining = true;
        m.y = ENEMY_SPAWN_Y;
        m.x = this._slotX(0);
      };
      const tryCol = (m, col) => {
        if (used.has(col) || col < 0 || col >= cols) return false;
        const radius = MONSTERS[m.key].r;
        const x = this._slotX(col);
        if (slotBlockedByBoss(x, this.lineY, radius)) return false;
        assignFront(m, col);
        return true;
      };
      for (const m of living) {
        if (tryCol(m, Number(m.col))) continue;
        let placed = false;
        for (let c = 0; c < cols; c++) {
          if (tryCol(m, c)) {
            placed = true;
            break;
          }
        }
        if (!placed) parkAtCamp(m);
      }
      return;
    }

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

  _allyDist(a, b) {
    return Math.hypot(
      a.body.position.x - b.body.position.x,
      a.body.position.y - b.body.position.y,
    );
  }

  _refreshVillageAuras() {
    this._villageAura = collectGlobalAuras(this.units, (t) => meta.unitLevel(t));
    return this._villageAura;
  }

  _bestNearbyValue(u, pickRadius, pickValue) {
    let best = 0;
    for (const s of this.units) {
      if (s.dead) continue;
      const p = this._unitStat(s).village;
      const v = pickValue(p, s);
      if (!(v > 0)) continue;
      const r = pickRadius(p, s);
      if (s === u || this._allyDist(u, s) <= r) best = Math.max(best, v);
    }
    return best;
  }

  _bestSacrifice(u) {
    let best = null;
    let bestShare = 0;
    for (const s of this.units) {
      if (s.dead || s === u) continue;
      const p = this._unitStat(s).village;
      const share = p.sacrificeShare || 0;
      if (!(share > 0)) continue;
      if (this._allyDist(u, s) > (p.sacrificeRadius || 110)) continue;
      if (share > bestShare) {
        bestShare = share;
        best = { src: s, share, keep: p.sacrificeKeep || 1 };
      }
    }
    return best;
  }

  _allyMoveMult(u) {
    const aura = this._villageAura || {};
    const nearby = this._bestNearbyValue(
      u,
      (p) => p.captainRadius || 70,
      (p) => p.captainAdvance || 0,
    );
    let m = 1 + (aura.militiaAdvance || 0) + (aura.armyMove || 0) + nearby;
    if ((u.buffMoveT || 0) > 0) m *= 1.5;
    return m;
  }

  _allyAtkMult(u) {
    const aura = this._villageAura || {};
    let m = 1 + (aura.armyAtk || 0) + (aura.heroArmyAtk || 0);
    if ((u.buffAtkT || 0) > 0) m *= 1.5;
    if (this._jeanneBuffed(u)) {
      const kit = this._jeanneKit();
      m *= kit?.damageBuff || HEROES.jeanne.damageBuff;
    }
    return m;
  }

  _jeanneKit() {
    const j = this.units.find((u) => !u.dead && u.heroType === 'jeanne');
    if (!j) return HEROES.jeanne;
    return heroKit('jeanne', meta.unitLevel(10), this._villageAura) || HEROES.jeanne;
  }

  _applyLaunchPassives(u) {
    if (!u || u.dead) return;
    const p = this._unitStat(u).village;
    const aura = this._villageAura || this._refreshVillageAuras();
    if (u.tier === 1) {
      const chance = (p.awakenChance || 0) * (aura.militiaAwakenMult || 1);
      const bucket = Math.floor((this.wave - 1) / 5);
      if (chance > 0 && this._awakenBucket !== bucket && Math.random() < chance) {
        this._awakenBucket = bucket;
        const { x, y } = u.body.position;
        this._removeUnit(u);
        const hero = this._summonHero(x, y);
        hero.fromLaunch = false;
        hero.settled = true;
        this.effects.floatText(x, y - 36, '영웅 각성!', '#FFD700', 20, 1.2);
        return;
      }
    }
    if ((p.launchDash || 0) > 0 && Math.random() < p.launchDash) {
      const holdY = this.lineY + 20 + u.r;
      Body.setPosition(u.body, { x: u.body.position.x, y: holdY });
      u.settled = true;
      u.fromLaunch = false;
      u.body.collisionFilter = allyCollisionFilter(false);
      setVelPxS(u.body, 0, 0);
      this.effects.floatText(u.body.position.x, u.body.position.y - u.r, '돌격!', '#ffe7a0', 13, 0.6);
    }
    const dur = p.launchBuffDur || 5;
    if ((p.launchMoveChance || 0) > 0 && Math.random() < p.launchMoveChance) u.buffMoveT = dur;
    if ((p.launchAtkChance || 0) > 0 && Math.random() < p.launchAtkChance) u.buffAtkT = dur;
    if ((p.launchAspdChance || 0) > 0 && Math.random() < p.launchAspdChance) u.buffAspdT = dur;
  }

  _onUnitAppeared(u) {
    if (!u || u.dead) return;
    const p = this._unitStat(u).village;
    if ((p.appearExecute || 0) > 0 && Math.random() < p.appearExecute) {
      this.effects.floatText(CANVAS_W / 2, 280, '드래곤 강림!', '#ff6b6b', 22, 1.2);
      for (const m of [...this.enemies]) {
        if (m.dead) continue;
        if (m.isBoss) this._damageEnemy(m, m.maxHp * 0.3, u);
        else this._damageEnemy(m, m.hp, u);
      }
      return;
    }
    if ((p.appearHpPct || 0) > 0) {
      for (const m of [...this.enemies]) {
        if (!m.dead) this._damageEnemy(m, m.hp * p.appearHpPct, u);
      }
    }
  }

  _damageAlly(u, raw, { fromEnemy = true, skipSacrifice = false } = {}) {
    if (!u || u.dead) return 0;
    if ((u.invulnT || 0) > 0) return 0;
    const p = this._unitStat(u).village;
    const aura = this._villageAura || {};
    if (fromEnemy && !u._enemyHitOnce) {
      u._enemyHitOnce = true;
      if (Math.random() < (p.firstHitIgnore || 0)) {
        const msg = Math.random() < 0.5 ? '피했다!' : '살았다!';
        this.effects.floatText(u.body.position.x, u.body.position.y - u.r, msg, '#ffe7a0', 14, 0.7);
        return 0;
      }
    }
    const crisis = this._bestNearbyValue(
      u,
      (vp) => vp.crisisRadius || 70,
      (vp) => vp.crisisDodge || 0,
    );
    if (fromEnemy && crisis > 0 && Math.random() < crisis) {
      this.effects.floatText(u.body.position.x, u.body.position.y - u.r, '감지!', '#87CEFA', 11, 0.4);
      return 0;
    }
    let dmg = Math.max(0, raw);
    dmg *= (1 - (p.selfDr || 0));
    dmg *= (1 - this._bestNearbyValue(u, (vp) => vp.shieldRadius || 50, (vp) => vp.shieldDr || 0));
    dmg *= (1 - (aura.armyDr || 0));
    dmg *= (1 - (aura.heroArmyDr || 0));
    if (!skipSacrifice && u.tier !== 7) {
      const sac = this._bestSacrifice(u);
      if (sac && sac.share > 0 && sac.src && !sac.src.dead) {
        const transferred = dmg * sac.share;
        dmg -= transferred;
        this._damageAlly(sac.src, transferred * sac.keep, { fromEnemy: false, skipSacrifice: true });
      }
    }
    return this._applyAllyHpLoss(u, dmg, { lucky: fromEnemy });
  }

  _applyAllyHpLoss(u, dmg, { lucky = false } = {}) {
    if (!u || u.dead || !(dmg > 0)) return 0;
    if ((u.invulnT || 0) > 0) return 0;
    const p = this._unitStat(u).village;
    if (lucky && u.hp - dmg <= 0 && (p.luckySurvive || 0) > 0 && Math.random() < p.luckySurvive) {
      const dealt = Math.max(0, u.hp - 1);
      u.hp = 1;
      u.flashT = 0.12;
      this.effects.floatText(u.body.position.x, u.body.position.y - u.r, '생존!', '#ffe7a0', 12, 0.5);
      return dealt;
    }
    const dealt = Math.min(u.hp, dmg);
    u.hp -= dmg;
    u.flashT = 0.12;
    if (u.hp <= 0) this._killAlly(u);
    return dealt;
  }

  _killAlly(u) {
    if (!u || u.dead) return;
    this._onAllyDeathPassives(u);
    this.effects.burst(u.body.position.x, u.body.position.y, u.color, 10, 3, 3);
    this._removeUnit(u);
  }

  _onAllyDeathPassives(u) {
    const p = this._unitStat(u).village;
    if ((p.deathGoldChance || 0) > 0 && Math.random() < p.deathGoldChance) {
      this._grantGold(p.deathGold, u.body.position.x, u.body.position.y - 20);
    }
    if ((p.deathLineFreezeChance || 0) > 0 && this._unitNearFront(u)
      && Math.random() < p.deathLineFreezeChance) {
      this.lineFreezeT = Math.max(this.lineFreezeT || 0, p.deathLineFreezeDur || 3);
      this.effects.floatText(CANVAS_W / 2, this.lineY, '결사항전!', '#c9b48a', 16, 0.8);
    }
    if (p.miracleOnDeath && this._miracleWave !== this.wave) {
      this._miracleWave = this.wave;
      for (const a of this.units) {
        if (a.dead || a === u) continue;
        a.hp = a.maxHp;
        a.miracleRegenT = 7;
      }
      this.effects.floatText(CANVAS_W / 2, 300, '기적!', '#FFD700', 22, 1.2);
    }
  }

  _tickVillageAuras(dt) {
    const aura = this._villageAura || this._refreshVillageAuras();
    this.dragonFearCd = Math.max(0, (this.dragonFearCd || 0) - dt);
    this.marshalInvulnCd = Math.max(0, (this.marshalInvulnCd || 0) - dt);
    this.heroSmiteT = (this.heroSmiteT || 0) + dt;
    for (const u of this.units) {
      if (u.dead) continue;
      u.invulnT = Math.max(0, (u.invulnT || 0) - dt);
      u.buffMoveT = Math.max(0, (u.buffMoveT || 0) - dt);
      u.buffAtkT = Math.max(0, (u.buffAtkT || 0) - dt);
      u.buffAspdT = Math.max(0, (u.buffAspdT || 0) - dt);
      u.miracleRegenT = Math.max(0, (u.miracleRegenT || 0) - dt);
    }
    if (aura.fearFreeze > 0 && this.dragonFearCd <= 0) {
      this.lineFreezeT = Math.max(this.lineFreezeT || 0, aura.fearFreeze);
      this.dragonFearCd = 30;
      this.effects.floatText(CANVAS_W / 2, this.lineY - 24, '드래곤 피어!', '#ff8a65', 18, 0.9);
    }
    if (aura.invulnPeriod > 0) {
      if (!this._marshalInvulnArmed) {
        this._marshalInvulnArmed = true;
        this.marshalInvulnCd = aura.invulnPeriod;
      } else if (this.marshalInvulnCd <= 0) {
        this.marshalInvulnCd = aura.invulnPeriod;
        for (const a of this.units) {
          if (!a.dead) a.invulnT = Math.max(a.invulnT || 0, aura.invulnDur || 3);
        }
        this.effects.floatText(CANVAS_W / 2, 280, '필사즉생!', '#e0d0ff', 20, 1.1);
      }
    } else {
      this._marshalInvulnArmed = false;
    }
    if (aura.smitePeriod > 0 && this.heroSmiteT >= aura.smitePeriod) {
      this.heroSmiteT = 0;
      const hero = this.units.find((a) => !a.dead && a.heroType);
      if (hero) {
        const atk = this._unitStat(hero).atk * (aura.smiteAtkFrac || 0.35);
        this.effects.floatText(CANVAS_W / 2, 250, '신벌!', '#ffe7a0', 18, 0.8);
        for (const m of [...this.enemies]) {
          if (!m.dead) this._damageEnemy(m, atk, hero);
        }
      }
    }
  }

  _knightSwapFront(knight) {
    let best = null;
    let bestY = knight.body.position.y;
    for (const a of this.units) {
      if (a.dead || a === knight || !a.settled) continue;
      if (a.tier < 1 || a.tier > 4) continue;
      if (a.body.position.y < bestY) {
        bestY = a.body.position.y;
        best = a;
      }
    }
    if (!best) return;
    const kp = { x: knight.body.position.x, y: knight.body.position.y };
    const bp = { x: best.body.position.x, y: best.body.position.y };
    Body.setPosition(knight.body, bp);
    Body.setPosition(best.body, kp);
  }

  _knockbackEnemy(m, px) {
    if (!m || m.dead || !(px > 0)) return;
    if (this._enemyOccupiesLine(m)) {
      this.lineY = Math.max(LINE_START_Y, this.lineY - px);
      this._syncEnemyY(0);
    } else {
      m.y = Math.max(LINE_START_Y - 80, m.y - px);
    }
  }

  _grantWaveClearRewards(clearedWave) {
    let gold = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      gold += this._unitStat(u).village.waveGold || 0;
    }
    if (gold > 0) this._grantGold(gold, CANVAS_W / 2, 248);
    let medals = medalsForClearedWave(clearedWave);
    if (clearedWave >= VILLAGE_CLEAR_WAVE) medals += VILLAGE_CLEAR_BONUS;
    if (medals > 0) {
      meta.addMedals(medals);
      this.runMedals = (this.runMedals || 0) + medals;
      this.effects.floatText(CANVAS_W / 2, 332, `훈장 +${medals}`, '#e8c878', 18, 1.2);
    }
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
      if (a.tierLocked || b.tierLocked) continue;
      if (a.tier !== b.tier || a.tier >= 10) continue;
      const newTier = a.tier + 1;
      const air = (a.fromLaunch && !a.settled) || (b.fromLaunch && !b.settled);
      const airMax = Math.max(1, Math.round(BALANCE.airMergeMaxTier ?? 5));
      if (air && newTier > airMax) continue;
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
      if (!aOk || !bOk || a.tierLocked || b.tierLocked) {
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
      this._onProjectileMerge(a, b, pos.x, pos.y);
      this._grantScore(newTier * 5);
      audio.play('merge');
    }
    this.mergeQueue.length = 0;
    for (const u of this.units) {
      if (u.isMerging) u.isMerging = false;
    }
  }

  _onProjectileMerge(a, b, x, y) {
    const projectile = (a && a.fromLaunch && !a.settled) || (b && b.fromLaunch && !b.settled);
    if (!projectile) return;
    this.mergeCombo = (this.mergeCombo || 0) + 1;
    if (this.mergeCombo < 2) return;
    const refund = Math.max(0, Math.min(1, BALANCE.mergeComboCdRefund ?? 0.5));
    this.launchCd *= (1 - refund);
    this.effects.floatText(x, y - 52, `Combo x${this.mergeCombo}!`, '#ffd27a', 20, 0.95);
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
    const w = this.wave;
    const pool = [
      ['goblin', w < 5 ? 48 : (w < 10 ? 36 : 26)],
    ];
    if (w >= 2) pool.push(['skeleton', 24]);
    if (w >= 2) pool.push(['orc', w >= 10 ? 24 : (w >= 5 ? 20 : 16)]);
    if (w >= 5) pool.push(['troll', w >= 15 ? 18 : (w >= 10 ? 14 : 8)]);
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

  _waveSpawnInterval() {
    const accel = BALANCE.spawnIntervalAccel ?? 0.22;
    const floor = BALANCE.spawnIntervalFloor ?? 0.9;
    const wave = Math.max(1, this.wave);
    return Math.max(floor, BALANCE.spawnInterval / (1 + (wave - 1) * accel));
  }

  _campRaidMult() {
    const campTop = CAMP_DEST_Y;
    const campBot = CAMP_DEST_Y + CAMP_DRAW_H;
    let n = 0;
    for (const u of this.units) {
      if (u.dead || !u.body || !u.settled) continue;
      const y = u.body.position.y;
      if (y >= campTop && y <= campBot) n++;
    }
    if (n <= 0) return 1;
    const min = BALANCE.spawnCampRaidMin ?? 2;
    const max = BALANCE.spawnCampRaidMax ?? 3;
    return Math.min(max, min + (n - 1) * ((max - min) / 2));
  }

  // 0 = 아군이 캠프에서 멂(또는 없음), 1 = 전열이 캠프 하단에 닿음.
  // 웨이브라인은 시작부터 캠프에 있어서 라인 기준이면 초반부터 러시가 걸린다.
  _allyCampProximity() {
    const range = BALANCE.spawnCampApproachRange ?? 200;
    if (!(range > 0)) return 0;
    const campBot = LINE_START_Y;
    const slack = 28;
    let best = Infinity;
    for (const u of this.units) {
      if (u.dead || !u.body || !u.settled) continue;
      const y = u.body.position.y;
      if (y < best) best = y;
    }
    if (!Number.isFinite(best)) return 0;
    const dist = Math.max(0, best - campBot);
    if (dist <= slack) return 1;
    return Math.max(0, Math.min(1, 1 - dist / range));
  }

  /** 아군-캠프 근접 타이머 배율. ease-in이라 멀리선 약하고 캠프 앞에서 급가속. */
  _campApproachTimerMult() {
    const prox = this._allyCampProximity();
    const k = BALANCE.spawnCampApproachEase ?? 1.5;
    const touch = Math.max(1, BALANCE.spawnCampTouchMult ?? 6);
    return 1 + (prox ** k) * (touch - 1);
  }

  /**
   * 스폰 타이머 소진 속도. 접근 배율 × (있으면) 캠프 침입 배율 × 리스폰 배율.
   * 캠프 러시 플로어는 배율 1 기준이고, spawnRateMult가 그 위에 곱해진다.
   */
  _spawnTimerSpeed() {
    const speed = this._campRaidMult() * this._campApproachTimerMult();
    const interval = this._waveSpawnInterval();
    const floor = BALANCE.spawnCampRushFloor ?? 0.32;
    let capped = speed;
    if (floor > 0 && interval > 0) {
      capped = Math.min(speed, interval / floor);
    }
    const rate = Number.isFinite(this.spawnRateMult) ? this.spawnRateMult : 1;
    return capped * Math.max(0, rate);
  }

  _livingTrashEnemies() {
    let n = 0;
    for (const m of this.enemies) {
      if (m.dead || m.isBoss) continue;
      n++;
    }
    return n;
  }

  _waveQuotaFull() {
    const need = killsNeeded(this.wave);
    if ((this.waveTrashSpawned || 0) >= need) return true;
    return this.kills + this._livingTrashEnemies() >= need;
  }

  _updateSpawning(dt) {
    if (this.bossWarnT > 0) {
      this.bossWarnT -= dt;
      if (this.bossWarnT <= 0) this._beginBossArrival();
      return;
    }

    if (!this.bossActive && !this.bossPending && this.kills >= killsNeeded(this.wave)) {
      this.bossPending = true;
      this.bossWarnT = 1.6;
      this.effects.floatText(CANVAS_W / 2, 250, '⚠ 보스 출현! ⚠', '#FF3030', 30, 1.6);
      audio.play('boss');
      return;
    }

    if (this.bossActive) {
      this._updateBossMinionSpawning(dt);
      return;
    }

    if (this._waveQuotaFull()) return;

    this.spawnTimer -= dt * this._spawnTimerSpeed();
    if (this.spawnTimer > 0) return;
    const jitter = 0.82 + Math.random() * 0.36;
    this.spawnTimer = this._waveSpawnInterval() * jitter;
    if (this._waveQuotaFull()) return;
    this._spawnEnemy(this._pickMonster());
  }

  _bossMinionCap() {
    return Math.max(0, Math.round(BALANCE.bossMinionCap ?? 4));
  }

  _beginBossArrival() {
    this._spawnEnemy('boss');
    this.bossActive = true;
    this._markBossGather();
    const { escort, knights } = bossEscortForWave(this.wave);
    const cap = this._bossMinionCap();
    for (let i = 0; i < knights; i++) {
      if (this._livingTrashEnemies() >= cap) break;
      this._spawnEnemy('skelknight');
    }
    const extra = Math.max(0, escort - knights);
    for (let i = 0; i < extra; i++) {
      if (this._livingTrashEnemies() >= cap) break;
      this._spawnEnemy(this._pickMonster());
    }
    this.spawnTimer = this._waveSpawnInterval();
    this.effects.burst(CANVAS_W / 2, ENEMY_SPAWN_Y, '#B22222', 30, 5, 5);
    this.effects.floatText(CANVAS_W / 2, 330, '보스 출현! 병력 집결!', '#FF9040', 26, 2.0);
  }

  _updateBossMinionSpawning(dt) {
    const cap = this._bossMinionCap();
    if (this._livingTrashEnemies() >= cap) return;
    this.spawnTimer -= dt * this._spawnTimerSpeed();
    if (this.spawnTimer > 0) return;
    this.spawnTimer = this._waveSpawnInterval() * (0.82 + Math.random() * 0.36);
    if (this._livingTrashEnemies() >= cap) return;
    this._spawnEnemy(this._pickMonster());
  }

  _dismissBossMinions() {
    const leftover = this.enemies.filter((m) => !m.dead && !m.isBoss);
    if (leftover.length === 0) return;
    for (const m of leftover) {
      const stat = MONSTERS[m.key];
      this.effects.burst(m.x, m.y, stat.color, 10, 3, 3);
      m.dead = true;
    }
    this.enemies = this.enemies.filter((m) => !m.dead);
    this._compactEnemySlots();
    this.effects.floatText(CANVAS_W / 2, 280, '잔당 도주!', '#c9b48a', 18, 1.2);
  }

  _onEnemyKilled(m) {
    const stat = MONSTERS[m.key];
    this._grantScore(stat.score);
    const goldGain = (stat.gold ?? 0) * (this._effects().bountyMult || 1);
    this._grantGold(goldGain, m.x, m.y - 34);
    this.effects.burst(m.x, m.y, stat.color, 12, 3, 3);
    this.effects.floatText(m.x, m.y - 20, `+${stat.score}`, '#ffd', 13, 0.7);
    audio.play(m.isBoss ? 'boss' : 'kill');
    if (m.isBoss) {
      this._dismissBossMinions();
      const bonus = Math.round(PROGRESSION.bossXpPerWave * this.wave);
      this.runXpBoss = (this.runXpBoss || 0) + bonus;
      this._addRunXp(bonus);
      this.effects.floatText(CANVAS_W / 2, 360, `보스 XP +${bonus}`, '#ffd27a', 18, 1.4);
      this.bossActive = false;
      this.bossPending = false;
      const clearedWave = this.wave;
      this.wave += 1;
      this.kills = 0;
      this.waveTrashSpawned = 0;
      this.spawnTimer = this._waveSpawnInterval() * 0.7;
      this._refillArcherAmmo();
      this._resetShopBuys();
      this._onBossSlain();
      const clearAt = Math.max(1, Math.round(BALANCE.clearWave || 30));
      this._grantWaveClearRewards(clearedWave);
      if (clearedWave >= clearAt) {
        this.resultWave = clearedWave;
        this._removeEnemy(m);
        this._runComplete();
        return;
      }
      this.effects.floatText(CANVAS_W / 2, 300, `웨이브 ${this.wave} 시작!`, '#7CFC00', 26, 2.0);
      audio.play('wave');
      this._maybeOfferAutoTutorial();
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
    if (dealt > 0) m.lastHitT = 0;
    if (source && source.heroType && !source.dead) {
      source.missionDamage = (source.missionDamage || 0) + dealt;
    }
    if (m.hp <= 0) this._onEnemyKilled(m);
    return dealt;
  }

  // ---------- 웨이브라인 이동 (줄다리기) ----------
  _unitStat(u) {
    return unitCombatStat(u.tier, meta.unitLevel(u.tier));
  }

  // 예약 슬롯에 착지한 적 (뒷열 스택 포함). 합류/구멍에 떠 있는 적은 제외.
  _enemyArrived(m) {
    if (!m || m.dead || m.joining) return false;
    return m.y + JOIN_ARRIVE_EPS >= this._enemySlotY(m);
  }

  _enemyFrontRow(m) {
    return !!(m && (m.isBoss || (Number(m.row) || 0) === 0));
  }

  // 전열 접촉만. 뒷열·합류·라인에 안 닿은 적은 라인 속도에 안 넣음.
  // joining 플래그가 꺼져 있어도 중심이 라인에 닿기 전에는 밀지 않음.
  _enemyOccupiesLine(m) {
    if (!m || m.dead || m.joining) return false;
    if (!this._enemyFrontRow(m)) return false;
    if (m.y + JOIN_ARRIVE_EPS < this.lineY) return false;
    if (m.y > this.lineY + LINE_CONTACT_EPS) return false;
    return true;
  }

  // 슬롯/라인보다 위에 있으면 합류 중. occupy 전에 호출해 플래그 구멍을 막음.
  _refreshJoinFlags() {
    for (const m of this.enemies) {
      if (m.dead) continue;
      if (m.y + JOIN_ARRIVE_EPS < this._enemySlotY(m)) m.joining = true;
      if (this._enemyFrontRow(m) && m.y + JOIN_ARRIVE_EPS < this.lineY) m.joining = true;
    }
  }

  joinedEnemies() {
    return this.enemies.filter((m) => this._enemyOccupiesLine(m));
  }

  _unitInRangeOf(u, m) {
    if (!u || u.dead || !m || m.dead) return false;
    const range = this._unitStat(u).range;
    const { x, y } = u.body.position;
    const er = MONSTERS[m.key].r;
    return this._meleeGap(x, y, u.r, m.x, m.y, er) <= range;
  }

  _unitEngaged(u, onLine) {
    const joined = onLine || this.joinedEnemies();
    return joined.some((m) => this._unitInRangeOf(u, m));
  }

  // 사거리 안 아군이 없는 전열 적. 다른 열의 저지력이 이 적을 붙잡지 못함.
  _occupierHeld(m) {
    for (const u of this.units) {
      if (this._unitInRangeOf(u, m)) return true;
    }
    return false;
  }

  // 슬롯 착지 지점 기준으로, 그 열을 막을 전열 아군이 있는지.
  _allyWouldHoldAt(u, x, y, enemyR) {
    if (!u || u.dead || !u.settled) return false;
    const range = this._unitStat(u).range;
    const { x: ux, y: uy } = u.body.position;
    return this._meleeGap(ux, uy, u.r, x, y, enemyR) <= range;
  }

  // 착지 전/빈 전열인데 아군이 안 막는 적이 있으면 빈 라인 후퇴를 하지 않음.
  _incomingLaneUncovered() {
    for (const m of this.enemies) {
      if (m.dead) continue;
      const destX = m.isBoss ? this._playfieldCenterX() : m.x;
      const destY = this._enemySlotY(m);
      const er = MONSTERS[m.key].r;
      let held = false;
      for (const u of this.units) {
        if (this._allyWouldHoldAt(u, destX, destY, er)) {
          held = true;
          break;
        }
      }
      if (!held) return true;
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

  // 같은 열 뒷열(착지, 합류 아님). 보스는 열 스택에서 빼 진격 가산을 받지 않음.
  _columnRearCount(front) {
    if (!front || front.dead || front.isBoss) return 0;
    const col = Number(front.col);
    if (!Number.isFinite(col) || col < 0) return 0;
    let n = 0;
    for (const m of this.enemies) {
      if (m === front || m.dead || m.joining || m.isBoss) continue;
      if ((Number(m.row) || 0) < 1) continue;
      if ((Number(m.col) || 0) !== col) continue;
      n += 1;
    }
    return n;
  }

  _stackAdvanceMult(front) {
    if (!front || front.isBoss) return 1;
    const per = Number.isFinite(BALANCE.stackAdvancePerRear) ? BALANCE.stackAdvancePerRear : 0.5;
    const cap = Number.isFinite(BALANCE.stackAdvanceCap) ? BALANCE.stackAdvanceCap : 3;
    return Math.min(cap, 1 + per * this._columnRearCount(front));
  }

  _occupierPushSpeed(m) {
    if (!m || m.stunT > 0) return 0;
    return MONSTERS[m.key].speed * this.liveMult * this._stackAdvanceMult(m)
      * Math.max(0, 1 - (this._villageAura?.enemySpdDebuff || 0));
  }

  _updateLine(dt) {
    this.chargeStutterT = Math.max(0, (this.chargeStutterT || 0) - dt);
    this._refreshJoinFlags();
    this.lineFreezeT = Math.max(0, (this.lineFreezeT || 0) - dt);
    if (this.chargeStutterT > 0 || this.lineFreezeT > 0) {
      this.netSpeed = 0;
      this._syncEnemyY(dt);
      return;
    }
    const joined = this.joinedEnemies();
    // 착지한 적이 없으면 전진하지 않음. 막힌 열만 있으면 전열 저지력으로 밀어올림.
    // 아군이 안 막는 열로 합류 중이면 후퇴하지 않고 착지를 기다림.
    if (joined.length === 0) {
      if (this._incomingLaneUncovered()) {
        this.netSpeed = 0;
        this._syncEnemyY(dt);
        return;
      }
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
    const unheld = joined.filter((m) => !this._occupierHeld(m));
    let advance = BALANCE.baseLineSpeed;
    // 막히지 않은 열의 전열은 다른 열 저지력에 묶이지 않고 라인을 민다.
    if (unheld.length > 0) {
      for (const m of unheld) {
        advance += this._occupierPushSpeed(m);
      }
      this.netSpeed = advance;
    } else {
      for (const m of joined) {
        advance += this._occupierPushSpeed(m);
      }
      let stopping = 0;
      for (const u of this.units) {
        if (u.engaged) stopping += this._unitStop(u);
      }
      this.netSpeed = advance - stopping;
    }
    // 착지한 보스만. joining 중이면 occupied가 아니라 여기 안 옴(빈 라인 분기로 감).
    if (joined.some((m) => m.isBoss) && !this._villageAura?.bossMinAdvanceZero) {
      this.netSpeed = Math.max(this.netSpeed, BALANCE.bossMinAdvance);
    }
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

  // 합류 중: 슬롯이 아래면 내려감. 착지 후: 슬롯에 고정.
  // destY가 현재 y보다 위인 채로 y를 더하면 "도착"으로 오인되어 라인에 안 붙은 채 joining이 꺼진다.
  _syncEnemyY(dt) {
    const baseJoin = Number.isFinite(BALANCE.enemyJoinSpeed) ? Math.max(0, BALANCE.enemyJoinSpeed) : 80;
    const descent = Math.max(0, this.netSpeed || 0);
    const join = Math.max(baseJoin, descent + JOIN_CATCHUP_BONUS);
    const step = dt || 0;
    for (const m of this.enemies) {
      if (m.dead) continue;
      if (!m.isBoss && (Number(m.col) < 0)) {
        m.joining = true;
        m.y = ENEMY_SPAWN_Y;
        continue;
      }
      const slotY = this._enemySlotY(m);
      if (m.y + JOIN_ARRIVE_EPS < slotY) m.joining = true;
      if (m.joining) {
        this._ensureJoinSlotClear(m);
        const destY = this._enemySlotY(m);
        if (m.y + JOIN_ARRIVE_EPS < destY) {
          m.y = Math.min(destY, m.y + join * step);
          if (m.y + JOIN_ARRIVE_EPS >= destY) {
            m.y = destY;
            m.joining = false;
            if (m.isBoss) this._displaceOverlapping(m);
          }
        } else {
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
    const fx = this._effects();
    const advPx = Number.isFinite(fx.advanceSpeed)
      ? fx.advanceSpeed
      : BALANCE.unitAdvanceSpeed * (fx.advanceMult || 1);
    const settleSpeed = Math.max(advPx * 1.25, 24);
    const launchMax = BALANCE.launchSpeed;
    for (const u of this.units) {
      u.age += dt;
      const v = getVelPxS(u.body);
      const spd = Math.hypot(v.x, v.y);
      if (!u.settled && (
        u.age >= LAUNCH_BURST_MAX_S
        || (u.age >= LAUNCH_BURST_MIN_S && spd <= settleSpeed)
      )) {
        if (u.fromLaunch) this.mergeCombo = 0;
        u.settled = true;
        u.fromLaunch = false;
        u.body.collisionFilter = allyCollisionFilter(false);
      }
      if (!u.settled && spd > launchMax && spd > 0) {
        setVelPxS(u.body, v.x / spd * launchMax, v.y / spd * launchMax);
      }
      const pos = u.body.position;
      const minHoldY = this.lineY + 20 + u.r;
      if (pos.y <= minHoldY) {
        const v = getVelPxS(u.body);
        if (v.y < 0) setVelPxS(u.body, v.x, 0);
      } else if (u.settled) {
        const v = getVelPxS(u.body);
        setVelPxS(u.body, v.x * 0.9, -advPx * this._allyMoveMult(u));
      }
      const vp = this._unitStat(u).village;
      if (u.settled && vp.knightSwap && !u._knightSwapped && this._unitNearFront(u)) {
        u._knightSwapped = true;
        this._knightSwapFront(u);
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
    const maxVx = BALANCE.gatherSpeed * strength;

    for (const u of this.units) {
      if (!u.settled || !u.gatherToBoss) continue;
      if (!engagedAlsoGather && u.engaged) continue;
      const dx = boss.x - u.body.position.x;
      if (Math.abs(dx) < 24) continue; // 보스 열 근처면 정지
      const v = getVelPxS(u.body);
      setVelPxS(u.body, Math.sign(dx) * maxVx, v.y);
    }
  }

  // ---------- 하드 불변식: 어떤 이유로든 아군이 라인을 넘지 못함 ----------
  _enforceLineBoundary() {
    for (const u of this.units) {
      const minY = this.lineY + 14 + u.r;
      const { minX, maxX } = this._friendlyXRange(u.r);
      let x = u.body.position.x;
      let y = u.body.position.y;
      const v = getVelPxS(u.body);
      let vx = v.x;
      let vy = v.y;
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
        setVelPxS(u.body, vx, vy);
      }
    }
  }

  // ---------- 전투 ----------
  _jeanneBuffed(u) {
    if (u.heroType) return false;
    const kit = this._jeanneKit();
    const radius = kit?.auraRadius || HEROES.jeanne.auraRadius;
    for (const h of this.units) {
      if (h.heroType === 'jeanne' && !h.dead) {
        const d = Math.hypot(
          u.body.position.x - h.body.position.x,
          u.body.position.y - h.body.position.y,
        );
        if (d < radius) return true;
      }
    }
    return false;
  }

  // 표면 간 거리. 근접 공격은 이 값이 사거리 이하면 적중 (대각선도 동일).
  _meleeGap(ax, ay, ar, bx, by, br) {
    return Math.hypot(bx - ax, by - ay) - ar - br;
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
        const d = this._meleeGap(x, y, u.r, m.x, m.y, er);
        if (d <= stat.range && d < best) { best = d; target = m; }
      }
      if (!target) continue;
      const aspd = (u.buffAspdT || 0) > 0 ? 1.5 : 1;
      u.attackCd = BALANCE.attackCooldown / aspd;

      const hits = (stat.village.doubleHitChance || 0) > 0 && Math.random() < stat.village.doubleHitChance
        ? 2 : 1;
      for (let hit = 0; hit < hits; hit += 1) {
        if (u.dead || target.dead) break;
        this._performUnitHit(u, target, stat, hit === 0);
      }
      this._checkHeroMission(u);
    }

    // 적 → 아군
    for (const m of [...this.enemies]) {
      if (m.dead || m.stunT > 0 || !this._enemyArrived(m)) continue;
      m.attackCd -= dt;
      if (m.attackCd > 0) continue;
      const stat = MONSTERS[m.key];
      const reach = BALANCE.enemyReach;
      let target = null, best = Infinity;
      for (const u of this.units) {
        if (u.dead) continue;
        const d = this._meleeGap(m.x, m.y, stat.r, u.body.position.x, u.body.position.y, u.r);
        if (d <= reach && d < best) { best = d; target = u; }
      }
      if (!target) continue;
      m.attackCd = BALANCE.attackCooldown;
      this.effects.hitFlash(target.body.position.x, target.body.position.y, '#ff6b6b');
      this._damageAlly(target, this._enemyAtk(m), { fromEnemy: true });
    }
  }

  _performUnitHit(u, target, stat, primary) {
    const vp = stat.village;
    let dmg = stat.atk * this._allyAtkMult(u);
    if ((vp.atkProcChance || 0) > 0 && Math.random() < vp.atkProcChance) {
      dmg *= (1 + (vp.atkProcMult || 0));
    }
    dmg += vp.flatDmg || 0;
    if (primary) this.effects.hitFlash(target.x, target.y, '#fff');

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
    if ((vp.knockbackChance || 0) > 0 && Math.random() < vp.knockbackChance) {
      this._knockbackEnemy(target, vp.knockbackPx || 0);
    }
    if ((vp.breathDmg || 0) > 0) {
      const { x, y } = u.body.position;
      for (const m2 of [...this.enemies]) {
        if (m2.dead || m2 === target) continue;
        if (Math.abs(m2.x - x) > 32 || m2.y > y) continue;
        this._damageEnemy(m2, vp.breathDmg, u);
      }
      this._damageEnemy(target, vp.breathDmg, u);
    }
    if ((vp.hammerSplash || 0) > 0) {
      for (const m2 of [...this.enemies]) {
        if (m2.dead) continue;
        if (Math.hypot(m2.x - target.x, m2.y - target.y) <= 80) {
          this._damageEnemy(m2, vp.hammerSplash, u);
        }
      }
    }
    if (!target.dead) this._damageEnemy(target, dmg, u);
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
      m.lastHitT = (m.lastHitT ?? 999) + dt;
      if (m.hp < m.maxHp) {
        const delay = stat.regenDelay ?? 0;
        if (m.lastHitT >= delay) {
          if (stat.regenPct) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * stat.regenPct * dt);
          else if (stat.regen) m.hp = Math.min(m.maxHp, m.hp + stat.regen * dt);
        }
      }
      m.flashT = Math.max(0, m.flashT - dt);
    }
  }

  _updateUnitAbilities(dt) {
    let bestPal = null;
    let bestHeal = -1;
    for (const u of this.units) {
      if (u.dead || u.tier !== 7) continue;
      const sp = this._unitStat(u).special;
      if (sp && (sp.healPct || 0) > bestHeal) {
        bestHeal = sp.healPct;
        bestPal = u;
      }
    }
    for (const u of [...this.units]) {
      if (u.dead) continue;
      u.abilityT += dt;
      const stat = this._unitStat(u);

      const sp = stat.special;
      // T7 성기사: 가장 강한 오라 1명만 주기 회복 (복사본 중첩 없음)
      if (u.tier === 7 && sp && u === bestPal && u.abilityT >= sp.healPeriod) {
        u.abilityT = 0;
        for (const a of this.units) {
          if (a.dead) continue;
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
        const kit = heroKit(u.heroType, meta.unitLevel(10), this._villageAura);
        if (u.heroType === 'arthur' && kit && u.abilityT >= kit.period) {
          u.abilityT = 0;
          this.effects.lineFlash(this.lineY, '#9be7ff');
          for (const m of [...this.enemies]) {
            if (!m.dead) this._damageEnemy(m, stat.atk * kit.atkFrac, u);
          }
          this._checkHeroMission(u);
        }
        if (u.heroType === 'valkyrie' && kit) {
          u.valkTick += dt;
          if (u.valkTick >= kit.tick) {
            u.valkTick = 0;
            for (const m of [...this.enemies]) {
              if (m.dead) continue;
              const d = Math.hypot(m.x - u.body.position.x, m.y - u.body.position.y);
              if (d < stat.range) this._damageEnemy(m, stat.atk * kit.atkFrac, u);
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
    for (const u of this.units) {
      if (u.dead || u.hp >= u.maxHp) continue;
      let extra = 0;
      if (pct > 0 && (u.engaged || this._unitNearFront(u))) extra += u.maxHp * pct;
      const vp = this._unitStat(u).village;
      if ((vp.frontRegenPerSec || 0) > 0 && this._unitNearFront(u)) extra += vp.frontRegenPerSec;
      extra += u.maxHp * this._bestNearbyValue(
        u,
        (p) => p.holyRadius || 110,
        (p) => p.holyRegen || 0,
      );
      if ((u.miracleRegenT || 0) > 0) extra += u.maxHp * 0.03;
      if (extra > 0) u.hp = Math.min(u.maxHp, u.hp + extra * dt);
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

  _livingHeroes() {
    return this.units.filter((u) => u && !u.dead && u.heroType && !u._ascending);
  }

  _heroForBossCredit() {
    const heroes = this._livingHeroes();
    if (heroes.length === 0) return null;
    let best = heroes[0];
    for (const u of heroes) {
      const kills = u.bossKills || 0;
      const bestKills = best.bossKills || 0;
      if (kills > bestKills) {
        best = u;
        continue;
      }
      if (kills < bestKills) continue;
      if ((u.missionDamage || 0) > (best.missionDamage || 0)) best = u;
    }
    return best;
  }

  _onBossSlain() {
    const u = this._heroForBossCredit();
    if (!u) return;
    u.bossKills = (u.bossKills || 0) + 1;
    this._checkHeroMission(u);
  }

  _checkHeroMission(u) {
    if (!u || u.dead || !u.heroType || u._ascending) return;
    const quota = u.targetDamage || heroMissionDamage(this.wave);
    if ((u.missionDamage || 0) >= quota) {
      this._ascendHero(u);
      return;
    }
    if ((u.bossKills || 0) >= heroBossLimit(this._villageAura)) this._retireHero(u);
  }

  _spawnHeroRemnant(x, y, label) {
    const fallback = HERO_ASCENSION_REPLACEMENT_TIER;
    let tier = rollHeroRemnantTier();
    if (!Number.isFinite(tier) || tier < 1 || tier > UNITS.length) tier = fallback;
    const stat = UNITS[tier - 1] || UNITS[fallback - 1];
    const spawn = this._clampFriendlyPos(x, y, stat.r);
    const unit = this._spawnUnit(tier, spawn.x, spawn.y);
    unit.settled = true;
    if (label) this.effects.floatText(spawn.x, spawn.y - 28, `${label} T${tier} ${stat.name}`, '#e8d5a0', 14, 1.1);
    return unit;
  }

  _retireHero(hero) {
    if (!hero || hero.dead || hero._ascending) return;
    hero._ascending = true;
    const x = hero.body.position.x;
    const y = hero.body.position.y;
    this.effects.burst(x, y, '#c9b48a', 22, 4, 4);
    this.effects.floatText(x, y - 36, '영웅 퇴장', '#e8d5a0', 18, 1.3);
    this._removeUnit(hero);
    this._spawnHeroRemnant(x, y, '잔류');
  }

  _ascendHero(hero) {
    if (!hero || hero.dead || hero._ascending) return;
    hero._ascending = true;
    const x = hero.body.position.x;
    const y = hero.body.position.y;
    const blast = this._unitStat(hero).atk * heroAscendAtkMult(this._villageAura);

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
    audio.play('ascend');
    this._grantScore(HERO_ASCENSION_BONUS_SCORE);

    this._removeUnit(hero);
    const reenter = this._villageAura?.reenterChance || 0;
    if (reenter > 0 && Math.random() < reenter) this._summonHero(x, y);
    else this._spawnHeroRemnant(x, y, '잔류');
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
    const maxStep = 60;
    if (vy < 0) {
      const room = y - minY;
      vy = room <= 0 ? 0 : Math.max(vy, -room * maxStep);
    } else if (vy > 0) {
      const room = maxY - y;
      vy = room <= 0 ? 0 : Math.min(vy, room * maxStep);
    }
    if (vx < 0) {
      const room = x - minX;
      vx = room <= 0 ? 0 : Math.max(vx, -room * maxStep);
    } else if (vx > 0) {
      const room = maxX - x;
      vx = room <= 0 ? 0 : Math.min(vx, room * maxStep);
    }
    return { x: vx, y: vy };
  }

  _applyMergeBlasts() {
    if (!this.mergeBlastQueue.length) return;
    const maxImpulse = MERGE_BLAST_FORCE;
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
        const vel = getVelPxS(u.body);
        const clamped = this._clampBlastVelocity(u, vel.x + nx * mag, vel.y + ny * mag);
        setVelPxS(u.body, clamped.x, clamped.y);
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
    if (this.tutorialFreeze) {
      this.netSpeed = 0;
      this.holdingFire = false;
      this.effects?.update(dt);
      return;
    }
    this.launchCd = Math.max(0, this.launchCd - dt);
    this._tickAutoFire();
    const tax = this._effects().taxPerSec || 0;
    if (tax > 0) this.gold += tax * dt;

    // Matter 속도는 스텝당 px. 이번 엔진 스텝과 같은 stepMs로 적분한다.
    this._stepMs = engineStepMs(dt);
    Engine.update(this.engine, this._stepMs);
    this._processMerges();
    this._refreshVillageAuras();
    this._tickVillageAuras(dt);
    this._updateSpawning(dt);
    this._refreshJoinFlags();
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this._fx = meta.getEffects();
    renderer.draw(this, ctx);
  }

  _hitRect(p, r) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }
}
