(() => {
  const { el, api, show, formatDateTime, capitalize } = MV;
  const alertBox = document.getElementById('alert');
  const wrap = document.getElementById('messages');

  function render(messages) {
    if (!messages.length) {
      wrap.replaceChildren(el('div', { class: 'empty-state' }, [
        el('strong', { text: 'No messages yet' }),
        'Messages sent from the Contact page will appear here.',
      ]));
      return;
    }

    wrap.replaceChildren(el('div', { class: 'table-wrap' }, el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, ['Received', 'From', 'Type', 'Subject', 'Message'].map((t) => el('th', { text: t })))),
      el('tbody', {}, messages.map((m) => el('tr', {}, [
        el('td', { text: formatDateTime(m.created_at) }),
        el('td', {}, [
          el('strong', { text: m.name }),
          el('div', {}, el('a', { href: `mailto:${encodeURIComponent(m.email)}`, text: m.email })),
        ]),
        el('td', { text: capitalize(m.sender_type) }),
        el('td', { text: show(m.subject) }),
        el('td', { class: 'detail-item' }, el('div', { class: 'value', text: m.message })),
      ]))),
    ])));
  }

  MV.initPage()
    .then(() => api('/api/admin/messages'))
    .then(({ messages }) => render(messages))
    .catch((err) => MV.showAlert(alertBox, err.message));
})();
