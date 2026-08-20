// 어드민 패널: config 객체 값을 실시간으로 수정 (A 키 또는 ⚙ 버튼)
import { BALANCE, UNITS, MONSTERS, LIVE_MULT_MIN, LIVE_MULT_MAX, LIVE_MULT_STEP } from './config.js';

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
    numberRow('발사 속도', BALANCE, 'launchSpeed', 1),
    numberRow('아군 전진 속도 (px/s)', BALANCE, 'unitAdvanceSpeed', 1),
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
  panel.appendChild(g);

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
