// 메타 진행: 레벨/XP/스킬 포인트. localStorage에 저장되어 게임오버·새로고침에도 유지.

import {
  PROGRESSION, SKILLS, SKILL_BY_ID, xpToNextLevel, META_STORAGE_KEY, BALANCE, ECONOMY,
  rankUnlockLevel, advanceSpeedForRank, slotColsForRank, launchTierChances, SHOP_MAX_TIER,
} from './config.js';
import {
  UNIT_MAX_LEVEL, emptyUnitLevels, clampUnitLevel, medalCost,
  VILLAGE_START_LEVEL, VILLAGE_MAX_LEVEL, VILLAGE_LEVEL_COST,
  clampVillageLevel, houseUnlockVillageLevel, isHouseUnlocked,
} from './village.js';

function emptyRanks() {
  const ranks = {};
  for (const s of SKILLS) ranks[s.id] = 0;
  return ranks;
}

function defaultData() {
  return {
    level: 1, xp: 0, skillPoints: 0, ranks: emptyRanks(),
    medals: 0, unitLevels: emptyUnitLevels(), villageLevel: VILLAGE_START_LEVEL,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    const data = defaultData();
    if (Number.isFinite(parsed.level)) data.level = Math.max(1, Math.floor(parsed.level));
    if (Number.isFinite(parsed.xp)) data.xp = Math.max(0, Math.floor(parsed.xp));
    if (Number.isFinite(parsed.skillPoints)) data.skillPoints = Math.max(0, Math.floor(parsed.skillPoints));
    if (parsed.ranks && typeof parsed.ranks === 'object') {
      for (const s of SKILLS) {
        let r = parsed.ranks[s.id];
        if (s.id === 'eliteRecruit' && !Number.isFinite(r) && Number.isFinite(parsed.ranks.higherTier)) {
          r = parsed.ranks.higherTier;
        }
        data.ranks[s.id] = Number.isFinite(r) ? Math.max(0, Math.min(s.maxRank, Math.floor(r))) : 0;
      }
    }
    if (Number.isFinite(parsed.medals)) data.medals = Math.max(0, Math.floor(parsed.medals));
    if (Number.isFinite(parsed.villageLevel)) data.villageLevel = clampVillageLevel(parsed.villageLevel);
    if (parsed.unitLevels && typeof parsed.unitLevels === 'object') {
      for (let t = 1; t <= 10; t++) {
        data.unitLevels[t] = clampUnitLevel(parsed.unitLevels[t] ?? parsed.unitLevels[String(t)] ?? 0);
      }
    }
    return data;
  } catch {
    return defaultData();
  }
}

