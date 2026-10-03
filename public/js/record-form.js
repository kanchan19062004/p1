(() => {
  const form = document.getElementById('record-form');
  const alertBox = document.getElementById('alert');
  const rxList = document.getElementById('rx-list');
  const rxEmpty = document.getElementById('rx-empty');
  const rxTemplate = document.getElementById('rx-template');
  const saveBtn = document.getElementById('save-btn');
  const recordId = MV.param('id');

  const FIELDS = [
    'patient_email', 'patient_name', 'patient_age', 'patient_gender', 'patient_phone',
    'visit_date', 'chief_complaint', 'symptoms', 'diagnosis',
    'bp', 'pulse', 'temperature', 'weight_kg', 'notes', 'next_visit_date',
  ];

  function updateRxEmpty() {
    rxEmpty.hidden = rxList.children.length > 0;
  }

  function addRx(values = {}) {
    const row = rxTemplate.content.firstElementChild.cloneNode(true);
    row.querySelectorAll('[data-key]').forEach((input) => {
      const value = values[input.dataset.key];
      input.value = value === null || value === undefined ? '' : value;
    });
    row.querySelector('[data-remove]').addEventListener('click', () => {
      row.remove();
      updateRxEmpty();
    });
    rxList.append(row);
    updateRxEmpty();
    return row;
  }

  document.getElementById('add-rx').addEventListener('click', () => {
    addRx().querySelector('input').focus();
  });

  function collect() {
    const body = {};
    for (const name of FIELDS) body[name] = form.elements[name].value.trim();
    body.prescriptions = [...rxList.children]
      .map((row) => {
        const rx = {};
        row.querySelectorAll('[data-key]').forEach((input) => { rx[input.dataset.key] = input.value.trim(); });
        return rx;
      })
      .filter((rx) => Object.values(rx).some(Boolean));
    return body;
  }

  function validate(body) {
    if (!body.patient_email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.patient_email)) return 'Enter a valid patient email';
    if (!body.patient_name) return 'Patient name is required';
    if (!body.visit_date) return 'Visit date is required';
    if (!body.diagnosis) return 'Diagnosis is required';
    const missing = body.prescriptions.findIndex((rx) => !rx.medicine_name);
    if (missing >= 0) return `Enter the medicine name in prescription row ${missing + 1}, or remove that row`;
    return null;
  }

  function fill(record) {
    for (const name of FIELDS) {
      const value = record[name];
      form.elements[name].value = value === null || value === undefined ? '' : value;
    }
    (record.prescriptions || []).forEach((rx) => addRx(rx));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = collect();
    const problem = validate(body);
    if (problem) {
      MV.showAlert(alertBox, problem);
      return;
    }

    saveBtn.disabled = true;
    MV.showAlert(alertBox, '');
    try {
      const { id } = recordId
        ? await MV.api(`/api/records/${encodeURIComponent(recordId)}`, { method: 'PUT', body })
        : await MV.api('/api/records', { method: 'POST', body });
      MV.flash(recordId ? 'Changes saved successfully.' : 'New record created successfully.');
      window.location.href = `/record.html?id=${id}`;
    } catch (err) {
      MV.showAlert(alertBox, err.message);
      saveBtn.disabled = false;
    }
  });

  async function init() {
    await MV.initPage();

    if (!recordId) {
      const now = new Date();
      form.elements.visit_date.value = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      return;
    }

    document.title = 'Edit Record | Medi-Vault';
    document.getElementById('form-title').textContent = 'Edit Record';
    document.getElementById('form-subtitle').textContent = 'The previous version is kept in the record history when you save.';
    saveBtn.textContent = 'Save changes';
    const back = `/record.html?id=${encodeURIComponent(recordId)}`;
    document.getElementById('cancel-top').href = back;
    document.getElementById('cancel-top').textContent = 'Back to record';
    document.getElementById('cancel-bottom').href = back;

    const { record, canEdit } = await MV.api(`/api/records/${encodeURIComponent(recordId)}`);
    if (!canEdit) throw new Error('You can only edit records you created.');
    fill(record);
  }

  init().catch((err) => {
    MV.showAlert(alertBox, err.message);
    if (recordId) saveBtn.disabled = true;
  });
})();
