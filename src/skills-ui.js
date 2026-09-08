// 영지 맵 + 치트용 스킬 패널. 영지 투자는 전투 중이 아닐 때만.

import {
  SKILLS, SKILL_TREES, SKILL_BY_ID, DISTRICTS, BALANCE, PROGRESSION, ECONOMY,
  rankUnlockLevel, advanceSpeedForRank, slotColsForRank, launchTierChances, UNITS,
  archerStatsForLevel, archerCapForCols,
} from './config.js';
import {
  VILLAGE_HOUSES, UNIT_MAX_LEVEL, medalCost, formatMedals, villageLevels,
  VILLAGE_MAX_LEVEL, VILLAGE_LEVEL_COST, nextVillageUnlock, houseUnlockVillageLevel,
  villageResolve,
} from './village.js';

function fmtVillageStat(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '-';
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return String(v);
}

function villageLevelCost(tier, level) {
  if (level <= 0) return 0;
  return medalCost(tier, level - 1);
}

function fmtPct(v) {
  return `${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%`;
}

function effectLine(skill, rank, meta) {
  switch (skill.id) {
    case 'launchCd': {
      const cd = (r) => Math.max(
        PROGRESSION.launchCdFloor,
        BALANCE.launchCooldown - r * skill.perRank,
      );
      return `발사 간격 ${cd(rank).toFixed(2)}초` +
        (rank < skill.maxRank ? ` → ${cd(rank + 1).toFixed(2)}초` : '') +
        ` (최저 ${PROGRESSION.launchCdFloor}초)`;
    }
    case 'advance': {
      const spd = (rk) => advanceSpeedForRank(rk);
      return `전진 ${spd(rank)} px/s` +
        (rank < skill.maxRank ? ` → ${spd(rank + 1)} px/s` : '');
    }
    case 'regen':
      return `전투·전열 중 최대체력 ${fmtPct(rank * skill.perRank)}/초` +
        (rank < skill.maxRank ? ` → ${fmtPct((rank + 1) * skill.perRank)}/초` : '');
    case 'stopping':
      return `저지력 +${fmtPct(rank * skill.perRank)}` +
        (rank < skill.maxRank ? ` → +${fmtPct((rank + 1) * skill.perRank)}` : '');
    case 'boardWidth': {
      const cols = (rk) => slotColsForRank(rk);
      if (rank <= 0 && skill.desc) return skill.desc;
      return `전장 ${cols(rank)}칸` +
        (rank < skill.maxRank ? ` → ${cols(rank + 1)}칸` : '');
    }
    case 'eliteRecruit': {
      const fmt = (rk) => {
        const ch = launchTierChances(rk);
        const parts = [`T1 ${fmtPct(ch[1])}`, `T2 ${fmtPct(ch[2])}`];
        for (const t of [3, 4, 5]) {
          if (ch[t] > 0) parts.push(`T${t} ${fmtPct(ch[t])}`);
        }
        return parts.join(' · ');
      };
      const nextUnlock = (rk) => {
        const a = launchTierChances(rk);
        const b = launchTierChances(rk + 1);
        for (const t of [2, 3, 4, 5]) {
          if (a[t] <= 0 && b[t] > 0) return `T${t} 해금`;
        }
        return '';
      };
      let s = fmt(rank);
      if (rank < skill.maxRank) {
        const tag = nextUnlock(rank);
        s += ` → ${fmt(rank + 1)}` + (tag ? ` (${tag})` : '');
      }
      return s;
    }
    case 'mergeShock': {
      const d = (r) => r * skill.dmgPerRank;
      const rad = (r) => r > 0 ? skill.radiusBase + r * skill.radiusPerRank : 0;
      const kb = (r) => r * skill.knockbackPerRank;
      const ch = Math.round((skill.knockbackChance || 0) * 100);
      const minT = Math.max(1, Math.round(skill.minResultTier ?? 6));
      return `T${minT}+ 합성 시 충격 피해 ${d(rank)} / 반경 ${rad(rank)}px / 라인 ${ch}% ${kb(rank)}px` +
        (rank < skill.maxRank ? ` → ${d(rank + 1)} / ${rad(rank + 1)}px / ${ch}% ${kb(rank + 1)}px` : '');
    }
    case 'wall':
      return rank >= 1
        ? `마지노선에 방어벽 (내구 ${PROGRESSION.wallBaseHp}, 밀치기 ${PROGRESSION.wallBaseKnockback}px)`
        : '마지노선에 방어벽 설치. 접촉 시 밀쳐내고 벽이 피해를 받음';
    case 'wallHp': {
      const hp = (r) => PROGRESSION.wallBaseHp + r * skill.hpPerRank;
      return `벽 내구 ${hp(rank)}` + (rank < skill.maxRank ? ` → ${hp(rank + 1)}` : '');
    }
    case 'wallKb': {
      const kb = (r) => PROGRESSION.wallBaseKnockback + r * skill.kbPerRank;
      return `밀치기 ${kb(rank)}px` + (rank < skill.maxRank ? ` → ${kb(rank + 1)}px` : '');
    }
    case 'archer':
      return rank >= 1 ? '방어벽에 궁수 1명 (레벨 1)' : '방어벽에 궁수 1명 배치 (웨이브당 탄약 제한)';
    case 'archerCount': {
      const cols = slotColsForRank(meta?.rank?.('boardWidth') ?? 0);
      const cap = archerCapForCols(cols);
      const n = (r) => Math.min(PROGRESSION.archerMax, cap, 1 + r * skill.extraPerRank);
      const canMore = n(rank) < cap && rank < skill.maxRank;
      const widthBlock = n(rank) >= cap && rank < skill.maxRank;
      let s = `궁수 ${n(rank)}명 (이 전장 ${cap}칸)`;
      if (canMore) s += ` → ${n(rank + 1)}명`;
      else if (widthBlock) s += ' · 전장 확장 시 추가 고용';
      return s;
    }
    case 'archerLevel': {
      const lv = (r) => 1 + r;
      const st = (r) => archerStatsForLevel(lv(r));
      const a = st(rank);
      let s = `Lv${lv(rank)} 사거리 ${a.range} · 공격 ${a.atk} · ${a.ammo}발`;
      if (rank < skill.maxRank) {
        const b = st(rank + 1);
        s += ` → Lv${lv(rank + 1)} ${b.range}/${b.atk}/${b.ammo}`;
      }
      return s;
    }
    case 'tierLock': {
      const n = (r) => r * (skill.perRank ?? 1);
      return rank <= 0
        ? '유닛을 눌러 합성을 막음. 등급에 자물쇠'
        : `잠금 ${n(rank)}기` + (rank < skill.maxRank ? ` → ${n(rank + 1)}기` : '');
    }
    case 'startGold': {
      const v = (r) => (r * skill.perRank);
      return `시작 골드 +${v(rank)}G` + (rank < skill.maxRank ? ` → +${v(rank + 1)}G` : '');
    }
    case 'taxRate': {
      const v = (r) => r * skill.perRank;
      const fmt = (n) => (Math.abs(n % 1) < 0.05 ? n.toFixed(0) : n.toFixed(1));
      return `초당 ${fmt(v(rank))}G` + (rank < skill.maxRank ? ` → ${fmt(v(rank + 1))}G` : '');
    }
    case 'bountyGold':
      return `처치 골드 +${fmtPct(rank * skill.perRank)}` +
        (rank < skill.maxRank ? ` → +${fmtPct((rank + 1) * skill.perRank)}` : '');
    case 'mercenary': {
      const maxT = (r) => Math.min(9, (ECONOMY.shopBaseTier ?? 2) + r);
      return `구매 가능 T${maxT(rank)}까지` +
        (rank < skill.maxRank ? ` → T${maxT(rank + 1)}` : '');
    }
    default:
      return '';
  }
}

