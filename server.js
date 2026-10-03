const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const config = require('./src/config');
const { HttpError } = require('./src/errors');
const { loadSession, pageGuard } = require('./src/middleware/auth');

const app = express();
const publicDir = path.join(__dirname, 'public');

if (config.isProd) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: '100kb' }));

// Cookie-based auth: only accept JSON bodies on writes, which a cross-site
// HTML form cannot send.
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.is('application/json')) {
    return next(new HttpError(415, 'Requests must be sent as JSON'));
  }
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 30 : 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.isProd ? 5 : 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'You have sent several messages already. Please try again later.' },
});

app.use('/api', loadSession);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/contact', contactLimiter, require('./src/routes/contact'));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/hospitals', require('./src/routes/hospitals'));
app.use('/api/records', require('./src/routes/records'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

app.use('/doctor', loadSession, pageGuard('doctor'));
app.use('/patient', loadSession, pageGuard('patient'));
app.use('/admin', loadSession, pageGuard('admin'));
app.get('/record.html', loadSession, pageGuard('doctor', 'patient', 'admin'));

app.use(express.static(publicDir, { extensions: ['html'] }));

app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`Medi-Vault running at ${config.appUrl}`);
});
