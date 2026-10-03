const express = require('express');
const config = require('../config');
const v = require('../validate');
const { anonClient, userClient } = require('../supabase');
const { HttpError } = require('../errors');
const {
  DASHBOARDS,
  requireRole,
  setSessionCookies,
  clearSessionCookies,
  ACCESS_COOKIE,
} = require('../middleware/auth');

const router = express.Router();

const GENDERS = ['male', 'female', 'other'];

async function signUp(res, emailAddress, pass, metadata) {
  const { error } = await anonClient().auth.signUp({
    email: emailAddress,
    password: pass,
    options: {
      data: metadata,
      emailRedirectTo: `${config.appUrl}/auth.html?as=${metadata.role}&confirmed=1`,
    },
  });

  if (error) {
    if (error.code === 'user_already_exists') throw new HttpError(409, 'An account with this email already exists');
    if (error.code === 'weak_password') throw new HttpError(400, error.message);
    if (error.code === 'over_email_send_rate_limit') {
      throw new HttpError(429, 'The confirmation email limit has been reached. Please try signing up again in about an hour.');
    }
    if (error.status === 429) throw new HttpError(429, 'Too many sign-up attempts. Please wait a few minutes.');
    if (error.status >= 500) {
      console.error('Supabase sign-up error:', error);
      throw new HttpError(500, 'Could not create the account. Please try again.');
    }
    throw new HttpError(400, error.message);
  }

  res.status(201).json({
    message: 'Account created. Check your email and click the confirmation link, then log in.',
  });
}

router.post('/signup/doctor', async (req, res) => {
  const body = req.body || {};
  const emailAddress = v.email(body.email);
  const pass = v.password(body.password);
  const hospitalId = v.id(body.hospital_id, 'hospital');

  const { data: hospital, error } = await anonClient()
    .from('hospitals')
    .select('id')
    .eq('id', hospitalId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new HttpError(500, 'Could not check the hospital. Please try again.');
  if (!hospital) throw new HttpError(400, 'Please choose an active hospital');

  await signUp(res, emailAddress, pass, {
    role: 'doctor',
    full_name: v.requiredStr(body.full_name, 'Full name', 120),
    phone: v.str(body.phone, 20),
    hospital_id: String(hospitalId),
    specialization: v.str(body.specialization, 120),
    license_no: v.str(body.license_no, 60),
  });
});

router.post('/signup/patient', async (req, res) => {
  const body = req.body || {};
  const emailAddress = v.email(body.email);
  const pass = v.password(body.password);

  await signUp(res, emailAddress, pass, {
    role: 'patient',
    full_name: v.requiredStr(body.full_name, 'Full name', 120),
    phone: v.str(body.phone, 20),
    dob: v.date(body.dob, 'Date of birth'),
    gender: v.oneOf(body.gender, GENDERS, 'Gender'),
  });
});

router.post('/login', async (req, res) => {
  const body = req.body || {};
  const emailAddress = v.email(body.email);
  const pass = typeof body.password === 'string' ? body.password : '';
  const expectedRole = v.oneOf(body.as, ['doctor', 'patient', 'admin'], 'Login type');

  const { data, error } = await anonClient().auth.signInWithPassword({ email: emailAddress, password: pass });
  if (error) {
    if (error.code === 'email_not_confirmed') {
      throw new HttpError(403, 'Please confirm your email first. Check your inbox for the confirmation link.');
    }
    if (error.status === 429) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
    throw new HttpError(401, 'Incorrect email or password');
  }

  const { data: profile } = await userClient(data.session.access_token)
    .from('profiles')
    .select('full_name, role, status')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.status !== 'active') {
    throw new HttpError(403, 'This account is not active. Please contact the administrator.');
  }
  if (expectedRole && profile.role !== expectedRole && profile.role !== 'admin') {
    throw new HttpError(403, `This account is registered as a ${profile.role}. Please use the ${profile.role} login.`);
  }

  setSessionCookies(res, data.session);
  res.json({ redirect: DASHBOARDS[profile.role], name: profile.full_name });
});

router.post('/logout', async (req, res) => {
  const token = req.cookies[ACCESS_COOKIE];
  if (token) {
    await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  clearSessionCookies(res);
  res.json({ redirect: '/' });
});

router.get('/me', requireRole(), (req, res) => {
  const { profile, doctor } = req.auth;
  res.json({
    profile,
    doctor: doctor && {
      id: doctor.id,
      specialization: doctor.specialization,
      license_no: doctor.license_no,
      hospital: doctor.hospital,
    },
    dashboard: DASHBOARDS[profile.role],
  });
});

module.exports = router;
