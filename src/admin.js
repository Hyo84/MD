// 어드민 패널: config 객체 값을 실시간으로 수정 (A 키 또는 ⚙ 버튼)
import { BALANCE, UNITS, MONSTERS, LIVE_MULT_MIN, LIVE_MULT_MAX, LIVE_MULT_STEP, SPAWN_RATE_MIN, SPAWN_RATE_MAX, SPAWN_RATE_STEP, PROGRESSION, XP_TO_NEXT, SKILLS, BASE_SLOT_COLS, MAX_SLOT_COLS, SLOT_INSET_PER_COL, BRANDING, BRANDING_STORAGE_KEY, ECONOMY, SHOP, HERO_MISSION, SHOP_MIN_TIER, SHOP_MAX_TIER } from './config.js';

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

function textRow(label, obj, key, onChange) {
  const row = document.createElement('label');
  row.className = 'admin-row admin-row-text';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = String(obj[key] ?? '');
  input.addEventListener('input', () => {
    obj[key] = input.value;
    onChange?.();
  });
  row.append(span, input);
  return row;
}

function loadBranding() {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed.title === 'string') BRANDING.title = parsed.title;
    if (typeof parsed.subtitle === 'string' && parsed.subtitle !== '중세 슬라이드 & 머지 디펜스') {
      BRANDING.subtitle = parsed.subtitle;
    }
  } catch { /* ignore */ }
}

function persistBranding() {
  try {
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify({
      title: BRANDING.title,
      subtitle: BRANDING.subtitle,
    }));
  } catch { /* quota / private mode */ }
}

