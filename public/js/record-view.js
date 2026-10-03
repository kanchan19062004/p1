(() => {
  const { el, api, show, formatDate, formatDateTime, capitalize } = MV;
  const alertBox = document.getElementById('alert');
  const container = document.getElementById('record');
  const recordId = MV.param('id');

  function item(label, value, wide) {
    return el('div', { class: `detail-item${wide ? ' span-all' : ''}` }, [
      el('div', { class: 'label', text: label }),
      el('div', { class: 'value', text: show(value) }),
    ]);
  }

  function section(title, children) {
    return el('section', { class: 'card' }, [el('h2', { text: title }), ...[].concat(children)]);
  }

  function prescriptionTable(list) {
    if (!list || !list.length) return el('p', { class: 'meta', text: 'No medicines prescribed.' });
    return el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, ['Medicine', 'Dosage', 'Frequency', 'Days', 'Instructions'].map((h) => el('th', { text: h })))),
      el('tbody', {}, list.map((rx) => el('tr', {}, [
        el('td', { text: show(rx.medicine_name) }),
        el('td', { text: show(rx.dosage) }),
        el('td', { text: show(rx.frequency) }),
        el('td', { text: show(rx.duration_days) }),
        el('td', { text: show(rx.instructions) }),
      ]))),
    ]));
  }

  function recordBody(r) {
    const temperature = r.temperature === null ? null : `${r.temperature} °F`;
    const weight = r.weight_kg === null ? null : `${r.weight_kg} kg`;
    const pulse = r.pulse === null ? null : `${r.pulse} bpm`;

    return [
      section('Patient', el('div', { class: 'detail-grid' }, [
        item('Name', r.patient_name),
        item('Email', r.patient_email),
        item('Age', r.patient_age),
        item('Gender', r.patient_gender ? capitalize(r.patient_gender) : null),
        item('Phone', r.patient_phone),
      ])),
      section('Visit and diagnosis', el('div', { class: 'detail-grid' }, [
        item('Visit date', formatDate(r.visit_date)),
        item('Doctor', r.doctor_name),
        item('Hospital', r.hospital_name),
        item('Chief complaint', r.chief_complaint, true),
        item('Symptoms', r.symptoms, true),
        item('Diagnosis', r.diagnosis, true),
      ])),
      section('Vitals', el('div', { class: 'detail-grid' }, [
        item('Blood pressure', r.bp),
        item('Pulse', pulse),
        item('Temperature', temperature),
        item('Weight', weight),
      ])),
      section('Prescription', prescriptionTable(r.prescriptions)),
      section('Notes and follow-up', el('div', { class: 'detail-grid' }, [
        item('Notes / advice', r.notes, true),
        item('Next visit date', formatDate(r.next_visit_date)),
      ])),
    ];
  }

  async function loadHistory(target, button) {
    button.disabled = true;
    try {
      const { history } = await api(`/api/records/${encodeURIComponent(recordId)}/history`);
      target.replaceChildren(...history.map((h) => el('details', { class: 'history-entry' }, [
        el('summary', { text: `Version before the edit on ${formatDateTime(h.changed_at)}` }),
        el('div', { class: 'history-body' }, recordBody(h.old_data)),
      ])));
      button.hidden = true;
    } catch (err) {
      MV.showAlert(alertBox, err.message);
      button.disabled = false;
    }
  }

  function historySection(count) {
    if (!count) return null;
    const list = el('div');
    const button = el('button', {
      class: 'btn btn-secondary btn-small',
      type: 'button',
      text: `Show ${count} earlier version${count === 1 ? '' : 's'}`,
    });
    button.addEventListener('click', () => loadHistory(list, button));
    return section('Edit history', [el('p', { class: 'meta', text: 'Every edit keeps a copy of the previous version.' }), button, list]);
  }

  async function init() {
    const me = await MV.initPage();
    document.getElementById('back-link').href = me.dashboard;

    if (!recordId) throw new Error('No record selected.');
    const { record, canEdit, historyCount } = await api(`/api/records/${encodeURIComponent(recordId)}`);

    document.getElementById('record-title').textContent = `${record.patient_name} · ${formatDate(record.visit_date)}`;
    const updated = record.updated_at && record.updated_at !== record.created_at
      ? ` · Last edited ${formatDateTime(record.updated_at)}`
      : '';
    document.getElementById('record-subtitle').textContent = `Created ${formatDateTime(record.created_at)}${updated}`;

    if (canEdit) {
      const edit = document.getElementById('edit-link');
      edit.href = `/doctor/record-form.html?id=${record.id}`;
      edit.hidden = false;
    }

    container.replaceChildren(...recordBody(record), historySection(historyCount) || '');
  }

  init().catch((err) => MV.showAlert(alertBox, err.message));
})();