function requireName(id) {
  return SKILL_BY_ID[id]?.name || id;
}

const KIND_STYLE = {
  military: { fill: '#5a2428', stroke: '#d08080', title: '#f0c8c8' },
  economy: { fill: '#5a4814', stroke: '#e8c56a', title: '#ffe7a0' },
  defense: { fill: '#243528', stroke: '#8eb898', title: '#c8e8d0' },
  village: { fill: '#3a2a14', stroke: '#d4a574', title: '#f0d0a0' },
  vacant: { fill: 'rgba(40,34,28,0.35)', stroke: '#6a5a48', title: '#9a8a72', dash: [5, 4] },
  keep: { fill: '#3a3020', stroke: '#e8c878', title: '#ffe7a0' },
};

function fillSkillRows(host, meta, game, skillIds, canInvest, onBought) {
  host.innerHTML = '';
  for (const id of skillIds) {
    const skill = SKILL_BY_ID[id];
    if (!skill) continue;
    const rank = meta.rank(skill.id);
    const check = meta.canBuy(skill.id);
    const lockedLevel = check.reason === 'level';
    const maxRank = meta.effectiveMaxRank(skill);
    const nextRankLv = rank < maxRank ? rankUnlockLevel(skill, rank + 1) : null;
    const row = document.createElement('div');
    row.className = 'skill-row' + (lockedLevel && rank === 0 ? ' locked' : '') + (rank > 0 ? ' owned' : '');

    const body = document.createElement('div');
    body.className = 'skill-body';
    const name = document.createElement('div');
    name.className = 'skill-name';
    const maxLabel = skill.id === 'archerLevel'
      ? `Lv${1 + rank} / 10`
      : (skill.maxRank === 1 ? (rank >= 1 ? '해금' : '잠김') : `${rank} / ${skill.maxRank}`);
    name.textContent = `${skill.name}  (${maxLabel})`;
    const desc = document.createElement('div');
    desc.className = 'skill-desc';
    desc.textContent = effectLine(skill, rank, meta);
    const sub = document.createElement('div');
    sub.className = 'skill-unlock';
    const bits = [];
    if (rank === 0 && nextRankLv != null) bits.push(`해금 레벨 ${nextRankLv}`);
    else if (nextRankLv != null) bits.push(`다음: Lv ${nextRankLv}`);
    if (skill.requires) bits.push(`선행: ${requireName(skill.requires)}`);
    sub.textContent = bits.join(' · ');
    body.append(name, desc, sub);

    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'skill-buy';
    if (!canInvest) {
      buy.disabled = true;
      buy.textContent = '전투 중';
    } else if (lockedLevel) {
      buy.disabled = true;
      buy.textContent = `Lv ${check.unlockLevel} 해금`;
    } else if (check.reason === 'requires') {
      buy.disabled = true;
      buy.textContent = `${requireName(skill.requires)} 필요`;
    } else if (check.reason === 'width') {
      buy.disabled = true;
      buy.textContent = '전장 확장 필요';
    } else if (check.reason === 'max') {
      buy.disabled = true;
      buy.textContent = '최대';
    } else if (check.reason === 'points') {
      buy.disabled = true;
      buy.textContent = '포인트 부족';
    } else {
      buy.textContent = `+ (${skill.cost})`;
      buy.addEventListener('click', () => {
        const res = meta.buy(skill.id);
        if (!res.ok) return;
        game.onSkillsChanged?.();
        onBought?.();
      });
    }

    row.append(body, buy);
    host.appendChild(row);
  }
}

