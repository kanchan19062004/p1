(() => {
  const form = document.getElementById('contact-form');
  const alertBox = document.getElementById('alert');
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));

    if (!body.name.trim() || !body.email.trim() || !body.message.trim()) {
      MV.showAlert(alertBox, 'Please fill in your name, email and message.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim())) {
      MV.showAlert(alertBox, 'Please enter a valid email address.');
      return;
    }

    button.disabled = true;
    MV.showAlert(alertBox, '');
    try {
      await MV.api('/api/contact', { method: 'POST', body });
      form.reset();
      MV.toast('Thank you! Your message has been sent.');
    } catch (err) {
      MV.showAlert(alertBox, err.message);
    } finally {
      button.disabled = false;
    }
  });
})();
