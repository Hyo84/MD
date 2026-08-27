import './style.css';
import { assets } from './assets.js';
import { Game } from './game.js';
import { setupAdmin } from './admin.js';
import { meta } from './meta.js';
import { setupSkillsUi } from './skills-ui.js';
import { setupViewScale } from './viewScale.js';

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
  finalScore: document.getElementById('finalScore'),
  restartBtn: document.getElementById('restartBtn'),
  metaStatus: document.getElementById('metaStatus'),
};

let game = null;
const applyScale = setupViewScale((s) => game?.setViewScale(s));

await assets.ready;
loadOverlay?.classList.add('hidden');

game = new Game(canvas, ui);
applyScale();
setupAdmin(game);
setupSkillsUi(game, meta);
