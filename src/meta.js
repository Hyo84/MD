// 메타 진행: 레벨/XP/스킬 포인트. localStorage에 저장되어 게임오버·새로고침에도 유지.

import {
  PROGRESSION, SKILLS, SKILL_BY_ID, xpToNextLevel, META_STORAGE_KEY, BALANCE,
  rankUnlockLevel, advanceSpeedForRank, slotColsForRank,
} from './config.js';

function emptyRanks() {
  const ranks = {};
  for (const s of SKILLS) ranks[s.id] = 0;
  return ranks;
}

function defaultData() {
  return { level: 1, xp: 0, skillPoints: 0, ranks: emptyRanks() };
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
        const r = parsed.ranks[s.id];
        data.ranks[s.id] = Number.isFinite(r) ? Math.max(0, Math.min(s.maxRank, Math.floor(r))) : 0;
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
  get xpNeeded() { return xpToNextLevel(this.data.level); }

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

  // 스킬만 환불. 레벨/XP는 유지.
  resetSkills() {
    this.data.ranks = emptyRanks();
    this.data.skillPoints = this.data.level - 1;
    this._emit('reset');
  }

  getEffects() {
    const r = (id) => this.rank(id);
    const launchCd = Math.max(
      PROGRESSION.launchCdFloor,
      BALANCE.launchCooldown - r('launchCd') * SKILL_BY_ID.launchCd.perRank,
    );
    const t2Bonus = r('higherTier') * SKILL_BY_ID.higherTier.t2PerRank;
    const ht = SKILL_BY_ID.higherTier;
    const t3Chance = r('higherTier') >= ht.t3StartRank
      ? (r('higherTier') - (ht.t3StartRank - 1)) * ht.t3PerRank
      : 0;
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
    return {
      launchCooldown: launchCd,
      advanceSpeed: advanceSpeedForRank(r('advance')),
      advanceMult: 1 + r('advance') * SKILL_BY_ID.advance.perRank, // 테이블이 있을 때 이동은 advanceSpeed
      regenPct: r('regen') * SKILL_BY_ID.regen.perRank,
      stopMult: 1 + r('stopping') * SKILL_BY_ID.stopping.perRank,
      t2Bonus,
      t3Chance,
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
    };
  }

  slotCols() {
    return slotColsForRank(this.rank('boardWidth'));
  }
}

export const meta = new Meta();
