// 간단한 Web Audio 배경음·효과음. mp3 없이 오실레이터로 재생.
import { AUDIO_STORAGE_KEY } from './config.js';

function loadMuted() {
  try {
    const raw = localStorage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed.muted;
  } catch {
    return false;
  }
}

function saveMuted(muted) {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ muted: !!muted }));
  } catch { /* quota / private mode */ }
}

function envGain(ctx, dest, start, peak, attack, dur) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  g.connect(dest);
  return g;
}

function tone(ctx, dest, { type = 'triangle', freq = 220, t, dur = 0.12, peak = 0.12, attack = 0.01, slide = 0 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  osc.connect(envGain(ctx, dest, t, peak, attack, dur));
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const MELODY = [220, 261.63, 329.63, 261.63, 392, 329.63, 293.66, 220];

class AudioBus {
  constructor() {
    this.muted = loadMuted();
    this.mode = 'menu';
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this._bgmOn = false;
    this._nextNote = 0;
    this._step = 0;
    this._bgmTimer = 0;
    this._lastSfx = new Map();
    this._listeners = new Set();
    this._armed = false;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    for (const fn of this._listeners) fn(this);
  }

  armUnlock() {
    if (this._armed || typeof document === 'undefined') return;
    this._armed = true;
    const unlock = () => this.unlock();
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
  }

  unlock() {
    const AC = typeof window === 'undefined'
      ? null
      : (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.42;
      this.bgmGain.gain.value = 0.14;
      this.sfxGain.connect(this.master);
      this.bgmGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this._applyMute();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this._ensureBgm();
  }

  setMuted(on) {
    this.muted = !!on;
    saveMuted(this.muted);
    this._applyMute();
    if (!this.muted) this.unlock();
    this._emit();
  }

  toggleMuted() {
    this.setMuted(!this.muted);
  }

  _applyMute() {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.04);
    if (this.muted) this._stopBgm();
    else this._ensureBgm();
  }

  setMode(mode) {
    this.mode = mode === 'play' || mode === 'result' ? mode : 'menu';
    if (!this.muted) this.unlock();
  }

  play(name) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;
    const fire = () => {
      if (this.muted || !this.ctx) return;
      const gap = name === 'kill' ? 0.09 : name === 'ascend' ? 0.6 : 0.04;
      const last = this._lastSfx.get(name) || 0;
      const now = this.ctx.currentTime;
      if (now - last < gap) return;
      this._lastSfx.set(name, now);
      const dest = this.sfxGain;
      const t = now;
      switch (name) {
        case 'launch':
          tone(this.ctx, dest, { type: 'square', freq: 420, t, dur: 0.09, peak: 0.08, slide: 0.55 });
          break;
        case 'merge':
          tone(this.ctx, dest, { type: 'triangle', freq: 392, t, dur: 0.1, peak: 0.12 });
          tone(this.ctx, dest, { type: 'triangle', freq: 523.25, t: t + 0.05, dur: 0.14, peak: 0.12 });
          break;
        case 'kill':
          tone(this.ctx, dest, { type: 'square', freq: 180, t, dur: 0.07, peak: 0.07, slide: 0.45 });
          break;
        case 'boss':
          tone(this.ctx, dest, { type: 'sawtooth', freq: 90, t, dur: 0.45, peak: 0.14, slide: 0.55 });
          tone(this.ctx, dest, { type: 'triangle', freq: 180, t: t + 0.08, dur: 0.28, peak: 0.08 });
          break;
        case 'wave':
          tone(this.ctx, dest, { type: 'triangle', freq: 392, t, dur: 0.12, peak: 0.1 });
          tone(this.ctx, dest, { type: 'triangle', freq: 523.25, t: t + 0.08, dur: 0.14, peak: 0.1 });
          tone(this.ctx, dest, { type: 'triangle', freq: 659.25, t: t + 0.16, dur: 0.18, peak: 0.1 });
          break;
        case 'defeat':
          tone(this.ctx, dest, { type: 'sawtooth', freq: 196, t, dur: 0.22, peak: 0.12, slide: 0.7 });
          tone(this.ctx, dest, { type: 'sawtooth', freq: 130.8, t: t + 0.16, dur: 0.35, peak: 0.12, slide: 0.65 });
          break;
        case 'victory':
          tone(this.ctx, dest, { type: 'triangle', freq: 523.25, t, dur: 0.16, peak: 0.14 });
          tone(this.ctx, dest, { type: 'triangle', freq: 659.25, t: t + 0.12, dur: 0.16, peak: 0.14 });
          tone(this.ctx, dest, { type: 'triangle', freq: 783.99, t: t + 0.24, dur: 0.22, peak: 0.16 });
          tone(this.ctx, dest, { type: 'triangle', freq: 1046.5, t: t + 0.38, dur: 0.32, peak: 0.16 });
          break;
        case 'ascend': {
          const bell = (freq, delay, dur, peak) => {
            tone(this.ctx, dest, { type: 'sine', freq, t: t + delay, dur, peak, attack: 0.012 });
            tone(this.ctx, dest, {
              type: 'triangle', freq: freq * 2, t: t + delay, dur: dur * 0.72, peak: peak * 0.32, attack: 0.01,
            });
          };
          tone(this.ctx, dest, { type: 'sine', freq: 261.63, t, dur: 1.15, peak: 0.055, attack: 0.08 });
          tone(this.ctx, dest, { type: 'sine', freq: 392, t: t + 0.04, dur: 1.1, peak: 0.04, attack: 0.1 });
          bell(523.25, 0.02, 0.88, 0.12);
          bell(659.25, 0.16, 0.92, 0.1);
          bell(783.99, 0.3, 1.0, 0.13);
          bell(1046.5, 0.46, 1.08, 0.11);
          tone(this.ctx, dest, { type: 'sine', freq: 1568, t: t + 0.58, dur: 0.55, peak: 0.045, attack: 0.02, slide: 1.12 });
          break;
        }
        case 'ui':
          tone(this.ctx, dest, { type: 'square', freq: 660, t, dur: 0.05, peak: 0.05 });
          break;
        default:
          break;
      }
    };
    if (this.ctx.state !== 'running') {
      this.ctx.resume().then(fire).catch(() => {});
      return;
    }
    fire();
  }

  _ensureBgm() {
    if (this.muted || !this.ctx || this._bgmOn) return;
    this._bgmOn = true;
    this._nextNote = this.ctx.currentTime + 0.05;
    this._tickBgm();
  }

  _stopBgm() {
    this._bgmOn = false;
    if (this._bgmTimer) {
      clearTimeout(this._bgmTimer);
      this._bgmTimer = 0;
    }
  }

  _tickBgm() {
    if (!this._bgmOn || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const stepDur = this.mode === 'play' ? 0.4 : 0.68;
    while (this._nextNote < now + 0.85) {
      this._playBgmStep(this._nextNote, stepDur);
      this._nextNote += stepDur;
      this._step += 1;
    }
    this._bgmTimer = setTimeout(() => this._tickBgm(), 180);
  }

  _playBgmStep(t, stepDur) {
    const dest = this.bgmGain;
    const drone = this.mode === 'result' ? 98 : 110;
    tone(this.ctx, dest, { type: 'sine', freq: drone, t, dur: stepDur * 1.05, peak: 0.045, attack: 0.03 });
    if (this.mode === 'result') return;
    const note = MELODY[this._step % MELODY.length];
    const peak = this.mode === 'play' ? 0.07 : 0.045;
    tone(this.ctx, dest, { type: 'triangle', freq: note, t, dur: stepDur * 0.72, peak, attack: 0.02 });
    if (this.mode === 'play' && this._step % 4 === 0) {
      tone(this.ctx, dest, { type: 'square', freq: 55, t, dur: 0.08, peak: 0.035, attack: 0.005 });
    }
  }
}

export const audio = new AudioBus();

export function setupAudioUi() {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('chromeRight') || document.body;
  const btn = document.createElement('button');
  btn.id = 'audioBtn';
  btn.type = 'button';
  btn.title = '소리 켜기/끄기 (M)';
  const paint = () => {
    btn.textContent = audio.muted ? '🔇' : '🔊';
    btn.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  };
  paint();
  audio.onChange(paint);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    audio.toggleMuted();
  });
  host.insertBefore(btn, host.firstChild);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') {
      e.preventDefault();
      audio.toggleMuted();
    }
  });
}
