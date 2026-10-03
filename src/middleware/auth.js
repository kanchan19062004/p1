const config = require('../config');
const { anonClient, userClient } = require('../supabase');
const { HttpError } = require('../errors');

const ACCESS_COOKIE = 'mv_access';
const REFRESH_COOKIE = 'mv_refresh';
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DASHBOARDS = {
  doctor: '/doctor/',
  patient: '/patient/',
  admin: '/admin/',
};

function cookieOptions(maxAge) {
  return { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', maxAge };
}

function setSessionCookies(res, session) {
  res.cookie(ACCESS_COOKIE, session.access_token, cookieOptions(session.expires_in * 1000));
  res.cookie(REFRESH_COOKIE, session.refresh_token, cookieOptions(REFRESH_MAX_AGE_MS));
}

function clearSessionCookies(res) {
  const { maxAge, ...options } = cookieOptions(0);
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

async function resolveUser(req, res) {
  const access = req.cookies[ACCESS_COOKIE];
  const refresh = req.cookies[REFRESH_COOKIE];

  if (access) {
    const { data, error } = await anonClient().auth.getUser(access);
    if (!error && data.user) return { user: data.user, token: access };
  }

  if (refresh) {
    const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refresh });
    if (!error && data.session) {
      setSessionCookies(res, data.session);
      return { user: data.user, token: data.session.access_token };
    }
  }

  return null;
}

// Loads the current user, profile and (for doctors) hospital into req.auth.
// Leaves req.auth undefined when nobody is logged in.
async function loadSession(req, res, next) {
  if (!req.cookies[ACCESS_COOKIE] && !req.cookies[REFRESH_COOKIE]) return next();

  const session = await resolveUser(req, res);
  if (!session) {
    clearSessionCookies(res);
    return next();
  }

  const db = userClient(session.token);
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, full_name, phone, role, status')
    .eq('id', session.user.id)
    .maybeSingle();

  if (!profile || profile.status !== 'active') {
    clearSessionCookies(res);
    return next();
  }

  let doctor = null;
  if (profile.role === 'doctor') {
    const { data } = await db
      .from('doctors')
      .select('id, hospital_id, specialization, license_no, hospital:hospitals(id, name, address, status)')
      .eq('profile_id', profile.id)
      .maybeSingle();
    doctor = data;
  }

  req.auth = { user: session.user, token: session.token, profile, doctor, db };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth) return next(new HttpError(401, 'Please log in'));
    if (roles.length && !roles.includes(req.auth.profile.role)) {
      return next(new HttpError(403, 'You do not have access to this'));
    }
    if (req.auth.profile.role === 'doctor' && !req.auth.doctor) {
      return next(new HttpError(403, 'Your doctor profile is incomplete'));
    }
    next();
  };
}

// Guards HTML pages: redirects to login, or to the user's own dashboard.
function pageGuard(...roles) {
  return (req, res, next) => {
    if (!req.auth) {
      const as = roles.length === 1 ? roles[0] : 'patient';
      return res.redirect(`/auth.html?as=${as}`);
    }
    if (!roles.includes(req.auth.profile.role)) {
      return res.redirect(DASHBOARDS[req.auth.profile.role] || '/');
    }
    next();
  };
}

module.exports = {
  DASHBOARDS,
  loadSession,
  requireRole,
  pageGuard,
  setSessionCookies,
  clearSessionCookies,
  ACCESS_COOKIE,
};
