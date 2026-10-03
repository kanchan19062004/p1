const express = require('express');
const v = require('../validate');
const { HttpError, fromSupabase } = require('../errors');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireRole('admin'));

const HOSPITAL_COLUMNS = 'id, name, description, address, phone, email, status, created_at, updated_at';
const STATUSES = ['active', 'inactive'];

function parseHospital(body, partial) {
  const out = {};
  const has = (key) => !partial || body[key] !== undefined;

  if (has('name')) out.name = v.requiredStr(body.name, 'Hospital name', 150);
  if (has('address')) out.address = v.requiredStr(body.address, 'Address', 500);
  if (has('description')) out.description = v.str(body.description, 1000);
  if (has('phone')) out.phone = v.str(body.phone, 20);
  if (has('email')) out.email = body.email ? v.email(body.email, 'Hospital email') : null;
  if (has('status')) out.status = v.oneOf(body.status, STATUSES, 'Status') || 'active';

  if (partial && !Object.keys(out).length) throw new HttpError(400, 'Nothing to update');
  return out;
}

router.get('/hospitals', async (req, res) => {
  const { data, error } = await req.auth.db.from('hospitals').select(HOSPITAL_COLUMNS).order('name');
  if (error) throw fromSupabase(error);
  res.json({ hospitals: data });
});

router.post('/hospitals', async (req, res) => {
  const { data, error } = await req.auth.db
    .from('hospitals')
    .insert(parseHospital(req.body || {}, false))
    .select(HOSPITAL_COLUMNS)
    .single();
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'A hospital with this name already exists');
    throw fromSupabase(error);
  }
  res.status(201).json({ hospital: data });
});

router.patch('/hospitals/:id', async (req, res) => {
  const { data, error } = await req.auth.db
    .from('hospitals')
    .update(parseHospital(req.body || {}, true))
    .eq('id', v.id(req.params.id, 'hospital'))
    .select(HOSPITAL_COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'A hospital with this name already exists');
    throw fromSupabase(error);
  }
  if (!data) throw new HttpError(404, 'Hospital not found');
  res.json({ hospital: data });
});

router.get('/messages', async (req, res) => {
  const { data, error } = await req.auth.db
    .from('contact_messages')
    .select('id, name, email, sender_type, subject, message, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw fromSupabase(error);
  res.json({ messages: data });
});

router.get('/doctors', async (req, res) => {
  const { data, error } = await req.auth.db
    .from('doctors')
    .select('id, hospital_id, specialization, profile:profiles(full_name, email)')
    .order('id');
  if (error) throw fromSupabase(error);
  res.json({
    doctors: data.map((d) => ({
      id: d.id,
      hospital_id: d.hospital_id,
      specialization: d.specialization,
      full_name: d.profile && d.profile.full_name,
      email: d.profile && d.profile.email,
    })),
  });
});

module.exports = router;
