(() => {
  const { el, api, show, formatDate } = MV;
  const alertBox = document.getElementById('alert');
  const form = document.getElementById('hospital-form');
  const formTitle = document.getElementById('hospital-form-title');
  const toggleBtn = document.getElementById('toggle-form');
  const tableWrap = document.getElementById('hospitals');
  let editingId = null;

  function openForm(hospital) {
    editingId = hospital ? hospital.id : null;
    form.reset();
    formTitle.textContent = hospital ? `Edit ${hospital.name}` : 'Add hospital';
    if (hospital) {
      for (const name of ['name', 'phone', 'email', 'status', 'address', 'description']) {
        form.elements[name].value = hospital[name] || (name === 'status' ? 'active' : '');
      }
    }
    form.hidden = false;
    toggleBtn.hidden = true;
    form.elements.name.focus();
  }

  function closeForm() {
    form.hidden = true;
    toggleBtn.hidden = false;
    editingId = null;
  }

  toggleBtn.addEventListener('click', () => openForm(null));
  document.getElementById('cancel-form').addEventListener('click', closeForm);

  async function setStatus(hospital, status, button) {
    const deactivating = status === 'inactive';
    const sure = await MV.confirmDialog({
      title: `${deactivating ? 'Deactivate' : 'Activate'} ${hospital.name}?`,
      message: deactivating
        ? 'Its doctors will no longer be able to save records, and it will be hidden from doctor sign-up.'
        : 'It will appear in doctor sign-up again, and its doctors can save records.',
      confirmText: deactivating ? 'Deactivate' : 'Activate',
      danger: deactivating,
    });
    if (!sure) return;

    button.disabled = true;
    try {
      await api(`/api/admin/hospitals/${hospital.id}`, { method: 'PATCH', body: { status } });
      MV.toast(`${hospital.name} is now ${status}.`);
      await load();
    } catch (err) {
      MV.showAlert(alertBox, err.message);
      button.disabled = false;
    }
  }

  function render(hospitals) {
    if (!hospitals.length) {
      tableWrap.replaceChildren(el('div', { class: 'empty-state' }, [
        el('strong', { text: 'No hospitals yet' }),
        'Click "+ Add Hospital" to add the first one.',
      ]));
      return;
    }

    const rows = hospitals.map((h) => {
      const next = h.status === 'active' ? 'inactive' : 'active';
      const statusBtn = el('button', {
        class: `btn btn-small ${next === 'inactive' ? 'btn-danger' : 'btn-secondary'}`,
        type: 'button',
        text: next === 'inactive' ? 'Deactivate' : 'Activate',
      });
      statusBtn.addEventListener('click', () => setStatus(h, next, statusBtn));

      return el('tr', {}, [
        el('td', {}, [el('strong', { text: h.name }), h.description ? el('div', { class: 'meta', text: h.description }) : null]),
        el('td', { text: show(h.address) }),
        el('td', {}, [show(h.phone), h.email ? el('div', { class: 'meta', text: h.email }) : null]),
        el('td', {}, el('span', { class: `status status-${h.status}`, text: h.status })),
        el('td', { text: formatDate(h.created_at) }),
        el('td', {}, el('div', { class: 'filter-actions' }, [
          el('button', { class: 'btn btn-secondary btn-small', type: 'button', text: 'Edit', onclick: () => openForm(h) }),
          statusBtn,
        ])),
      ]);
    });

    tableWrap.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, ['Hospital', 'Address', 'Contact', 'Status', 'Added', ''].map((t) => el('th', { text: t })))),
      el('tbody', {}, rows),
    ])));
  }

  async function load() {
    const { hospitals } = await api('/api/admin/hospitals');
    render(hospitals);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    if (!body.name.trim() || !body.address.trim()) {
      MV.showAlert(alertBox, 'Hospital name and address are required');
      return;
    }

    const saveBtn = document.getElementById('save-hospital');
    saveBtn.disabled = true;
    try {
      if (editingId) {
        await api(`/api/admin/hospitals/${editingId}`, { method: 'PATCH', body });
      } else {
        await api('/api/admin/hospitals', { method: 'POST', body });
      }
      MV.toast(editingId ? `${body.name.trim()} updated successfully.` : `${body.name.trim()} added successfully.`);
      MV.showAlert(alertBox, '');
      closeForm();
      await load();
    } catch (err) {
      MV.showAlert(alertBox, err.message);
    } finally {
      saveBtn.disabled = false;
    }
  });

  MV.initPage()
    .then(load)
    .catch((err) => MV.showAlert(alertBox, err.message));
})();
