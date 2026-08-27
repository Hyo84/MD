const STORAGE_KEY = 'md.knightslide.viewScale';
const BASE_W = 450;
const BASE_H = 800;

function maxFitScale() {
  const vv = window.visualViewport;
  let w = vv?.width ?? window.innerWidth;
  let h = vv?.height ?? window.innerHeight;
  const cs = getComputedStyle(document.body);
  w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  h -= (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  return Math.max(0.25, Math.min(w / BASE_W, h / BASE_H));
}

function loadMode() {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === '1' || v === '2' || v === '3' || v === 'full') return v;
  return '1';
}

export function setupViewScale(onScale) {
  const wrap = document.getElementById('wrap');
  const host = document.getElementById('scaleHost') || document.getElementById('chromeLeft') || wrap;
  const bar = document.createElement('div');
  bar.id = 'scaleBar';
  bar.setAttribute('aria-label', '화면 크기');

  const modes = [
    { id: '1', label: '1배' },
    { id: '2', label: '2배' },
    { id: '3', label: '3배' },
    { id: 'full', label: '전체' },
  ];

  let mode = loadMode();

  function apply() {
    wrap.classList.remove('view-fit');
    const want = mode === 'full' ? maxFitScale() : Number(mode);
    const used = Math.min(want, maxFitScale());
    wrap.style.width = `${BASE_W * used}px`;
    wrap.style.height = `${BASE_H * used}px`;
    onScale?.(used);
    bar.title = mode !== 'full' && used + 0.02 < want
      ? `화면이 작아 ${want}배를 다 넣을 수 없어 ${used.toFixed(2)}배로 맞춥니다.`
      : '';
    for (const btn of bar.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    }
  }

  async function setMode(next) {
    mode = next;
    localStorage.setItem(STORAGE_KEY, mode);
    try {
      if (mode === 'full' && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else if (mode !== 'full' && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      if (mode === 'full') {
        mode = '1';
        localStorage.setItem(STORAGE_KEY, mode);
      }
    }
    apply();
  }

  for (const m of modes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.mode = m.id;
    btn.textContent = m.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMode(m.id);
    });
    bar.append(btn);
  }

  host.append(bar);

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && mode === 'full') {
      mode = '1';
      localStorage.setItem(STORAGE_KEY, mode);
    }
    apply();
  });

  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === '1') setMode('1');
    if (e.key === '2') setMode('2');
    if (e.key === '3') setMode('3');
    if (e.key === 'f' || e.key === 'F' || e.key === 'ㄹ') setMode('full');
  });

  if (mode === 'full') setMode('full');
  else apply();

  return apply;
}
