// 어드민 패널: config 객체 값을 실시간으로 수정 (A 키 또는 ⚙ 버튼)
import { BALANCE, UNITS, MONSTERS, LIVE_MULT_MIN, LIVE_MULT_MAX, LIVE_MULT_STEP, PROGRESSION, XP_TO_NEXT, SKILLS, BASE_SLOT_COLS, MAX_SLOT_COLS, SLOT_INSET_PER_COL } from './config.js';

function numberRow(label, obj, key, step = 1) {
  const row = document.createElement('label');
  row.className = 'admin-row';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = String(obj[key]);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) obj[key] = v;
  });
  row.append(span, input);
  return row;
}

function numberAt(label, arr, index, step = 1) {
  const row = document.createElement('label');
  row.className = 'admin-row';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(step);
  input.value = String(arr[index]);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) arr[index] = v;
  });
  row.append(span, input);
  return row;
}

function section(title) {
  const el = document.createElement('div');
  el.className = 'admin-section';
  const h = document.createElement('h3');
  h.textContent = title;
  el.appendChild(h);
  return el;
}

export function setupAdmin(game) {
  const panel = document.createElement('div');
  panel.id = 'adminPanel';
  panel.classList.add('hidden');

  const title = document.createElement('h2');
  title.textContent = '⚙ 어드민 패널';
  panel.appendChild(title);

  const note = document.createElement('p');
  note.className = 'admin-note';
  note.textContent = '값은 즉시 적용됩니다. 실시간 난이도는 살아있는 적 HP/ATK/라인 가속에도 바로 반영됩니다. (기본 HP 테이블은 신규 개체부터)';
  panel.appendChild(note);

  const liveSec = section('실시간 난이도');
  const liveRow = document.createElement('div');
  liveRow.className = 'admin-row';
  const liveSpan = document.createElement('span');
  liveSpan.textContent = '수동 배율 (0.1 단위)';
  const stepper = document.createElement('div');
  stepper.className = 'admin-stepper';
  const minus = document.createElement('button');
  minus.type = 'button';
  minus.textContent = '−';
  const liveInput = document.createElement('input');
  liveInput.type = 'number';
  liveInput.step = String(LIVE_MULT_STEP);
  liveInput.min = String(LIVE_MULT_MIN);
  liveInput.max = String(LIVE_MULT_MAX);
  liveInput.value = game.liveMult.toFixed(1);
  const plus = document.createElement('button');
  plus.type = 'button';
  plus.textContent = '+';
  const syncLive = () => { liveInput.value = game.liveMult.toFixed(1); };
  minus.addEventListener('click', () => game.adjustLiveMult(-LIVE_MULT_STEP));
  plus.addEventListener('click', () => game.adjustLiveMult(LIVE_MULT_STEP));
  liveInput.addEventListener('change', () => {
    const v = parseFloat(liveInput.value);
    if (Number.isFinite(v)) game.setLiveMult(v);
    syncLive();
  });
  game.onLiveMultChange = syncLive;
  stepper.append(minus, liveInput, plus);
  liveRow.append(liveSpan, stepper);
  liveSec.appendChild(liveRow);
  panel.appendChild(liveSec);

  // 전역 설정
  const g = section('전역 설정');
  g.append(
    numberRow('기본 라인 속도 (px/s)', BALANCE, 'baseLineSpeed', 0.5),
    numberRow('적 스폰 간격 (s)', BALANCE, 'spawnInterval', 0.1),
    numberRow('발사 쿨다운 (s)', BALANCE, 'launchCooldown', 0.1),
    numberRow('발사 속도 (px/s)', BALANCE, 'launchSpeed', 10),
    numberAt('진군 R0 (스킬 없음)', BALANCE.advanceSpeedByRank, 0, 1),
    numberAt('진군 R1', BALANCE.advanceSpeedByRank, 1, 1),
    numberAt('진군 R2', BALANCE.advanceSpeedByRank, 2, 1),
    numberAt('진군 R3', BALANCE.advanceSpeedByRank, 3, 1),
    numberAt('진군 R4', BALANCE.advanceSpeedByRank, 4, 1),
    numberAt('진군 R5', BALANCE.advanceSpeedByRank, 5, 1),
    numberRow('적 합류 속도 (px/s)', BALANCE, 'enemyJoinSpeed', 5),
    numberRow('보스 집결 강도 (0~1)', BALANCE, 'bossGatherStrength', 0.1),
    numberRow('집결 이동 속도 (px/s)', BALANCE, 'gatherSpeed', 5),
    numberRow('공격 틱 간격 (s)', BALANCE, 'attackCooldown', 0.1),
    numberRow('적 공격 사거리 보정', BALANCE, 'enemyReach', 5),
    numberRow('완만 구간 증가율 (/웨이브)', BALANCE, 'gentleRate', 0.01),
    numberRow('가파른 구간 시작 웨이브', BALANCE, 'steepStartWave', 1),
    numberRow('가파른 구간 배율 (/웨이브)', BALANCE, 'steepFactor', 0.05),
    numberRow('빈 라인 푸시 배율', BALANCE, 'emptyLinePushScale', 0.1),
    numberRow('빈 라인 전열 여유 (px)', BALANCE, 'emptyLinePushSlack', 1),
  );
  const pfNote = document.createElement('p');
  pfNote.className = 'admin-note';
  pfNote.textContent = `전장 슬롯: 기본 ${BASE_SLOT_COLS}칸 · 최대 ${MAX_SLOT_COLS}칸 (3→5→7). extraInset=(MAX-cols)/2×${SLOT_INSET_PER_COL}px → 3칸=${(MAX_SLOT_COLS - BASE_SLOT_COLS) / 2 * SLOT_INSET_PER_COL}px, 5칸=${(MAX_SLOT_COLS - 5) / 2 * SLOT_INSET_PER_COL}px, 7칸=0 (플레이어블 250 / 350 / 450).`;
  g.appendChild(pfNote);
  panel.appendChild(g);

  const prog = section('메타 진행 / 방어');
  const progNote = document.createElement('p');
  progNote.className = 'admin-note';
  progNote.textContent = '방어벽: 마지노선 접촉 시 HP를 잃고 라인을 밀어냄. HP 0이 되는 충격도 밀치기는 적용되며, 그 다음 접촉은 게임오버. 궁수 탄약은 웨이브 시작(보스 처치)에 재충전.';
  prog.appendChild(progNote);
  prog.append(
    numberRow('보스 클리어 추가 XP/웨이브', PROGRESSION, 'bossXpPerWave', 10),
    numberRow('발사 쿨 하한 (s)', PROGRESSION, 'launchCdFloor', 0.05),
    numberRow('재생 전열 여유 (px)', PROGRESSION, 'regenNearSlack', 1),
    numberRow('벽 기본 HP', PROGRESSION, 'wallBaseHp', 1),
    numberRow('벽 접촉 피해', PROGRESSION, 'wallDmgPerHit', 1),
    numberRow('벽 기본 밀치기 (px)', PROGRESSION, 'wallBaseKnockback', 5),
    numberRow('궁수 최대 수', PROGRESSION, 'archerMax', 1),
    numberRow('궁수 기본 사거리', PROGRESSION, 'archerBaseRange', 5),
    numberRow('궁수 기본 공격력', PROGRESSION, 'archerBaseAtk', 1),
    numberRow('궁수 기본 탄약/웨이브', PROGRESSION, 'archerBaseAmmo', 1),
    numberRow('궁수 공격 간격 (s)', PROGRESSION, 'archerInterval', 0.05),
  );
  panel.appendChild(prog);

  const xpSec = section('레벨 XP 곡선 (해당 레벨 → 다음)');
  for (let lv = 1; lv < XP_TO_NEXT.length; lv++) {
    xpSec.appendChild(numberRow(`Lv ${lv} → ${lv + 1}`, XP_TO_NEXT, lv, 50));
  }
  panel.appendChild(xpSec);

  const skSec = section('스킬 수치 (랭크당)');
  for (const skill of SKILLS) {
    const h = document.createElement('h4');
    const step = Number.isFinite(skill.rankLevelStep) ? skill.rankLevelStep : 1;
    h.textContent = `${skill.name} (해금 Lv${skill.unlockLevel}, 랭크당 +${step}Lv, 최대 ${skill.maxRank})`;
    skSec.appendChild(h);
    if (skill.maxRank > 1) {
      if (!Number.isFinite(skill.rankLevelStep)) skill.rankLevelStep = 1;
      skSec.appendChild(numberRow('rankLevelStep', skill, 'rankLevelStep', 1));
    }
    for (const key of Object.keys(skill)) {
      if (!['perRank', 't2PerRank', 't3PerRank', 't3StartRank', 'dmgPerRank', 'radiusBase', 'radiusPerRank', 'knockbackPerRank', 'healPctPerRank', 'hpPerRank', 'kbPerRank', 'extraPerRank'].includes(key)) continue;
      if (skill.id === 'advance' && key === 'perRank') continue;
      const step = Math.abs(skill[key]) < 1 ? 0.001 : 1;
      skSec.appendChild(numberRow(key, skill, key, step));
    }
  }
  panel.appendChild(skSec);

  // 적 스탯
  const es = section('적 스탯 (speed = 라인 가속 기여)');
  for (const key of Object.keys(MONSTERS)) {
    const m = MONSTERS[key];
    const h = document.createElement('h4');
    h.textContent = m.name;
    es.appendChild(h);
    es.append(
      numberRow('HP', m, 'hp', 10),
      numberRow('공격력', m, 'atk', 1),
      numberRow('라인 가속 (px/s)', m, 'speed', 0.5),
    );
  }
  panel.appendChild(es);

  // 아군 스탯
  const us = section('아군 스탯');
  for (const u of UNITS) {
    const h = document.createElement('h4');
    h.textContent = `T${u.tier} ${u.name}`;
    us.appendChild(h);
    us.append(
      numberRow('HP', u, 'hp', 10),
      numberRow('공격력', u, 'atk', 1),
      numberRow('저지력 (px/s)', u, 'stop', 1),
      numberRow('사거리 (px)', u, 'range', 5),
    );
  }
  panel.appendChild(us);

  document.body.appendChild(panel);

  const btn = document.createElement('button');
  btn.id = 'adminBtn';
  btn.textContent = '⚙';
  btn.title = '어드민 패널 (A)';
  document.body.appendChild(btn);

  const toggle = () => panel.classList.toggle('hidden');
  btn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') toggle();
  });
}
