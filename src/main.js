import './style.css';
import { assets } from './assets.js';
import { Game } from './game.js';
import { setupAdmin } from './admin.js';
import { meta } from './meta.js';
import { setupSkillsUi } from './skills-ui.js';
import { setupViewScale } from './viewScale.js';

const canvas = document.getElementById('game');
const ui = {
  startOverlay: document.getElementById('startOverlay'),
  gameoverOverlay: document.getElementById('gameoverOverlay'),
  finalScore: document.getElementById('finalScore'),
  restartBtn: document.getElementById('restartBtn'),
  metaStatus: document.getElementById('metaStatus'),
};

await assets.ready;

const game = new Game(canvas, ui);
setupAdmin(game);
setupSkillsUi(game, meta);
setupViewScale((s) => game.setViewScale(s));
