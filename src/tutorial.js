// 첫 시작 계정 말풍선 튜토리얼. 클릭만으로 넘김. 설명 중 라인 정지.

import { CANVAS_W, CANVAS_H, DEFEAT_Y, TUTORIAL_STORAGE_KEY, AUTO_UNLOCK_STORAGE_KEY } from './config.js';
import { autoFireRect } from './renderer.js';

export const TUTORIAL_INTRO_STEPS = [
  {
    id: 'waveLine',
    anchor: 'waveLine',
    title: '웨이브라인',
    text: '캠프 아래 가로선이 웨이브라인입니다. 적이 붙으면 이 선이 아래로 밀려 전장이 좁아집니다.',
    hint: '탭하여 다음',
  },
  {
    id: 'push',
    anchor: 'waveLine',
    title: '밀리는 이유',
    text: '적은 진격 수치만큼 웨이브라인을 밀어 내립니다. 아군이 없는 빈 열이 생기면 그 열부터 밀립니다. 전열을 비우지 마세요.',
    hint: '탭하여 다음',
  },
  {
    id: 'lastLine',
    anchor: 'lastLine',
    title: '라스트라인',
    text: '아래 빨간 선이 라스트라인입니다. 웨이브라인이 여기까지 밀리면 패배합니다.',
    hint: '탭하여 다음',
  },
  {
    id: 'boss',
    anchor: 'lastLine',
    title: '보스전',
    text: '보스가 전열에 붙으면 웨이브라인은 무조건 밀립니다. 보스를 빨리 처치하세요.',
    hint: '탭하여 다음',
  },
  {
    id: 'play',
    anchor: 'center',
    title: '전투 시작',
    text: '화면을 터치한 채 있으면 병사가 발사됩니다. 자동 발사는 1웨이브를 끝낸 뒤 열립니다.',
    hint: '탭하여 시작',
  },
];

export const TUTORIAL_AUTO_STEP = {
  id: 'auto',
  anchor: 'auto',
  title: '자동 발사',
  text: '자동 버튼이 열렸습니다. 하단 자동 버튼을 누르거나 스페이스로 켜고 끌 수 있습니다.',
  hint: '탭하여 계속',
};

function readFlag(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeFlag(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function clearFlag(key) {
  try {
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export function tutorialPhase() {
  return readFlag(TUTORIAL_STORAGE_KEY);
}

export function autoUnlockSaved() {
  return readFlag(AUTO_UNLOCK_STORAGE_KEY) === '1';
}

export function markTutorialStarted() {
  if (tutorialPhase() === 'done' || tutorialPhase() === 'intro') return;
  writeFlag(TUTORIAL_STORAGE_KEY, 'started');
}

export function markTutorialIntroDone() {
  if (tutorialPhase() === 'done') return;
  writeFlag(TUTORIAL_STORAGE_KEY, 'intro');
}

export function markTutorialDone() {
  writeFlag(TUTORIAL_STORAGE_KEY, 'done');
  writeFlag(AUTO_UNLOCK_STORAGE_KEY, '1');
}

export function markAutoUnlocked() {
  writeFlag(AUTO_UNLOCK_STORAGE_KEY, '1');
}

export function resetTutorialProgress() {
  clearFlag(TUTORIAL_STORAGE_KEY);
  clearFlag(AUTO_UNLOCK_STORAGE_KEY);
}

export function setupTutorialUi(game, overlay) {
  if (!overlay) return null;
  const band = overlay.querySelector('#tutorialBand');
  const spot = overlay.querySelector('#tutorialSpot');
  const balloon = overlay.querySelector('#tutorialBalloon');
  const title = overlay.querySelector('#tutorialTitle');
  const text = overlay.querySelector('#tutorialText');
  const hint = overlay.querySelector('#tutorialHint');

  const hide = () => {
    overlay.classList.add('hidden');
    overlay.dataset.anchor = '';
  };

  const show = (step, lineY) => {
    if (!step) {
      hide();
      return;
    }
    overlay.classList.remove('hidden');
    overlay.dataset.anchor = step.anchor || 'center';
    if (title) title.textContent = step.title || '';
    if (text) text.textContent = step.text || '';
    if (hint) hint.textContent = step.hint || '탭하여 다음';

    if (band) {
      band.classList.toggle('hidden', step.anchor !== 'waveLine' && step.anchor !== 'lastLine');
      const y = step.anchor === 'lastLine' ? DEFEAT_Y : (Number(lineY) || 0);
      band.style.top = `${(y / CANVAS_H) * 100}%`;
    }
    if (spot) {
      const auto = step.anchor === 'auto';
      spot.classList.toggle('hidden', !auto);
      if (auto) {
        const r = autoFireRect();
        spot.style.left = `${(r.x / CANVAS_W) * 100}%`;
        spot.style.top = `${(r.y / CANVAS_H) * 100}%`;
        spot.style.width = `${(r.w / CANVAS_W) * 100}%`;
        spot.style.height = `${(r.h / CANVAS_H) * 100}%`;
      }
    }
    if (balloon) {
      balloon.className = `tutorial-balloon anchor-${step.anchor || 'center'}`;
      if (step.anchor === 'waveLine') {
        const y = Math.min(58, Math.max(32, ((Number(lineY) || 228) / CANVAS_H) * 100 + 8));
        balloon.style.top = `${y}%`;
        balloon.style.bottom = '';
      } else if (step.anchor === 'lastLine') {
        balloon.style.top = '42%';
        balloon.style.bottom = '';
      } else if (step.anchor === 'auto') {
        balloon.style.top = '';
        balloon.style.bottom = `${100 - (autoFireRect().y / CANVAS_H) * 100 + 3}%`;
      } else {
        balloon.style.top = '38%';
        balloon.style.bottom = '';
      }
    }
  };

  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.tutorialAdvance?.();
  });

  return { show, hide, overlay };
}
