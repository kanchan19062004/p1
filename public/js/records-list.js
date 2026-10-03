// Records table with filters, shared by the doctor, patient and admin dashboards.
(() => {
  const { el, api, formatDate, show, capitalize } = MV;

  const COLUMNS = {
    doctor: [
      ['Visit date', (r) => formatDate(r.visit_date)],
      ['Patient', (r) => r.patient_name],
      ['Email', (r) => r.patient_email],
      ['Age / Gender', (r) => [show(r.patient_age), r.patient_gender ? capitalize(r.patient_gender) : null].filter(Boolean).join(' / ')],
      ['Diagnosis', (r) => r.diagnosis],
      ['Next visit', (r) => formatDate(r.next_visit_date)],
    ],
    patient: [
      ['Visit date', (r) => formatDate(r.visit_date)],
      ['Doctor', (r) => r.doctor_name],
      ['Hospital', (r) => r.hospital_name],
      ['Diagnosis', (r) => r.diagnosis],
      ['Next visit', (r) => formatDate(r.next_visit_date)],
    ],
    admin: [
      ['Visit date', (r) => formatDate(r.visit_date)],
      ['Patient', (r) => r.patient_name],
      ['Email', (r) => r.patient_email],
      ['Doctor', (r) => r.doctor_name],
      ['Hospital', (r) => r.hospital_name],
      ['Diagnosis', (r) => r.diagnosis],
    ],
  };

  const EMPTY = {
    doctor: ['No records yet', 'Click "+ Add New Record" to create your first patient record.'],
    patient: ['No records yet', 'When a doctor adds a record using your email, it will appear here.'],
    admin: ['No records yet', 'Records created by doctors will appear here.'],
  };

  const form = document.getElementById('filters');
  const tableWrap = document.getElementById('records');
  const pager = document.getElementById('pagination');
  const alertBox = document.getElementById('alert');
  let role = null;
  let page = 1;
  let hasFilters = false;

  function currentFilters() {
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (value) params.set(key, value);
    }
    hasFilters = [...params.keys()].length > 0;
    params.set('page', page);
    return params;
  }

  function renderTable(records) {
    const columns = COLUMNS[role];
    if (!records.length) {
      const [title, text] = hasFilters ? ['No matching records', 'Try changing or clearing the filters.'] : EMPTY[role];
      tableWrap.replaceChildren(el('div', { class: 'empty-state' }, [el('strong', { text: title }), text]));
      return;
    }

    const rows = records.map((r) => {
      const open = () => { window.location.href = `/record.html?id=${r.id}`; };
      return el('tr', {
        class: 'clickable',
        tabindex: '0',
        title: 'Open full record',
        onclick: open,
        onkeydown: (e) => { if (e.key === 'Enter') open(); },
      }, columns.map(([, value]) => el('td', { text: show(value(r)) })));
    });

    tableWrap.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, columns.map(([label]) => el('th', { text: label })))),
      el('tbody', {}, rows),
    ])));
  }

  function renderPager(total, pageSize) {
    if (!total) {
      pager.replaceChildren();
      return;
    }
    const first = (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total);
    const lastPage = Math.ceil(total / pageSize);
    pager.replaceChildren(
      el('span', { text: `Showing ${first}–${last} of ${total}` }),
      el('div', { class: 'pages' }, [
        el('button', { class: 'btn btn-secondary btn-small', type: 'button', disabled: page <= 1, text: 'Previous', onclick: () => { page -= 1; load(); } }),
        el('button', { class: 'btn btn-secondary btn-small', type: 'button', disabled: page >= lastPage, text: 'Next', onclick: () => { page += 1; load(); } }),
      ]),
    );
  }

  async function load() {
    MV.showAlert(alertBox, '');
    tableWrap.replaceChildren(el('div', { class: 'empty-state', text: 'Loading records…' }));
    try {
      const data = await api(`/api/records?${currentFilters()}`);
      renderTable(data.records);
      renderPager(data.total, data.pageSize);
    } catch (err) {
      tableWrap.replaceChildren();
      pager.replaceChildren();
      MV.showAlert(alertBox, err.message);
    }
  }

  async function loadAdminFilterOptions() {
    const hospitalSelect = form.querySelector('[name="hospital_id"]');
    const doctorSelect = form.querySelector('[name="doctor_id"]');
    if (!hospitalSelect || !doctorSelect) return;

    const [{ hospitals }, { doctors }] = await Promise.all([api('/api/admin/hospitals'), api('/api/admin/doctors')]);
    hospitalSelect.append(...hospitals.map((h) => el('option', { value: h.id, text: h.name })));

    const fillDoctors = () => {
      const hid = hospitalSelect.value;
      doctorSelect.replaceChildren(
        el('option', { value: '', text: 'All doctors' }),
        ...doctors
          .filter((d) => !hid || String(d.hospital_id) === hid)
          .map((d) => el('option', { value: d.id, text: d.full_name || d.email })),
      );
    };
    hospitalSelect.addEventListener('change', fillDoctors);
    fillDoctors();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 1;
    load();
  });

  form.addEventListener('reset', () => {
    setTimeout(() => {
      form.querySelector('[name="hospital_id"]')?.dispatchEvent(new Event('change'));
      page = 1;
      load();
    });
  });

  MV.initPage()
    .then(async (me) => {
      role = me.profile.role;
      const hospitalLabel = document.getElementById('hospital-label');
      if (hospitalLabel && me.doctor && me.doctor.hospital) {
        hospitalLabel.textContent = `${me.doctor.hospital.name} · ${me.doctor.hospital.address}`;
      }
      if (role === 'admin') await loadAdminFilterOptions().catch((err) => MV.showAlert(alertBox, err.message));
      load();
    })
    .catch((err) => MV.showAlert(alertBox, err.message));
})();
