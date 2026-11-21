/* UI helpers. Every piece of skill content is inserted with textContent,
   never as HTML: imported skills are untrusted data. */

(function () {
  'use strict';

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'value') node.value = v;
        else if (k === 'checked') node.checked = !!v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k === 'style') node.style.cssText = v; // CSSOM is allowed by the CSP, style attributes are not
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  const ICONS = {
    dashboard: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z',
    library: 'M5 4h4v16H5zM10 4h4v16h-4zM15.5 4.5l3.6 1 -3.9 14.5 -3.6-1z',
    packs: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    agents: 'M8 8h8v8H8zM12 3v5M12 16v5M3 12h5M16 12h5',
    sources: 'M3 7h7l2 2h9v10H3zM3 7V5h6',
    history: 'M12 7v5l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4v4h4',
    security: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
    settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14',
    import: 'M12 3v12M7 10l5 5 5-5M4 19h16',
    export: 'M12 21V9M7 14l5-5 5 5M4 5h16',
    sync: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
    scan: 'M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3M7 12h10',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
    folder: 'M3 7h7l2 2h9v10H3z',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    close: 'M6 6l12 12M18 6L6 18',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    check: 'M5 12l5 5 9-10',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    backup: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01'
  };

  function icon(name, cls = 'icon') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', ICONS[name] || ICONS.plus);
    svg.appendChild(p);
    return svg;
  }

  function button(label, onclick, { kind = '', iconName = null, title = null, disabled = false, size = '' } = {}) {
    return el('button', { class: `btn ${kind} ${size}`.trim(), type: 'button', onclick, title, disabled }, iconName ? icon(iconName) : null, label);
  }

  function toast(message, kind = '') {
    const root = document.getElementById('toasts');
    const t = el('div', { class: `toast ${kind}`, text: message });
    root.appendChild(t);
    setTimeout(() => t.remove(), kind === 'bad' ? 8000 : 4200);
  }

  let modalStack = [];
  function modal({ title, body, footer, wide = false, onClose = null }) {
    const root = document.getElementById('modal-root');
    const close = () => {
      backdrop.remove();
      modalStack = modalStack.filter((m) => m !== backdrop);
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === backdrop) close();
    };
    const box = el('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'modal-head' }, el('h2', { text: title }), el('button', { class: 'btn ghost right', type: 'button', onclick: close, 'aria-label': window.t('close') }, icon('close'))),
      el('div', { class: 'modal-body' }, body),
      footer ? el('div', { class: 'modal-foot' }, typeof footer === 'function' ? footer(close) : footer) : null
    );
    const backdrop = el('div', { class: 'modal-backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, box);
    root.appendChild(backdrop);
    modalStack.push(backdrop);
    document.addEventListener('keydown', onKey);
    const first = box.querySelector('input, textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
    return { close, box };
  }

  async function confirmDialog(message, detail = '', { danger = false, ok = null } = {}) {
    return window.ush.dialog('confirm', { message, detail, danger, ok: ok || window.t('confirm'), cancel: window.t('cancel') });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(window.currentLang === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function fmtSize(n) {
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / 1024 / 1024).toFixed(1)} Mo`;
  }

  function field(label, input, hint = null) {
    return el('label', { class: 'field' }, label, input, hint ? el('span', { class: 'small muted', text: hint }) : null);
  }

  function select(options, value, onchange, attrs = {}) {
    const s = el('select', { ...attrs, onchange: onchange ? (e) => onchange(e.target.value) : null });
    for (const o of options) {
      const opt = el('option', { value: o.value, text: o.label });
      if (String(o.value) === String(value ?? '')) opt.selected = true;
      s.appendChild(opt);
    }
    return s;
  }

  function renderDiff(diff) {
    const box = el('div', { class: 'diff' });
    for (const op of diff.ops || []) box.appendChild(el('div', { class: op.op, text: op.text }));
    return box;
  }

  async function busy(btn, fn) {
    const prev = btn ? btn.disabled : false;
    if (btn) {
      btn.disabled = true;
      btn.prepend(el('span', { class: 'spinner', style: 'margin-right:4px' }));
    }
    try {
      return await fn();
    } finally {
      if (btn) {
        btn.disabled = prev;
        const sp = btn.querySelector('.spinner');
        if (sp) sp.remove();
      }
    }
  }

  window.UI = { el, append, icon, button, toast, modal, confirmDialog, fmtDate, fmtSize, field, select, renderDiff, busy };
})();
