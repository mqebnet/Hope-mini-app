function isValidGmail(email) {
  return /^[A-Z0-9._%+-]+@gmail\.com$/i.test(String(email || '').trim());
}

function getField(form, name) {
  return form.querySelector(`[name="${name}"]`);
}

function setResult(form, message, type) {
  const box = form.querySelector('.fallback-result');
  if (!box) return;
  box.textContent = message || '';
  box.classList.remove('error', 'success');
  if (type) box.classList.add(type);
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let data = {};
  try {
    data = await res.json();
  } catch (_) {
    data = {};
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function handleRegisterSubmit(form) {
  const email = getField(form, 'email')?.value || '';
  const password = getField(form, 'password')?.value || '';
  const confirmPassword = getField(form, 'confirmPassword')?.value || '';

  if (!isValidGmail(email)) {
    setResult(form, 'Use a valid gmail.com address.', 'error');
    return;
  }
  if (password.length < 8) {
    setResult(form, 'Password must be at least 8 characters.', 'error');
    return;
  }
  if (password !== confirmPassword) {
    setResult(form, 'Password confirmation does not match.', 'error');
    return;
  }

  const submit = form.querySelector('.fallback-submit');
  if (submit) submit.disabled = true;
  setResult(form, 'Creating account...', '');

  try {
    const payload = { email, password };
    await postJson('/api/web-auth/register', payload);
    setResult(form, 'Account created. You can now sign in with Gmail.', 'success');
    form.reset();
  } catch (err) {
    setResult(form, err.message || 'Registration failed.', 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function handleLoginSubmit(form) {
  const email = getField(form, 'email')?.value || '';
  const password = getField(form, 'password')?.value || '';

  if (!email.trim() || !password) {
    setResult(form, 'Email and password are required.', 'error');
    return;
  }
  if (!isValidGmail(email)) {
    setResult(form, 'Email login only accepts gmail.com addresses.', 'error');
    return;
  }

  const submit = form.querySelector('.fallback-submit');
  if (submit) submit.disabled = true;
  setResult(form, 'Signing in...', '');

  try {
    const data = await postJson('/api/web-auth/login', {
      email: email.trim(),
      password
    });
    setResult(form, `Signed in as ${data.account?.email || 'account'}.`, 'success');
  } catch (err) {
    setResult(form, err.message || 'Login failed.', 'error');
  } finally {
    if (submit) submit.disabled = false;
  }
}

function initFallbackAuth() {
  const registerForm = document.getElementById('fallback-register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleRegisterSubmit(registerForm);
    });
  }

  const loginForm = document.getElementById('fallback-login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleLoginSubmit(loginForm);
    });
  }
}

document.addEventListener('DOMContentLoaded', initFallbackAuth);
