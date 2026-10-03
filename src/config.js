require('dotenv').config({ quiet: true });

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;

module.exports = {
  supabaseUrl: process.env.SUPABASE_URL.replace(/\/+$/, ''),
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  appUrl: (process.env.APP_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  port,
  isProd: process.env.NODE_ENV === 'production',
};
