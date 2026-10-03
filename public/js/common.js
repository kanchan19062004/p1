// Shared helpers for all Medi-Vault pages.

const MV = (() => {
  async function api(path, { method = 'GET', body } = {}) {
    const options = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(path, options);
    } catch {
      throw new Error('Could not reach the server. Check your connection.');
    }

    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.location.href = '/';
      throw new Error('Please log in');
    }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // Builds DOM nodes. Text is always set with textContent, never as HTML.
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of [].concat(children)) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function formatDate(value) {
    if (!value) return '—';
    const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
    if (!y) return '—';
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function show(text) {
    return text === null || text === undefined || text === '' ? '—' : String(text);
  }

  function capitalize(text) {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
  }

  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function showAlert(container, message, type = 'error') {
    container.replaceChildren();
    if (!message) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.className = `alert alert-${type}`;
    container.textContent = message;
    container.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function toast(message, type = 'success', timeout = 4000) {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = el('div', { id: 'toast-region', class: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(region);
    }

    const icons = { success: '✓', error: '!', info: 'i' };
    const close = el('button', { class: 'toast-close', type: 'button', 'aria-label': 'Dismiss', text: '×' });
    const node = el('div', { class: `toast toast-${type}` }, [
      el('span', { class: 'toast-icon', 'aria-hidden': 'true', text: icons[type] || icons.info }),
      el('span', { class: 'toast-text', text: message }),
      close,
    ]);

    const remove = () => {
      if (node.classList.contains('leaving')) return;
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 200);
    };
    close.addEventListener('click', remove);
    region.append(node);
    setTimeout(remove, timeout);
  }

  // Shows a toast on the next page, for messages that come before a redirect.
  function flash(message, type = 'success') {
    try {
      sessionStorage.setItem('mv_flash', JSON.stringify({ message, type }));
    } catch {
      // Storage unavailable: the message is skipped.
    }
  }

  function showFlash() {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem('mv_flash'));
      sessionStorage.removeItem('mv_flash');
    } catch {
      return;
    }
    if (saved && saved.message) toast(saved.message, saved.type);
  }

  function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      const cancel = el('button', { class: 'btn btn-secondary', type: 'button', text: cancelText });
      const ok = el('button', { class: `btn ${danger ? 'btn-danger-solid' : ''}`, type: 'button', text: confirmText });
      const dialog = el('dialog', { class: 'modal', 'aria-labelledby': 'modal-title' }, [
        el('h2', { id: 'modal-title', text: title }),
        message ? el('p', { text: message }) : null,
        el('div', { class: 'modal-actions' }, [cancel, ok]),
      ]);

      cancel.addEventListener('click', () => dialog.close('cancel'));
      ok.addEventListener('click', () => dialog.close('ok'));
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close('cancel'); });
      dialog.addEventListener('close', () => {
        resolve(dialog.returnValue === 'ok');
        dialog.remove();
      });

      document.body.append(dialog);
      dialog.showModal();
      cancel.focus();
    });
  }

  async function logout() {
    const sure = await confirmDialog({
      title: 'Log out?',
      message: 'Are you sure you want to log out of Medi-Vault?',
      confirmText: 'Log out',
      danger: true,
    });
    if (!sure) return;

    try {
      await api('/api/auth/logout', { method: 'POST', body: {} });
      flash('You have been logged out.', 'info');
    } finally {
      window.location.href = '/';
    }
  }

  // Static SVG markup only; never mix user data into these strings.
  const ICONS = {
    logo: '<svg viewBox="0 0 32 32"><path class="logo-shield" d="M16 2.5 4.5 6.8v8.4c0 7.3 4.9 12.9 11.5 14.6 6.6-1.7 11.5-7.3 11.5-14.6V6.8z"/><path class="logo-pulse" d="M8.5 16.5h4l2-4.5 3 8 2-3.5h4"/></svg>',
    records: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
    add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M12 9v6M9 12h6"/></svg>',
    messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  };

  function icon(name, className) {
    const span = el('span', { class: className || null, 'aria-hidden': 'true' });
    span.innerHTML = ICONS[name];
    return className ? span : span.firstElementChild;
  }

  const NAV = {
    doctor: [['My Records', '/doctor/', 'records'], ['Add New Record', '/doctor/record-form.html', 'add']],
    patient: [['My Records', '/patient/', 'records']],
    admin: [
      ['All Records', '/admin/', 'records'],
      ['Hospitals', '/admin/hospitals.html', 'hospital'],
      ['Messages', '/admin/messages.html', 'messages'],
    ],
  };

  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  // Loads the logged-in user and renders the top bar into #topbar.
  async function initPage() {
    const me = await api('/api/auth/me');
    const bar = document.getElementById('topbar');
    if (bar) {
      const links = (NAV[me.profile.role] || []).map(([label, href, iconName]) => {
        const active = window.location.pathname === href;
        return el('a', { href, class: active ? 'active' : null, 'aria-current': active ? 'page' : null }, [
          icon(iconName),
          label,
        ]);
      });

      const hospital = me.doctor && me.doctor.hospital ? me.doctor.hospital.name : null;
      const chip = el('div', { class: 'user-chip' }, [
        el('span', { class: 'avatar', 'aria-hidden': 'true', text: initials(me.profile.full_name) }),
        el('div', {}, [
          el('div', { class: 'user-name', text: me.profile.full_name }),
          el('div', { class: 'user-meta' }, [
            el('span', { class: 'role-badge', text: me.profile.role }),
            hospital ? el('span', { title: 'Your hospital (cannot be changed)', text: hospital }) : null,
          ]),
        ]),
      ]);

      const logoutBtn = el('button', { class: 'btn-logout', type: 'button', onclick: logout }, [icon('logout'), 'Log out']);

      bar.replaceChildren(
        el('a', { class: 'brand', href: me.dashboard }, [icon('logo', 'brand-mark'), 'Medi-Vault']),
        el('nav', { class: 'app-tabs', 'aria-label': 'Main' }, links),
        el('div', { class: 'topbar-right' }, [chip, logoutBtn]),
      );
    }
    return me;
  }

  showFlash();

  return {
    api, el, formatDate, formatDateTime, show, capitalize, param, showAlert,
    toast, flash, confirmDialog, logout, initPage,
  };
})();
