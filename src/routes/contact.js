const express = require('express');
const v = require('../validate');
const { anonClient } = require('../supabase');
const { fromSupabase } = require('../errors');

const router = express.Router();

const SENDER_TYPES = ['patient', 'doctor', 'hospital', 'other'];

router.post('/', async (req, res) => {
  const body = req.body || {};
  const message = {
    name: v.requiredStr(body.name, 'Name', 120),
    email: v.email(body.email),
    sender_type: v.oneOf(body.sender_type, SENDER_TYPES, 'Sender type') || 'other',
    subject: v.str(body.subject, 200),
    message: v.requiredStr(body.message, 'Message', 4000),
  };

  const { error } = await anonClient().from('contact_messages').insert(message);
  if (error) throw fromSupabase(error);
  res.status(201).json({ ok: true });
});

module.exports = router;
