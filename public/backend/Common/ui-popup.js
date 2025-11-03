// Lightweight modern popup utilities — exportable ES module
// Provides: showPopupMessage(message, type, options) -> Promise<void>
//           showConfirm(message, options) -> Promise<boolean>

export function showPopupMessage(message = '', type = 'info', options = {}) {
  return new Promise((resolve) => {
    const { autoClose = false, timeout = 3000 } = options;

    // Root container
    let container = document.getElementById('_cmp_popup_container');
    if (!container) {
      container = document.createElement('div');
      container.id = '_cmp_popup_container';
      container.style.position = 'fixed';
      container.style.inset = '0';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.zIndex = '9999';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    // Modal card
    const card = document.createElement('div');
    card.className = 'cmp-popup-card';
    card.style.pointerEvents = 'auto';
    card.style.minWidth = '320px';
    card.style.maxWidth = '90%';
    card.style.margin = '0 16px';
    card.style.borderRadius = '12px';
    card.style.padding = '18px 18px';
    card.style.boxShadow = '0 10px 30px rgba(2,6,23,0.35)';
    card.style.backdropFilter = 'blur(6px)';
    card.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(250,250,250,0.92))';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.gap = '12px';

    // Icon
    const icon = document.createElement('div');
    icon.style.width = '44px';
    icon.style.height = '44px';
    icon.style.borderRadius = '10px';
    icon.style.display = 'flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.style.flex = '0 0 44px';
    icon.style.fontSize = '20px';
    icon.style.color = '#fff';

    // Colors by type
    const map = {
      info: { bg: '#2563eb', symbol: 'ℹ️' },
      success: { bg: '#10b981', symbol: '✔️' },
      warning: { bg: '#f59e0b', symbol: '⚠️' },
      error: { bg: '#ef4444', symbol: '❌' }
    };
    const t = map[type] || map.info;
    icon.style.background = t.bg;
    icon.textContent = t.symbol;

    // Message block
    const msg = document.createElement('div');
    msg.style.flex = '1 1 auto';
    msg.style.color = 'rgb(17 24 39)';
    msg.style.fontSize = '15px';
    msg.style.lineHeight = '1.25';
    msg.textContent = message;

    // Action button
    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.style.background = '#0f172a';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';

    // Assemble
    card.appendChild(icon);
    card.appendChild(msg);
    card.appendChild(btn);

    // Add subtle overlay behind card
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(3,7,18,0.36)';
    overlay.style.backdropFilter = 'blur(3px)';
    overlay.style.zIndex = '9998';

    // Container wrapper to stack overlay + card
    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.inset = '0';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.zIndex = '9999';
    wrapper.appendChild(overlay);
    wrapper.appendChild(card);

    container.appendChild(wrapper);

    function cleanup() {
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      resolve();
    }

    btn.addEventListener('click', cleanup);
    overlay.addEventListener('click', cleanup);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', esc);
        cleanup();
      }
    });

    if (autoClose) {
      setTimeout(() => {
        cleanup();
      }, timeout);
    }
  });
}

export function showConfirm(message = '', options = {}) {
  return new Promise((resolve) => {
    const { confirmText = 'Yes', cancelText = 'No' } = options;

    let container = document.getElementById('_cmp_popup_container');
    if (!container) {
      container = document.createElement('div');
      container.id = '_cmp_popup_container';
      container.style.position = 'fixed';
      container.style.inset = '0';
      container.style.display = 'flex';
      container.style.alignItems = 'center';
      container.style.justifyContent = 'center';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }

    const card = document.createElement('div');
    card.style.minWidth = '320px';
    card.style.maxWidth = '90%';
    card.style.margin = '0 16px';
    card.style.borderRadius = '12px';
    card.style.padding = '18px';
    card.style.boxShadow = '0 10px 30px rgba(2,6,23,0.35)';
    card.style.background = 'white';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '12px';

    const msg = document.createElement('div');
    msg.style.color = 'rgb(17 24 39)';
    msg.style.fontSize = '15px';
    msg.textContent = message;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.justifyContent = 'flex-end';
    controls.style.gap = '8px';

    const cancel = document.createElement('button');
    cancel.textContent = cancelText;
    cancel.style.padding = '8px 12px';
    cancel.style.borderRadius = '8px';
    cancel.style.border = '1px solid #e5e7eb';
    cancel.style.background = '#fff';
    cancel.style.cursor = 'pointer';

    const confirm = document.createElement('button');
    confirm.textContent = confirmText;
    confirm.style.padding = '8px 12px';
    confirm.style.borderRadius = '8px';
    confirm.style.border = 'none';
    confirm.style.background = '#0f172a';
    confirm.style.color = '#fff';
    confirm.style.cursor = 'pointer';

    controls.appendChild(cancel);
    controls.appendChild(confirm);
    card.appendChild(msg);
    card.appendChild(controls);

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(3,7,18,0.36)';
    overlay.style.zIndex = '9998';

    const wrapper = document.createElement('div');
    wrapper.style.position = 'absolute';
    wrapper.style.inset = '0';
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.justifyContent = 'center';
    wrapper.style.zIndex = '9999';
    wrapper.appendChild(overlay);
    wrapper.appendChild(card);

    container.appendChild(wrapper);

    function cleanup(result) {
      if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      resolve(result);
    }

    cancel.addEventListener('click', () => cleanup(false));
    confirm.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', () => cleanup(false));
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', esc);
        cleanup(false);
      }
    });
  });
}
