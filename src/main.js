import './style.css';
import { assets } from './assets.js';
import { Game } from './game.js';
import { setupAdmin } from './admin.js';
import { meta } from './meta.js';
import { setupSkillsUi } from './skills-ui.js';
import { setupViewScale } from './viewScale.js';
import { audio, setupAudioUi } from './audio.js';

const loadOverlay = document.getElementById('loadOverlay');
const loadFill = document.getElementById('loadFill');
const loadPct = document.getElementById('loadPct');
const loadLabel = document.getElementById('loadLabel');

assets.onProgress = (pct, label) => {
  if (loadFill) loadFill.style.width = `${pct}%`;
  if (loadPct) loadPct.textContent = `${pct}%`;
  if (loadLabel && label) loadLabel.textContent = label;
};

const canvas = document.getElementById('game');
const ui = {
  startOverlay: document.getElementById('startOverlay'),
  gameoverOverlay: document.getElementById('gameoverOverlay'),
  resultTitle: document.getElementById('resultTitle'),
  finalScore: document.getElementById('finalScore'),
  resultXp: document.getElementById('resultXp'),
  estateFromResult: document.getElementById('estateFromResult'),
  restartBtn: document.getElementById('restartBtn'),
  metaStatus: document.getElementById('metaStatus'),
  tapToStart: document.getElementById('tapToStart'),
  startChoices: document.getElementById('startChoices'),
  startEstateBtn: document.getElementById('startEstateBtn'),
  startPlayBtn: document.getElementById('startPlayBtn'),
  tutorialOverlay: document.getElementById('tutorialOverlay'),
};

let game = null;
const applyScale = setupViewScale((s) => game?.setViewScale(s));

await assets.ready;
loadOverlay?.classList.add('hidden');

game = new Game(canvas, ui);
applyScale();
setupAdmin(game);
setupSkillsUi(game, meta);
setupAudioUi();
audio.armUnlock();
