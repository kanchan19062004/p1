const express = require('express');
const { anonClient } = require('../supabase');
const { fromSupabase } = require('../errors');

const router = express.Router();

router.get('/active', async (req, res) => {
  const { data, error } = await anonClient()
    .from('hospitals')
    .select('id, name, address')
    .eq('status', 'active')
    .order('name');
  if (error) throw fromSupabase(error);
  res.json({ hospitals: data });
});

module.exports = router;
