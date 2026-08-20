// 스킬 패널 (스킬 버튼 / K). 구매는 즉시 현재 런에 반영.

import { SKILLS, SKILL_TREES, SKILL_BY_ID, BALANCE, PROGRESSION, rankUnlockLevel } from './config.js';

function fmtPct(v) {
  return `${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%`;
}

function effectLine(skill, rank) {
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
    case 'advance':
      return `전진 속도 +${fmtPct(rank * skill.perRank)}` +
        (rank < skill.maxRank ? ` → +${fmtPct((rank + 1) * skill.perRank)}` : '');
    case 'regen':
      return `전투·전열 중 최대체력 ${fmtPct(rank * skill.perRank)}/초` +
        (rank < skill.maxRank ? ` → ${fmtPct((rank + 1) * skill.perRank)}/초` : '');
    case 'stopping':
      return `저지력 +${fmtPct(rank * skill.perRank)}` +
        (rank < skill.maxRank ? ` → +${fmtPct((rank + 1) * skill.perRank)}` : '');
    case 'higherTier': {
      const t2 = (r) => r * skill.t2PerRank;
      const t3 = (r) => r >= skill.t3StartRank ? (r - (skill.t3StartRank - 1)) * skill.t3PerRank : 0;
      let s = `추가 T2 ${fmtPct(t2(rank))} · T3 ${fmtPct(t3(rank))}`;
      if (rank < skill.maxRank) s += ` → T2 ${fmtPct(t2(rank + 1))} · T3 ${fmtPct(t3(rank + 1))}`;
      return s;
    }
    case 'mergeShock': {
      const d = (r) => r * skill.dmgPerRank;
      const rad = (r) => r > 0 ? skill.radiusBase + r * skill.radiusPerRank : 0;
      const kb = (r) => r * skill.knockbackPerRank;
      return `합성 충격 피해 ${d(rank)} / 반경 ${rad(rank)}px / 라인 ${kb(rank)}px` +
        (rank < skill.maxRank ? ` → ${d(rank + 1)} / ${rad(rank + 1)}px / ${kb(rank + 1)}px` : '');
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
      return rank >= 1 ? '방어벽에 궁수 1명' : '방어벽에 궁수 1명 배치 (웨이브당 탄약 제한)';
    case 'archerCount': {
      const n = (r) => Math.min(PROGRESSION.archerMax, 1 + r * skill.extraPerRank);
      const canMore = n(rank) < PROGRESSION.archerMax && rank < skill.maxRank;
      return `궁수 ${n(rank)}명 (최대 ${PROGRESSION.archerMax})` +
        (canMore ? ` → ${n(rank + 1)}명` : '');
    }
    case 'archerRange': {
      const v = (r) => PROGRESSION.archerBaseRange + r * skill.perRank;
      return `사거리 ${v(rank)}px` + (rank < skill.maxRank ? ` → ${v(rank + 1)}px` : '');
    }
    case 'archerAtk': {
      const v = (r) => PROGRESSION.archerBaseAtk + r * skill.perRank;
      return `공격력 ${v(rank)}` + (rank < skill.maxRank ? ` → ${v(rank + 1)}` : '');
    }
    case 'archerAmmo': {
      const v = (r) => PROGRESSION.archerBaseAmmo + r * skill.perRank;
      return `웨이브당 ${v(rank)}발` + (rank < skill.maxRank ? ` → ${v(rank + 1)}발` : '');
    }
    default:
      return '';
  }
}

function requireName(id) {
  return SKILL_BY_ID[id]?.name || id;
}

export function setupSkillsUi(game, meta) {
  const wrap = document.getElementById('wrap');

  const btn = document.createElement('button');
  btn.id = 'skillBtn';
  btn.type = 'button';
  btn.textContent = '스킬';
  btn.title = '스킬 패널 (K)';
  wrap.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'skillPanel';
  panel.classList.add('hidden');
  wrap.appendChild(panel);

  const setOpen = (open) => {
    panel.classList.toggle('hidden', !open);
    game.skillPanelOpen = open;
    if (open) render();
  };

  const toggle = () => setOpen(panel.classList.contains('hidden'));
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'k' || e.key === 'K' || e.key === 'ㅏ') {
      e.preventDefault();
      toggle();
    }
  });

  function render() {
    const { level, xp, skillPoints, xpNeeded } = meta;
    panel.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'skill-head';
    const title = document.createElement('h2');
    title.textContent = '스킬';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'skill-close';
    close.textContent = '닫기';
    close.addEventListener('click', () => setOpen(false));
    head.append(title, close);
    panel.appendChild(head);

    const info = document.createElement('p');
    info.className = 'skill-info';
    info.textContent = `레벨 ${level}  ·  XP ${xp} / ${xpNeeded}  ·  남은 포인트 ${skillPoints}`;
    panel.appendChild(info);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'skill-reset';
    reset.textContent = '스킬 초기화';
    reset.title = '포인트를 환불합니다. 레벨과 XP는 유지됩니다.';
    reset.addEventListener('click', () => {
      if (!confirm('스킬을 초기화할까요? 포인트는 환불되고 레벨/XP는 유지됩니다.')) return;
      meta.resetSkills();
      game.onSkillsChanged?.();
      render();
    });
    panel.appendChild(reset);

    for (const tree of SKILL_TREES) {
      const sec = document.createElement('section');
      sec.className = 'skill-tree';
      const h = document.createElement('h3');
      h.textContent = tree.name;
      sec.appendChild(h);

      for (const skill of SKILLS.filter((s) => s.tree === tree.id)) {
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
        const maxLabel = maxRank === 1 ? (rank >= 1 ? '해금' : '잠김') : `${rank} / ${maxRank}`;
        name.textContent = `${skill.name}  (${maxLabel})`;
        const desc = document.createElement('div');
        desc.className = 'skill-desc';
        desc.textContent = effectLine(skill, rank);
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
        if (lockedLevel) {
          buy.disabled = true;
          buy.textContent = `Lv ${check.unlockLevel} 해금`;
        } else if (check.reason === 'requires') {
          buy.disabled = true;
          buy.textContent = `${requireName(skill.requires)} 필요`;
        } else if (check.reason === 'max') {
          buy.disabled = true;
          buy.textContent = '최대';
        } else if (check.reason === 'points') {
          buy.disabled = true;
          buy.textContent = '포인트 부족';
        } else {
          buy.textContent = `구매 (${skill.cost})`;
          buy.addEventListener('click', () => {
            const res = meta.buy(skill.id);
            if (!res.ok) return;
            game.onSkillsChanged?.();
            render();
          });
        }

        row.append(body, buy);
        sec.appendChild(row);
      }
      panel.appendChild(sec);
    }
  }

  const updateBtn = () => {
    const pts = meta.skillPoints;
    btn.textContent = pts > 0 ? `스킬 · ${pts}` : '스킬';
    btn.classList.toggle('has-points', pts > 0);
  };

  let lastLv = meta.level;
  let lastPts = meta.skillPoints;
  meta.onChange((reason) => {
    updateBtn();
    if (panel.classList.contains('hidden')) return;
    if (reason !== 'xp' || meta.level !== lastLv || meta.skillPoints !== lastPts) {
      render();
    } else {
      const info = panel.querySelector('.skill-info');
      if (info) {
        info.textContent = `레벨 ${meta.level}  ·  XP ${meta.xp} / ${meta.xpNeeded}  ·  남은 포인트 ${meta.skillPoints}`;
      }
    }
    lastLv = meta.level;
    lastPts = meta.skillPoints;
  });
  updateBtn();

  game.onSkillsChanged?.();
}
