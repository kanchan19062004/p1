(() => {
  const ROLES = {
    doctor: { title: 'Doctor Login', subtitle: 'Record and manage your patients\' visits.', signup: true },
    patient: { title: 'Patient Login', subtitle: 'View the medical records your doctors have created for you.', signup: true },
    admin: { title: 'Admin Login', subtitle: 'Administrator access.', signup: false },
  };

  const as = ROLES[MV.param('as')] ? MV.param('as') : 'patient';
  const role = ROLES[as];

  const alertBox = document.getElementById('alert');
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const tabs = document.getElementById('tabs');
  const hospitalSelect = document.getElementById('su-hospital');
  let hospitalsLoaded = false;

  document.title = `${role.title} | Medi-Vault`;
  document.getElementById('auth-title').textContent = role.title;
  document.getElementById('auth-subtitle').textContent = role.subtitle;
  document.getElementById('patient-note').hidden = as !== 'patient';

  const other = as === 'doctor' ? 'patient' : 'doctor';
  document.getElementById('role-switch').replaceChildren(
    `${as === 'doctor' ? 'Not a doctor?' : 'Are you a doctor?'} `,
    MV.el('a', { href: `/auth.html?as=${other}`, text: `Login as ${MV.capitalize(other)}` }),
  );

  if (!role.signup) tabs.hidden = true;

  signupForm.querySelectorAll('[data-for]').forEach((node) => {
    const active = node.dataset.for === as;
    node.hidden = !active;
    node.querySelectorAll('input, select').forEach((input) => { input.disabled = !active; });
  });

  function selectTab(name) {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    loginForm.hidden = name !== 'login';
    signupForm.hidden = name !== 'signup';
    MV.showAlert(alertBox, '');
    if (name === 'signup' && as === 'doctor' && !hospitalsLoaded) loadHospitals();
  }

  tabs.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-tab]');
    if (button) selectTab(button.dataset.tab);
  });

  async function loadHospitals() {
    try {
      const { hospitals } = await MV.api('/api/hospitals/active');
      hospitalSelect.replaceChildren(
        MV.el('option', { value: '', text: hospitals.length ? 'Select your hospital' : 'No hospitals available yet' }),
        ...hospitals.map((h) => MV.el('option', { value: h.id, text: `${h.name} — ${h.address}` })),
      );
      hospitalsLoaded = true;
    } catch (err) {
      hospitalSelect.replaceChildren(MV.el('option', { value: '', text: 'Could not load hospitals' }));
      MV.showAlert(alertBox, err.message);
    }
  }

  async function submitWith(form, handler) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    MV.showAlert(alertBox, '');
    try {
      await handler(Object.fromEntries(new FormData(form)));
    } catch (err) {
      MV.showAlert(alertBox, err.message);
    } finally {
      button.disabled = false;
    }
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWith(loginForm, async (values) => {
      if (!values.email || !values.password) throw new Error('Enter your email and password');
      const { redirect, name } = await MV.api('/api/auth/login', { method: 'POST', body: { ...values, as } });
      MV.flash(name ? `Welcome back, ${name}!` : 'Logged in successfully.');
      window.location.href = redirect;
    });
  });

  signupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitWith(signupForm, async (values) => {
      if (!values.full_name || !values.email || !values.password) throw new Error('Please fill in all required fields');
      if (values.password.length < 8) throw new Error('Password must be at least 8 characters');
      if (values.password !== values.confirm) throw new Error('Passwords do not match');
      if (as === 'doctor' && !values.hospital_id) throw new Error('Please choose your hospital');

      const { confirm, ...body } = values;
      const { message } = await MV.api(`/api/auth/signup/${as}`, { method: 'POST', body });
      signupForm.reset();
      selectTab('login');
      MV.showAlert(alertBox, message, 'success');
      MV.toast('Account created successfully!', 'success', 6000);
    });
  });

  if (MV.param('confirmed')) {
    MV.toast('Your email is confirmed. You can log in now.', 'success', 6000);
  } else if (MV.param('tab') === 'signup' && role.signup) {
    selectTab('signup');
  }

  // Already logged in? Go straight to the dashboard.
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : null))
    .then((me) => { if (me && me.dashboard) window.location.href = me.dashboard; })
    .catch(() => {});
})();
