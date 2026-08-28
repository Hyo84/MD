// 게임 안 확인 팝업. 브라우저 confirm 대신 사용.

export function showConfirm({
  title = '확인',
  message = '',
  confirmText = '확인',
  cancelText = '취소',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const host = document.body;
    if (!host) {
      resolve(false);
      return;
    }
    document.getElementById('confirmOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirmOverlay';
    overlay.className = 'confirm-overlay';

    const box = document.createElement('div');
    box.className = 'confirm-box';

    const h = document.createElement('h3');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = message;

    const row = document.createElement('div');
    row.className = 'confirm-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'popup-close';
    cancel.textContent = cancelText;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = danger ? 'confirm-ok danger' : 'confirm-ok';
    ok.textContent = confirmText;

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };
    cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(false);
    });
    ok.addEventListener('click', (e) => {
      e.stopPropagation();
      finish(true);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false);
    });
    overlay.addEventListener('pointerdown', (e) => e.stopPropagation());

    row.append(cancel, ok);
    box.append(h, p, row);
    overlay.appendChild(box);
    host.appendChild(overlay);
    ok.focus();
  });
}