export class Meta {
  constructor() {
    this.data = load();
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(reason) {
    this._save();
    for (const fn of this.listeners) fn(reason, this.data);
  }

  _save() {
    try {
      localStorage.setItem(META_STORAGE_KEY, JSON.stringify(this.data));
    } catch { /* quota / private mode */ }
  }

  get level() { return this.data.level; }
  get xp() { return this.data.xp; }
  get skillPoints() { return this.data.skillPoints; }
  get ranks() { return this.data.ranks; }
  get medals() { return this.data.medals; }
  get unitLevels() { return this.data.unitLevels; }
  get villageLevel() { return this.data.villageLevel; }
  get xpNeeded() { return xpToNextLevel(this.data.level); }

  villageSpent() {
    return Math.max(0, (this.villageLevel - VILLAGE_START_LEVEL) * VILLAGE_LEVEL_COST);
  }

  isHouseOpen(tier) {
    return isHouseUnlocked(this.villageLevel, tier);
  }

  storedUnitLevel(tier) {
    const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
    return clampUnitLevel(this.data.unitLevels?.[t] ?? 0);
  }

  unitLevel(tier) {
    const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
    if (!this.isHouseOpen(t)) return 0;
    return this.storedUnitLevel(t);
  }

  rank(id) {
    return this.data.ranks[id] || 0;
  }

  spentPoints() {
    let n = 0;
    for (const s of SKILLS) n += (this.data.ranks[s.id] || 0) * s.cost;
    return n;
  }

  addXp(amount) {
    const n = Math.max(0, Math.floor(amount));
    if (n <= 0) return { levelsGained: 0, newLevel: this.data.level };
    this.data.xp += n;
    let gained = 0;
    let guard = 0;
    while (this.data.xp >= xpToNextLevel(this.data.level) && guard++ < 99) {
      this.data.xp -= xpToNextLevel(this.data.level);
      this.data.level += 1;
      this.data.skillPoints += 1;
      gained += 1;
    }
    this._emit('xp');
    return { levelsGained: gained, newLevel: this.data.level };
  }

  canBuy(id) {
    const skill = SKILL_BY_ID[id];
    if (!skill) return { ok: false, reason: 'unknown' };
    const rank = this.rank(id);
    if (rank >= this.effectiveMaxRank(skill)) return { ok: false, reason: 'max' };
    const unlockLevel = rankUnlockLevel(skill, rank + 1);
    if (this.data.level < unlockLevel) {
      return { ok: false, reason: 'level', unlockLevel };
    }
    if (skill.requires && this.rank(skill.requires) < 1) {
      return { ok: false, reason: 'requires', requires: skill.requires };
    }
    if (this.data.skillPoints < skill.cost) return { ok: false, reason: 'points' };
    return { ok: true };
  }

  effectiveMaxRank(skill) {
    if (skill.id === 'archerCount') {
      return Math.max(0, Math.min(skill.maxRank, PROGRESSION.archerMax - 1));
    }
    return skill.maxRank;
  }

  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) return check;
    const skill = SKILL_BY_ID[id];
    this.data.ranks[id] = this.rank(id) + 1;
    this.data.skillPoints -= skill.cost;
    this._emit('buy');
    return { ok: true };
  }

  addMedals(amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (n <= 0) return this.data.medals;
    this.data.medals += n;
    this._emit('medals');
    return this.data.medals;
  }

  setMedals(n) {
    this.data.medals = Math.max(0, Math.floor(Number(n) || 0));
    this._emit('medals');
    return this.data.medals;
  }

  canBuyUnitLevel(tier) {
    const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 0)));
    if (t < 1 || t > 10) return { ok: false, reason: 'unknown' };
    if (!this.isHouseOpen(t)) {
      return { ok: false, reason: 'locked', need: houseUnlockVillageLevel(t) };
    }
    const lv = this.storedUnitLevel(t);
    if (lv >= UNIT_MAX_LEVEL) return { ok: false, reason: 'max' };
    const cost = medalCost(t, lv);
    if (this.data.medals < cost) return { ok: false, reason: 'medals', cost };
    return { ok: true, cost, next: lv + 1 };
  }

  buyUnitLevel(tier) {
    const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 0)));
    const check = this.canBuyUnitLevel(t);
    if (!check.ok) return check;
    this.data.medals -= check.cost;
    this.data.unitLevels[t] = this.storedUnitLevel(t) + 1;
    this._emit('village');
    return { ok: true, level: this.storedUnitLevel(t) };
  }

  setUnitLevel(tier, level) {
    const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 0)));
    if (t < 1 || t > 10) return 0;
    this.data.unitLevels[t] = clampUnitLevel(level);
    this._emit('village');
    return this.data.unitLevels[t];
  }

  canBuyVillageLevel() {
    const lv = this.villageLevel;
    if (lv >= VILLAGE_MAX_LEVEL) return { ok: false, reason: 'max' };
    const cost = VILLAGE_LEVEL_COST;
    if (this.data.skillPoints < cost) return { ok: false, reason: 'points', cost };
    return { ok: true, cost, next: lv + 1 };
  }

  buyVillageLevel() {
    const check = this.canBuyVillageLevel();
    if (!check.ok) return check;
    this.data.skillPoints -= check.cost;
    this.data.villageLevel = clampVillageLevel(this.villageLevel + 1);
    this._emit('village');
    return { ok: true, level: this.villageLevel };
  }

  setVillageLevel(level) {
    this.data.villageLevel = clampVillageLevel(level);
    this._emit('village');
    return this.data.villageLevel;
  }

  villagePower() {
    let n = 0;
    for (let t = 1; t <= 10; t++) n += Math.max(0, this.storedUnitLevel(t));
    return n;
  }

  // 스킬만 환불. 레벨/XP는 유지.
  resetSkills() {
    this.data.ranks = emptyRanks();
    this.data.skillPoints = Math.max(0, this.data.level - 1 - this.villageSpent());
    this._emit('reset');
  }

  cloneProgress() {
    return {
      level: this.data.level,
      xp: this.data.xp,
      skillPoints: this.data.skillPoints,
      ranks: { ...this.data.ranks },
      medals: this.data.medals,
      unitLevels: { ...this.data.unitLevels },
      villageLevel: this.data.villageLevel,
    };
  }

  restoreSnapshot(snap) {
    if (!snap) return;
    this.data.level = Math.max(1, Math.floor(Number(snap.level) || 1));
    this.data.xp = Math.max(0, Math.floor(Number(snap.xp) || 0));
    this.data.skillPoints = Math.max(0, Math.floor(Number(snap.skillPoints) || 0));
    const ranks = emptyRanks();
    if (snap.ranks && typeof snap.ranks === 'object') {
      for (const s of SKILLS) {
        const r = snap.ranks[s.id];
        ranks[s.id] = Number.isFinite(r) ? Math.max(0, Math.min(s.maxRank, Math.floor(r))) : 0;
      }
    }
    this.data.ranks = ranks;
    this.data.medals = Math.max(0, Math.floor(Number(snap.medals) || 0));
    this.data.villageLevel = clampVillageLevel(snap.villageLevel ?? VILLAGE_START_LEVEL);
    const levels = emptyUnitLevels();
    if (snap.unitLevels && typeof snap.unitLevels === 'object') {
      for (let t = 1; t <= 10; t++) {
        levels[t] = clampUnitLevel(snap.unitLevels[t] ?? snap.unitLevels[String(t)] ?? 0);
      }
    }
    this.data.unitLevels = levels;
    this._emit('restore');
  }

  resetAccount() {
    this.data = defaultData();
    this._emit('resetAccount');
  }

  setLevel(n) {
    const next = Math.max(1, Math.floor(Number(n) || 1));
    const prev = this.data.level;
    if (next === prev) return next;
    this.data.level = next;
    this.data.skillPoints = Math.max(0, (this.data.skillPoints || 0) + (next - prev));
    this._emit('level');
    return next;
  }

  districtSpent(skillIds) {
    let n = 0;
    for (const id of skillIds || []) {
      const skill = SKILL_BY_ID[id];
      if (!skill) continue;
      n += (this.rank(id) || 0) * (skill.cost || 1);
    }
    return n;
  }

  getEffects() {
    const r = (id) => this.rank(id);
    const launchCd = Math.max(
      PROGRESSION.launchCdFloor,
      BALANCE.launchCooldown - r('launchCd') * SKILL_BY_ID.launchCd.perRank,
    );
    const launchChances = launchTierChances(r('eliteRecruit'));
    const ms = SKILL_BY_ID.mergeShock;
    const msh = r('mergeShock');
    const hasWall = r('wall') >= 1;
    const wallMaxHp = hasWall
      ? PROGRESSION.wallBaseHp + r('wallHp') * SKILL_BY_ID.wallHp.hpPerRank
      : 0;
    const wallKnockback = hasWall
      ? PROGRESSION.wallBaseKnockback + r('wallKb') * SKILL_BY_ID.wallKb.kbPerRank
      : 0;
    const hasArcher = hasWall && r('archer') >= 1;
    const extra = hasArcher ? r('archerCount') * SKILL_BY_ID.archerCount.extraPerRank : 0;
    const archerCount = hasArcher
      ? Math.min(PROGRESSION.archerMax, 1 + extra)
      : 0;
    const startGold = (ECONOMY.startGold ?? 0) + r('startGold') * (SKILL_BY_ID.startGold?.perRank ?? 50);
    const taxPerSec = (ECONOMY.taxPerSec ?? 0) + r('taxRate') * (SKILL_BY_ID.taxRate?.perRank ?? 1.5);
    const bountyMult = (ECONOMY.bountyMult ?? 1) * (1 + r('bountyGold') * (SKILL_BY_ID.bountyGold?.perRank ?? 0.1));
    const shopMaxTier = Math.min(
      SHOP_MAX_TIER,
      Math.max(1, Math.floor((ECONOMY.shopBaseTier ?? 2) + r('mercenary'))),
    );
    return {
      launchCooldown: launchCd,
      advanceSpeed: advanceSpeedForRank(r('advance')),
      advanceMult: 1 + r('advance') * SKILL_BY_ID.advance.perRank, // 테이블이 있을 때 이동은 advanceSpeed
      regenPct: r('regen') * SKILL_BY_ID.regen.perRank,
      stopMult: 1 + r('stopping') * SKILL_BY_ID.stopping.perRank,
      launchChances,
      mergeShock: msh <= 0 ? null : {
        dmg: msh * ms.dmgPerRank,
        radius: ms.radiusBase + msh * ms.radiusPerRank,
        knockback: msh * ms.knockbackPerRank,
        healPct: msh * ms.healPctPerRank,
      },
      hasWall,
      wallMaxHp,
      wallKnockback,
      archerCount,
      archerRange: PROGRESSION.archerBaseRange + r('archerRange') * SKILL_BY_ID.archerRange.perRank,
      archerAtk: PROGRESSION.archerBaseAtk + r('archerAtk') * SKILL_BY_ID.archerAtk.perRank,
      archerAmmo: PROGRESSION.archerBaseAmmo + r('archerAmmo') * SKILL_BY_ID.archerAmmo.perRank,
      slotCols: slotColsForRank(r('boardWidth')),
      startGold,
      taxPerSec,
      bountyMult,
      shopMaxTier,
    };
  }

  slotCols() {
    return slotColsForRank(this.rank('boardWidth'));
  }
}

export const meta = new Meta();