export function setupSkillsUi(game, meta) {
  const wrap = document.getElementById('wrap');
  const left = document.getElementById('chromeLeft') || wrap;

  const estateBtn = document.createElement('button');
  estateBtn.id = 'estateBtn';
  estateBtn.type = 'button';
  estateBtn.textContent = '영지';
  estateBtn.title = '영지 (K)';
  left.appendChild(estateBtn);

  const skillBtn = document.createElement('button');
  skillBtn.id = 'skillBtn';
  skillBtn.type = 'button';
  skillBtn.textContent = '스킬';
  skillBtn.title = '치트: 런 중 연구 투자';
  left.appendChild(skillBtn);

  const estatePanel = document.createElement('div');
  estatePanel.id = 'estatePanel';
  estatePanel.classList.add('hidden');
  wrap.appendChild(estatePanel);

  const estateHead = document.createElement('div');
  estateHead.className = 'skill-head';
  const estateTitle = document.createElement('h2');
  estateTitle.textContent = '영지';
  const estateClose = document.createElement('button');
  estateClose.type = 'button';
  estateClose.className = 'popup-close';
  estateClose.textContent = '닫기';
  estateHead.append(estateTitle, estateClose);

  const estateMap = document.createElement('div');
  estateMap.className = 'estate-map';
  const canvas = document.createElement('canvas');
  canvas.id = 'estateCanvas';
  const toast = document.createElement('div');
  toast.id = 'estateToast';
  toast.className = 'estate-toast hidden';
  const modal = document.createElement('div');
  modal.id = 'estateModal';
  modal.className = 'estate-modal hidden';
  estateMap.append(canvas, toast, modal);
  estatePanel.append(estateHead, estateMap);

  const villagePanel = document.createElement('div');
  villagePanel.id = 'villagePanel';
  villagePanel.classList.add('hidden');
  wrap.appendChild(villagePanel);

  const villageHead = document.createElement('div');
  villageHead.className = 'skill-head';
  const villageTitle = document.createElement('h2');
  villageTitle.textContent = '마을';
  const villageMedals = document.createElement('span');
  villageMedals.className = 'village-medals';
  const villageClose = document.createElement('button');
  villageClose.type = 'button';
  villageClose.className = 'popup-close';
  villageClose.textContent = '닫기';
  villageHead.append(villageTitle, villageMedals, villageClose);
  const villageBody = document.createElement('div');
  villageBody.className = 'village-body';
  villagePanel.append(villageHead, villageBody);

  const skillPanel = document.createElement('div');
  skillPanel.id = 'skillPanel';
  skillPanel.classList.add('hidden');
  wrap.appendChild(skillPanel);

  const skillHead = document.createElement('div');
  skillHead.className = 'skill-head';
  const skillTitle = document.createElement('h2');
  skillTitle.textContent = '스킬 (치트)';
  const skillClose = document.createElement('button');
  skillClose.type = 'button';
  skillClose.className = 'popup-close';
  skillClose.textContent = '닫기';
  skillHead.append(skillTitle, skillClose);
  const skillBody = document.createElement('div');
  skillBody.className = 'skill-body-scroll';
  skillPanel.append(skillHead, skillBody);

  let nodes = [];
  let toastTimer = 0;
  let villageSelected = 1;
  let paintVillageView = null;

  const canInvestEstate = () => game.state !== 'playing';

  const syncOpenFlag = () => {
    game.skillPanelOpen = !estatePanel.classList.contains('hidden')
      || !skillPanel.classList.contains('hidden')
      || !villagePanel.classList.contains('hidden');
  };

  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 1400);
  };

  const paintCheatBtn = () => {
    const on = !!game.cheatsEnabled;
    skillBtn.classList.toggle('hidden', !on);
    if (!on && !skillPanel.classList.contains('hidden')) {
      skillPanel.classList.add('hidden');
      syncOpenFlag();
    }
  };

  const paintEstateBtn = () => {
    const pts = meta.skillPoints;
    estateBtn.textContent = pts > 0 ? `영지\n${pts}` : '영지';
    estateBtn.classList.toggle('has-points', pts > 0);
  };

  function renderCheatSkills() {
    const { level, xp, skillPoints, xpNeeded } = meta;
    skillBody.innerHTML = '';
    const info = document.createElement('p');
    info.className = 'skill-info';
    info.textContent = `레벨 ${level}  ·  XP ${xp} / ${xpNeeded}  ·  남은 포인트 ${skillPoints}`;
    skillBody.appendChild(info);
    const note = document.createElement('p');
    note.className = 'skill-info';
    note.textContent = '치트 On일 때만 보입니다. 런 중에도 즉시 반영됩니다.';
    skillBody.appendChild(note);
    for (const tree of SKILL_TREES) {
      const sec = document.createElement('section');
      sec.className = 'skill-tree';
      const h = document.createElement('h3');
      h.textContent = tree.name;
      const list = document.createElement('div');
      sec.append(h, list);
      fillSkillRows(
        list,
        meta,
        game,
        SKILLS.filter((s) => s.tree === tree.id).map((s) => s.id),
        true,
        () => renderCheatSkills(),
      );
      skillBody.appendChild(sec);
    }
  }

  function closeModal() {
    modal.classList.add('hidden');
    modal.innerHTML = '';
  }

  function openKeepModal() {
    modal.classList.remove('hidden');
    modal.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'estate-modal-box';
    const h = document.createElement('h3');
    h.textContent = '영주 성';
    const info = document.createElement('p');
    info.textContent = `영지 레벨 ${meta.level}  ·  건설 포인트 ${meta.skillPoints}  ·  훈장 ${formatMedals(meta.medals)}  ·  XP ${meta.xp} / ${meta.xpNeeded}`;
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'skill-reset';
    reset.textContent = '건설 초기화';
    reset.addEventListener('click', () => {
      if (!canInvestEstate()) {
        showToast('전투 중에는 영지를 개발할 수 없습니다');
        return;
      }
      if (!confirm('영지 연구를 초기화할까요? 포인트는 환불되고 레벨/XP는 유지됩니다.')) return;
      meta.resetSkills();
      game.onSkillsChanged?.();
      openKeepModal();
      drawEstate();
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'popup-close';
    close.textContent = '닫기';
    close.addEventListener('click', closeModal);
    box.append(h, info, reset, close);
    modal.appendChild(box);
  }

  function openVillageModal() {
    villagePanel.classList.remove('hidden');
    skillPanel.classList.add('hidden');
    closeModal();
    syncOpenFlag();
    villageSelected = villageSelected || 1;

    const paintDetail = () => {
      const selected = villageSelected;
      const open = meta.isHouseOpen(selected);
      const lv = open ? meta.storedUnitLevel(selected) : 0;
      const unit = UNITS[selected - 1];
      const house = VILLAGE_HOUSES.find((x) => x.tier === selected);
      const rows = villageLevels(selected);
      const check = meta.canBuyUnitLevel(selected);
      const nextCost = open && lv < UNIT_MAX_LEVEL ? medalCost(selected, lv) : 0;
      const canInvest = canInvestEstate();
      const base = villageResolve(selected, 0);

      const title = document.createElement('div');
      title.className = 'village-detail-title';
      title.textContent = open
        ? `${house?.name || ''} · ${unit?.name || ''}  Lv.${lv} / ${UNIT_MAX_LEVEL}`
        : `${house?.name || ''} · 마을 레벨 ${houseUnlockVillageLevel(selected)} 필요`;

      const levels = document.createElement('div');
      levels.className = 'village-levels';
      const baseItem = document.createElement('div');
      baseItem.className = `village-level ${open ? 'owned' : 'locked'}`;
      baseItem.innerHTML = `<div class="village-level-head"><strong>Lv.00 미훈련</strong><span>${open ? '기본' : '잠김'}</span></div>`
        + `<div class="village-level-stats">HP ${fmtVillageStat(base.hp)}  ·  ATK ${fmtVillageStat(base.atk)}  ·  저지 ${fmtVillageStat(base.stop)}</div>`
        + `<div class="village-level-desc">${base.desc}</div>`;
      levels.appendChild(baseItem);
      for (let i = 0; i < rows.length; i++) {
        const level = i + 1;
        const row = rows[i];
        const item = document.createElement('div');
        let kind = 'locked';
        if (open && level <= lv) kind = 'owned';
        else if (open && level === lv + 1) kind = 'next';
        item.className = `village-level ${kind}`;
        const head = document.createElement('div');
        head.className = 'village-level-head';
        const tag = !open ? '잠김' : (level <= lv ? '해금' : (level === lv + 1 ? '다음' : '잠김'));
        const cost = villageLevelCost(selected, level);
        head.innerHTML = `<strong>Lv.${String(level).padStart(2, '0')} ${row.name}</strong><span>${tag}${cost > 0 ? ` · 훈장 ${formatMedals(cost)}` : ''}</span>`;
        const stats = document.createElement('div');
        stats.className = 'village-level-stats';
        stats.textContent = `HP ${fmtVillageStat(row.hp)}  ·  ATK ${fmtVillageStat(row.atk)}  ·  저지 ${fmtVillageStat(row.stop)}`;
        const desc = document.createElement('div');
        desc.className = 'village-level-desc';
        desc.textContent = row.desc || '';
        item.append(head, stats, desc);
        levels.appendChild(item);
      }

      const foot = document.createElement('div');
      foot.className = 'village-foot';
      const buy = document.createElement('button');
      buy.type = 'button';
      buy.className = 'skill-buy village-levelup';
      if (!open) {
        buy.disabled = true;
        buy.textContent = `마을 레벨 ${houseUnlockVillageLevel(selected)} 필요`;
      } else if (!canInvest) {
        buy.disabled = true;
        buy.textContent = lv < UNIT_MAX_LEVEL
          ? `전투 중  ·  훈장 ${formatMedals(nextCost)}`
          : '최대 레벨';
      } else if (check.reason === 'max') {
        buy.disabled = true;
        buy.textContent = '최대 레벨';
      } else {
        buy.disabled = !check.ok;
        buy.textContent = `레벨업  ·  훈장 ${formatMedals(nextCost)}`;
        if (check.ok) {
          buy.addEventListener('click', () => {
            const res = meta.buyUnitLevel(selected);
            if (!res.ok) return;
            game.onSkillsChanged?.();
            paintVillage();
          });
        }
      }
      foot.appendChild(buy);

      const pane = villageBody.querySelector('.village-detail');
      pane.innerHTML = '';
      pane.append(title, levels, foot);
    };

    const paintVillage = () => {
      const canInvest = canInvestEstate();
      villageTitle.textContent = `마을 Lv.${meta.villageLevel}`;
      villageMedals.textContent = `훈장 ${formatMedals(meta.medals)}  ·  건설 ${meta.skillPoints}`;
      const dev = villageBody.querySelector('.village-dev');
      const vCheck = meta.canBuyVillageLevel();
      const nextHouse = nextVillageUnlock(meta.villageLevel);
      if (meta.villageLevel >= VILLAGE_MAX_LEVEL) {
        dev.disabled = true;
        dev.textContent = '마을 최대 레벨';
      } else if (!canInvest) {
        dev.disabled = true;
        dev.textContent = `전투 중  ·  다음 ${nextHouse?.name || ''} · 건설 ${VILLAGE_LEVEL_COST}`;
      } else {
        dev.disabled = !vCheck.ok;
        dev.textContent = `마을 발전  ·  건설 포인트 ${VILLAGE_LEVEL_COST}`
          + (nextHouse ? `  ·  다음 ${nextHouse.name}` : '');
        dev.onclick = () => {
          const res = meta.buyVillageLevel();
          if (!res.ok) return;
          game.onSkillsChanged?.();
          paintVillage();
        };
      }
      const hint = villageBody.querySelector('.village-hint');
      hint.textContent = canInvest
        ? '마을을 발전하면 숙소가 순서대로 열립니다. 유닛은 0레벨부터 순서대로 훈련합니다.'
        : '전투 중에는 마을을 발전·훈련할 수 없습니다';
      const grid = villageBody.querySelector('.village-grid');
      grid.innerHTML = '';
      for (const house of VILLAGE_HOUSES) {
        const open = meta.isHouseOpen(house.tier);
        const lv = open ? meta.storedUnitLevel(house.tier) : 0;
        const unit = UNITS[house.tier - 1];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'village-house'
          + (villageSelected === house.tier ? ' selected' : '')
          + (open ? '' : ' locked');
        btn.innerHTML = open
          ? `<strong>${house.name}</strong><span>T${house.tier} ${unit?.name || ''} · Lv.${lv}</span>`
          : `<strong>${house.name}</strong><span>마을 Lv.${houseUnlockVillageLevel(house.tier)} 해금</span>`;
        btn.addEventListener('click', () => {
          villageSelected = house.tier;
          paintVillage();
        });
        grid.appendChild(btn);
      }
      paintDetail();
    };

    if (villageBody.dataset.ready !== '2') {
      villageBody.dataset.ready = '2';
      villageBody.innerHTML = '';
      const dev = document.createElement('button');
      dev.type = 'button';
      dev.className = 'skill-buy village-dev';
      const hint = document.createElement('p');
      hint.className = 'skill-info village-hint';
      const grid = document.createElement('div');
      grid.className = 'village-grid';
      const detail = document.createElement('div');
      detail.className = 'village-detail';
      villageBody.append(dev, hint, grid, detail);
    }
    paintVillageView = paintVillage;
    paintVillage();
  }

  function openDistrictModal(district) {
    if (district.kind === 'village') {
      setVillageOpen(true);
      return;
    }
    if (district.kind === 'vacant') {
      showToast('개발 준비 중');
      return;
    }
    if (district.kind === 'keep') {
      openKeepModal();
      return;
    }
    modal.classList.remove('hidden');
    modal.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'estate-modal-box';
    const h = document.createElement('h3');
    const spent = meta.districtSpent(district.skills);
    h.textContent = `${district.name}  ·  Lv.${spent}`;
    const hint = document.createElement('p');
    hint.className = 'skill-info';
    hint.textContent = canInvestEstate()
      ? `남은 건설 포인트 ${meta.skillPoints}`
      : '전투 중에는 영지를 개발할 수 없습니다. 치트 스킬 패널을 쓰세요.';
    const list = document.createElement('div');
    list.className = 'estate-research';
    const refresh = () => {
      hint.textContent = canInvestEstate()
        ? `남은 건설 포인트 ${meta.skillPoints}`
        : '전투 중에는 영지를 개발할 수 없습니다. 치트 스킬 패널을 쓰세요.';
      h.textContent = `${district.name}  ·  Lv.${meta.districtSpent(district.skills)}`;
      fillSkillRows(list, meta, game, district.skills, canInvestEstate(), () => {
        refresh();
        drawEstate();
      });
    };
    refresh();
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'popup-close';
    close.textContent = '닫기';
    close.addEventListener('click', closeModal);
    box.append(h, hint, list, close);
    modal.appendChild(box);
  }

  function layoutNodes(w, h) {
    const cx = w / 2;
    const cy = h / 2 + 6;
    const ringR = Math.min(w, h) * 0.32;
    const nodeR = Math.min(40, Math.max(30, Math.min(w, h) * 0.068));
    const keepR = Math.min(58, Math.max(44, Math.min(w, h) * 0.1));
    const outer = DISTRICTS.filter((d) => d.kind !== 'keep' && d.kind !== 'wallring');
    const keep = DISTRICTS.find((d) => d.kind === 'keep');
    const list = [];
    if (keep) list.push({ d: keep, x: cx, y: cy, r: keepR });
    outer.forEach((d, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / outer.length;
      list.push({
        d,
        x: cx + Math.cos(a) * ringR,
        y: cy + Math.sin(a) * ringR,
        r: nodeR,
      });
    });
    return list;
  }

  function wallGeom(w, h) {
    const cx = w / 2;
    const cy = h / 2 + 6;
    const wallR = Math.min(w, h) * 0.455;
    return { cx, cy, wallR, band: 22 };
  }

  function drawEstate() {
    const cssW = Math.max(1, estateMap.clientWidth || 400);
    const cssH = Math.max(1, estateMap.clientHeight || 520);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const { cx, cy, wallR } = wallGeom(cssW, cssH);
    const wallDist = DISTRICTS.find((d) => d.kind === 'wallring');
    const wallSpent = wallDist ? meta.districtSpent(wallDist.skills) : 0;
    const built = meta.rank('wall') >= 1;

    ctx.save();
    ctx.lineWidth = 18;
    ctx.strokeStyle = built ? 'rgba(92, 72, 40, 0.98)' : 'rgba(62, 50, 32, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, wallR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = built ? 'rgba(232, 200, 120, 0.9)' : 'rgba(168, 140, 88, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, cy, wallR - 8, 0, Math.PI * 2);
    ctx.stroke();
    const merlons = 20;
    ctx.lineWidth = 6;
    ctx.strokeStyle = built ? '#d4b06a' : '#6e5c40';
    for (let i = 0; i < merlons; i++) {
      const a = (i / merlons) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (wallR - 16), cy + Math.sin(a) * (wallR - 16));
      ctx.lineTo(cx + Math.cos(a) * (wallR + 9), cy + Math.sin(a) * (wallR + 9));
      ctx.stroke();
    }
    ctx.fillStyle = built ? '#ffe7a0' : '#d8ccb2';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = "bold 14px 'Malgun Gothic', sans-serif";
    ctx.fillText('성벽', cx, cy + wallR);
    ctx.font = "11px 'Malgun Gothic', sans-serif";
    ctx.fillStyle = '#c9b48a';
    ctx.fillText(wallSpent > 0 ? `Lv.${wallSpent}` : '방어 연구', cx, cy + wallR + 16);
    ctx.restore();

    nodes = layoutNodes(cssW, cssH);
    for (const node of nodes) {
      const st = KIND_STYLE[node.d.kind] || KIND_STYLE.vacant;
      ctx.save();
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
      ctx.fillStyle = st.fill;
      ctx.fill();
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = node.d.kind === 'keep' ? 3 : 2;
      if (st.dash) ctx.setLineDash(st.dash);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = st.title;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (node.d.kind === 'keep') {
        ctx.font = "bold 13px 'Malgun Gothic', sans-serif";
        ctx.fillText('영주 성', node.x, node.y - 10);
        ctx.font = "11px 'Malgun Gothic', sans-serif";
        ctx.fillText(`Lv.${meta.level}`, node.x, node.y + 6);
        ctx.fillStyle = '#c9b48a';
        ctx.fillText(`건설 ${meta.skillPoints}`, node.x, node.y + 20);
      } else {
        const spent = meta.districtSpent(node.d.skills);
        ctx.font = "bold 11px 'Malgun Gothic', sans-serif";
        ctx.fillText(node.d.name, node.x, node.y - 6);
        ctx.font = "10px 'Malgun Gothic', sans-serif";
        ctx.fillStyle = '#d8ccb4';
        if (node.d.kind === 'vacant') ctx.fillText('준비 중', node.x, node.y + 9);
        else if (node.d.kind === 'village') ctx.fillText(`마을 Lv.${meta.villageLevel}`, node.x, node.y + 9);
        else ctx.fillText(`Lv.${spent}`, node.x, node.y + 9);
      }
      ctx.restore();
    }
  }

  function setVillageOpen(open) {
    if (open) openVillageModal();
    else {
      villagePanel.classList.add('hidden');
      paintVillageView = null;
      syncOpenFlag();
    }
  }

  function setEstateOpen(open) {
    estatePanel.classList.toggle('hidden', !open);
    if (open) {
      skillPanel.classList.add('hidden');
      villagePanel.classList.add('hidden');
      closeModal();
      drawEstate();
    } else {
      villagePanel.classList.add('hidden');
      paintVillageView = null;
    }
    syncOpenFlag();
  }

  function setCheatOpen(open) {
    if (open && !game.cheatsEnabled) return;
    skillPanel.classList.toggle('hidden', !open);
    if (open) {
      estatePanel.classList.add('hidden');
      villagePanel.classList.add('hidden');
      paintVillageView = null;
      renderCheatSkills();
    }
    syncOpenFlag();
  }

  villageClose.addEventListener('click', (e) => {
    e.stopPropagation();
    setVillageOpen(false);
  });
  estateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setEstateOpen(estatePanel.classList.contains('hidden'));
  });
  estateClose.addEventListener('click', (e) => {
    e.stopPropagation();
    setEstateOpen(false);
  });
  skillBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setCheatOpen(skillPanel.classList.contains('hidden'));
  });
  skillClose.addEventListener('click', (e) => {
    e.stopPropagation();
    setCheatOpen(false);
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let hit = null;
    let best = Infinity;
    for (const node of nodes) {
      const d = Math.hypot(node.x - x, node.y - y);
      if (d <= node.r + 4 && d < best) {
        best = d;
        hit = node;
      }
    }
    if (hit) {
      openDistrictModal(hit.d);
      return;
    }
    const cssW = rect.width;
    const cssH = rect.height;
    const { cx, cy, wallR, band } = wallGeom(cssW, cssH);
    const dist = Math.hypot(x - cx, y - cy);
    if (Math.abs(dist - wallR) <= band) {
      const wallDist = DISTRICTS.find((d) => d.kind === 'wallring');
      if (wallDist) openDistrictModal(wallDist);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'k' || e.key === 'K' || e.key === 'ㅏ') {
      e.preventDefault();
      setEstateOpen(estatePanel.classList.contains('hidden'));
    }
  });

  game.openEstate = () => setEstateOpen(true);

  game.ui?.estateFromResult?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setEstateOpen(true);
  });

  const prevCheats = game.onCheatsChange;
  game.onCheatsChange = () => {
    prevCheats?.();
    paintCheatBtn();
  };
  paintCheatBtn();
  paintEstateBtn();

  let lastLv = meta.level;
  let lastPts = meta.skillPoints;
  meta.onChange((reason) => {
    paintEstateBtn();
    if (!estatePanel.classList.contains('hidden')) drawEstate();
    if (paintVillageView && !villagePanel.classList.contains('hidden')) {
      paintVillageView();
    }
    if (skillPanel.classList.contains('hidden')) {
      lastLv = meta.level;
      lastPts = meta.skillPoints;
      return;
    }
    if (reason !== 'xp' || meta.level !== lastLv || meta.skillPoints !== lastPts) {
      renderCheatSkills();
    }
    lastLv = meta.level;
    lastPts = meta.skillPoints;
  });

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      if (!estatePanel.classList.contains('hidden')) drawEstate();
    })
    : null;
  ro?.observe(estateMap);

  game.onSkillsChanged?.();
}
