const { HttpError } = require('./errors');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function str(value, max = 500) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function requiredStr(value, label, max = 500) {
  const s = str(value, max);
  if (!s) throw new HttpError(400, `${label} is required`);
  return s;
}

function email(value, label = 'Email') {
  const s = requiredStr(value, label, 254).toLowerCase();
  if (!EMAIL_RE.test(s)) throw new HttpError(400, `${label} is not a valid email address`);
  return s;
}

function date(value, label) {
  const s = str(value, 10);
  if (!s) return null;
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw new HttpError(400, `${label} must be a valid date`);
  return s;
}

function int(value, label, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

function decimal(value, label, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be a number between ${min} and ${max}`);
  }
  return Math.round(n * 10) / 10;
}

function id(value, label = 'ID') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${label}`);
  return n;
}

function oneOf(value, allowed, label) {
  const s = str(value, 50);
  if (s === null) return null;
  if (!allowed.includes(s)) throw new HttpError(400, `${label} is invalid`);
  return s;
}

function password(value) {
  const s = typeof value === 'string' ? value : '';
  if (s.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (s.length > 72) throw new HttpError(400, 'Password must be at most 72 characters');
  return s;
}

// Removes characters with special meaning in PostgREST filter strings.
function searchTerm(value) {
  const s = str(value, 100);
  if (!s) return null;
  const cleaned = s.replace(/[%,()*\\"']/g, ' ').trim();
  return cleaned || null;
}

module.exports = { str, requiredStr, email, date, int, decimal, id, oneOf, password, searchTerm };