function applyBranding() {
  document.title = BRANDING.title || 'KnightSlide';
  const h1 = document.getElementById('gameTitle');
  const sub = document.getElementById('gameSubtitle');
  if (h1) h1.textContent = BRANDING.title;
  if (sub) sub.textContent = BRANDING.subtitle;
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

  const head = document.createElement('div');
  head.className = 'admin-head';
  const title = document.createElement('h2');
  title.textContent = '⚙ 어드민 패널';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'popup-close';
  close.textContent = '닫기';
  close.title = '어드민 닫기';
  head.append(title, close);

  const body = document.createElement('div');
  body.className = 'admin-body';
  panel.append(head, body);

  const note = document.createElement('p');
  note.className = 'admin-note';
  note.textContent = '값은 즉시 적용됩니다. 실시간 난이도는 살아있는 적 HP/ATK/라인 가속에도 바로 반영됩니다. (기본 HP 테이블은 신규 개체부터)';
  body.appendChild(note);

  loadBranding();
  applyBranding();
  persistBranding();
  const brandSec = section('제목 / 서브타이틀');
  const saveBrand = () => { persistBranding(); applyBranding(); };
  brandSec.append(
    textRow('게임 제목', BRANDING, 'title', saveBrand),
    textRow('서브타이틀', BRANDING, 'subtitle', saveBrand),
  );
  body.appendChild(brandSec);

  const cheatSec = section('치트');
  const cheatNote = document.createElement('p');
  cheatNote.className = 'admin-note';
  cheatNote.textContent = 'On이면 T2–T9를 골드·한도·용병술 없이 즉시 장전합니다. 기본은 Off.';
  const cheatRow = document.createElement('div');
  cheatRow.className = 'admin-row';
  const cheatSpan = document.createElement('span');
  cheatSpan.textContent = '치트';
  const cheatToggle = document.createElement('div');
  cheatToggle.className = 'admin-toggle';
  const cheatOff = document.createElement('button');
  cheatOff.type = 'button';
  cheatOff.textContent = 'Off';
  const cheatOn = document.createElement('button');
  cheatOn.type = 'button';
  cheatOn.textContent = 'On';
  const syncCheats = () => {
    cheatOff.classList.toggle('active', !game.cheatsEnabled);
    cheatOn.classList.toggle('active', !!game.cheatsEnabled);
  };
  cheatOff.addEventListener('click', () => game.setCheatsEnabled(false));
  cheatOn.addEventListener('click', () => game.setCheatsEnabled(true));
  game.onCheatsChange = syncCheats;
  syncCheats();
  cheatToggle.append(cheatOff, cheatOn);
  cheatRow.append(cheatSpan, cheatToggle);
  cheatSec.append(cheatNote, cheatRow);
  body.appendChild(cheatSec);

  const eco = section('경제');
  const ecoNote = document.createElement('p');
  ecoNote.className = 'admin-note';
  ecoNote.textContent = '골드는 현재 런에 즉시 반영. 초기 자금은 다음 시작부터. 상점 한도 -1 = 무제한. 치트 On이면 T2–T9 무료·무한.';
  eco.appendChild(ecoNote);
  const goldRow = document.createElement('div');
  goldRow.className = 'admin-row';
  const goldSpan = document.createElement('span');
  goldSpan.textContent = '보유 골드';
  const goldStep = document.createElement('div');
  goldStep.className = 'admin-stepper';
  const goldMinus = document.createElement('button');
  goldMinus.type = 'button';
  goldMinus.textContent = '−1k';
  const goldInput = document.createElement('input');
  goldInput.type = 'number';
  goldInput.step = '100';
  goldInput.value = String(Math.floor(game.gold || 0));
  const goldPlus = document.createElement('button');
  goldPlus.type = 'button';
  goldPlus.textContent = '+1k';
  const syncGold = () => { goldInput.value = String(Math.floor(game.gold || 0)); };
  goldMinus.addEventListener('click', () => { game.addGold(-1000); syncGold(); });
  goldPlus.addEventListener('click', () => { game.addGold(1000); syncGold(); });
  goldInput.addEventListener('change', () => {
    const v = parseFloat(goldInput.value);
    if (Number.isFinite(v)) game.setGold(v);
    syncGold();
  });
  game.onGoldChange = syncGold;
  goldStep.append(goldMinus, goldInput, goldPlus);
  goldRow.append(goldSpan, goldStep);
  eco.append(
    goldRow,
    numberRow('초기 자금 기본값', ECONOMY, 'startGold', 10),
    numberRow('세금 기본 (G/초)', ECONOMY, 'taxPerSec', 0.1),
    numberRow('바운티 전역 배율', ECONOMY, 'bountyMult', 0.05),
    numberRow('용병술 0랭크 최대 티어', ECONOMY, 'shopBaseTier', 1),
  );
  for (let t = SHOP_MIN_TIER; t <= SHOP_MAX_TIER; t++) {
    const h = document.createElement('h4');
    h.textContent = `상점 T${t} ${UNITS[t - 1]?.name || ''}`;
    eco.appendChild(h);
    eco.append(
      numberRow('가격 (G)', SHOP[t], 'price', 10),
      numberRow('웨이브 한도 (-1=∞)', SHOP[t], 'limit', 1),
    );
  }
  for (const key of Object.keys(MONSTERS)) {
    eco.appendChild(numberRow(`${MONSTERS[key].name} 처치 골드`, MONSTERS[key], 'gold', 1));
  }
  body.appendChild(eco);

  const tempo = section('전투 / 템포');
  tempo.append(
    numberRow('발사 쿨다운 (s)', BALANCE, 'launchCooldown', 0.05),
    numberRow('머지 콤보 쿨감 비율', BALANCE, 'mergeComboCdRefund', 0.05),
    numberRow('영웅 사명 최소 딜', HERO_MISSION, 'min', 1000),
    numberRow('영웅 사명 기본 딜량', HERO_MISSION, 'base', 1000),
    numberRow('영웅 사명 웨이브당 증가', HERO_MISSION, 'perWave', 500),
  );
  body.appendChild(tempo);

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
  body.appendChild(liveSec);

  const spawnSec = section('실시간 리스폰');
  const spawnNote = document.createElement('p');
  spawnNote.className = 'admin-note';
  spawnNote.textContent = '적 스폰 타이머 속도. 1 = 기본, 2 = 두 배 빠름. 화면 왼쪽 버튼으로도 조절됩니다. 재시작해도 유지.';
  spawnSec.appendChild(spawnNote);
  const spawnRow = document.createElement('div');
  spawnRow.className = 'admin-row';
  const spawnSpan = document.createElement('span');
  spawnSpan.textContent = '리스폰 배율';
  const spawnStepper = document.createElement('div');
  spawnStepper.className = 'admin-stepper';
  const spawnMinus = document.createElement('button');
  spawnMinus.type = 'button';
  spawnMinus.textContent = '−';
  const spawnInput = document.createElement('input');
  spawnInput.type = 'number';
  spawnInput.step = String(SPAWN_RATE_STEP);
  spawnInput.min = String(SPAWN_RATE_MIN);
  spawnInput.max = String(SPAWN_RATE_MAX);
  const spawnPlus = document.createElement('button');
  spawnPlus.type = 'button';
  spawnPlus.textContent = '+';
  const syncSpawn = () => { spawnInput.value = game.spawnRateMult.toFixed(1); };
  syncSpawn();
  spawnMinus.addEventListener('click', () => game.adjustSpawnRateMult(-SPAWN_RATE_STEP));
  spawnPlus.addEventListener('click', () => game.adjustSpawnRateMult(SPAWN_RATE_STEP));
  spawnInput.addEventListener('change', () => {
    const v = parseFloat(spawnInput.value);
    if (Number.isFinite(v)) game.setSpawnRateMult(v);
    syncSpawn();
  });
  game.onSpawnRateChange = syncSpawn;
  spawnStepper.append(spawnMinus, spawnInput, spawnPlus);
  spawnRow.append(spawnSpan, spawnStepper);
  spawnSec.appendChild(spawnRow);
  body.appendChild(spawnSec);

  // 전역 설정
  const g = section('전역 설정');
  g.append(
    numberRow('기본 라인 속도 (px/s)', BALANCE, 'baseLineSpeed', 0.5),
    numberRow('적 스폰 간격 (s)', BALANCE, 'spawnInterval', 0.1),
    numberRow('웨이브 스폰 가속', BALANCE, 'spawnIntervalAccel', 0.01),
    numberRow('최단 스폰 간격 (s)', BALANCE, 'spawnIntervalFloor', 0.05),
    numberRow('캠프 침입 배율 최소', BALANCE, 'spawnCampRaidMin', 0.1),
    numberRow('캠프 침입 배율 최대', BALANCE, 'spawnCampRaidMax', 0.1),
    numberRow('아군 캠프 접근 거리 (px)', BALANCE, 'spawnCampApproachRange', 10),
    numberRow('아군 캠프 접촉 스폰 배율', BALANCE, 'spawnCampTouchMult', 0.1),
    numberRow('캠프 접근 가속 지수', BALANCE, 'spawnCampApproachEase', 0.1),
    numberRow('캠프 러시 최단 간격 (s)', BALANCE, 'spawnCampRushFloor', 0.01),
    numberRow('보스 호위 부하 수', BALANCE, 'bossEscortCount', 1),
    numberRow('보스 해골기사 기본 수', BALANCE, 'bossKnightEscorts', 1),
    numberRow('보스전 부하 상한', BALANCE, 'bossMinionCap', 1),
    numberRow('보스 최소 진격 (px/s)', BALANCE, 'bossMinAdvance', 0.5),
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
    numberRow('가파른 구간 첫 배율', BALANCE, 'steepFactor', 0.05),
    numberRow('클리프 이후 배율 (/웨이브)', BALANCE, 'steepContinue', 0.05),
    numberRow('빈 라인 푸시 배율', BALANCE, 'emptyLinePushScale', 0.1),
    numberRow('빈 라인 전열 여유 (px)', BALANCE, 'emptyLinePushSlack', 1),
  );
  const pfNote = document.createElement('p');
  pfNote.className = 'admin-note';
  pfNote.textContent = `전장 슬롯: 기본 ${BASE_SLOT_COLS}칸 · 최대 ${MAX_SLOT_COLS}칸 (3→5→7). extraInset=(MAX-cols)/2×${SLOT_INSET_PER_COL}px → 3칸=${(MAX_SLOT_COLS - BASE_SLOT_COLS) / 2 * SLOT_INSET_PER_COL}px, 5칸=${(MAX_SLOT_COLS - 5) / 2 * SLOT_INSET_PER_COL}px, 7칸=0 (플레이어블 250 / 350 / 450).`;
  g.appendChild(pfNote);
  body.appendChild(g);

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
  body.appendChild(prog);

  const xpSec = section('레벨 XP 곡선 (해당 레벨 → 다음)');
  for (let lv = 1; lv < XP_TO_NEXT.length; lv++) {
    xpSec.appendChild(numberRow(`Lv ${lv} → ${lv + 1}`, XP_TO_NEXT, lv, 50));
  }
  body.appendChild(xpSec);

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
  body.appendChild(skSec);

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
    if (m.regenDelay != null) es.appendChild(numberRow('재생 대기 (s)', m, 'regenDelay', 0.05));
    if (m.regenPct != null) es.appendChild(numberRow('비전투 재생 (/초)', m, 'regenPct', 0.01));
    if (m.regen != null) es.appendChild(numberRow('고정 재생 (HP/s)', m, 'regen', 1));
  }
  body.appendChild(es);

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
  body.appendChild(us);

  document.body.appendChild(panel);

  const chromeRight = document.getElementById('chromeRight') || document.body;

  const btn = document.createElement('button');
  btn.id = 'adminBtn';
  btn.type = 'button';
  btn.textContent = '⚙';
  btn.title = '어드민 패널 (A)';

  const restart = document.createElement('button');
  restart.id = 'quickRestartBtn';
  restart.type = 'button';
  restart.textContent = '재시작';
  restart.title = '바로 다시 시작';
  restart.addEventListener('click', (e) => {
    e.stopPropagation();
    game.start();
  });
  btn.addEventListener('click', (e) => e.stopPropagation());
  chromeRight.append(restart, btn);

  const chromeLeft = document.getElementById('chromeLeft') || document.body;
  const spawnBar = document.createElement('div');
  spawnBar.id = 'liveSpawnBar';
  const spawnLabel = document.createElement('div');
  spawnLabel.className = 'live-spawn-label';
  spawnLabel.textContent = '리스폰';
  const spawnBtns = document.createElement('div');
  spawnBtns.className = 'live-spawn-row';
  const sMinus = document.createElement('button');
  sMinus.type = 'button';
  sMinus.textContent = '−';
  const sVal = document.createElement('span');
  sVal.className = 'live-spawn-val';
  const sPlus = document.createElement('button');
  sPlus.type = 'button';
  sPlus.textContent = '+';
  const paintSpawn = () => {
    sVal.textContent = `×${game.spawnRateMult.toFixed(1)}`;
  };
  paintSpawn();
  sMinus.addEventListener('click', (e) => {
    e.stopPropagation();
    game.adjustSpawnRateMult(-SPAWN_RATE_STEP);
  });
  sPlus.addEventListener('click', (e) => {
    e.stopPropagation();
    game.adjustSpawnRateMult(SPAWN_RATE_STEP);
  });
  const prevSpawn = game.onSpawnRateChange;
  game.onSpawnRateChange = () => { prevSpawn?.(); paintSpawn(); };
  spawnBtns.append(sMinus, sVal, sPlus);
  spawnBar.append(spawnLabel, spawnBtns);
  chromeLeft.appendChild(spawnBar);

  const setOpen = (open) => panel.classList.toggle('hidden', !open);
  const toggle = () => setOpen(panel.classList.contains('hidden'));
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(false);
  });
  btn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') toggle();
  });
}
