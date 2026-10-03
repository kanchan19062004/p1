const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const config = require('./config');

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  // Node 20 has no built-in WebSocket, which supabase-js requires.
  realtime: { transport: WebSocket },
};

// A fresh client per auth call so sessions never leak between requests.
function anonClient() {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, clientOptions);
}

// Queries run as the logged-in user, so row-level security applies.
function userClient(accessToken) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

module.exports = { anonClient, userClient };
