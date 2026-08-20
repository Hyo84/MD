import './style.css';
import { Game } from './game.js';
import { setupAdmin } from './admin.js';

const canvas = document.getElementById('game');
const ui = {
  startOverlay: document.getElementById('startOverlay'),
  gameoverOverlay: document.getElementById('gameoverOverlay'),
  finalScore: document.getElementById('finalScore'),
  restartBtn: document.getElementById('restartBtn'),
};

new Game(canvas, ui);
setupAdmin();
