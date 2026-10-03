const express = require('express');
const v = require('../validate');
const { HttpError, fromSupabase } = require('../errors');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const PAGE_SIZE = 20;
const GENDERS = ['male', 'female', 'other'];
const MAX_PRESCRIPTIONS = 30;

const LIST_COLUMNS = [
  'id', 'visit_date', 'patient_name', 'patient_email', 'patient_age', 'patient_gender',
  'diagnosis', 'next_visit_date', 'doctor_id', 'doctor_name', 'hospital_id', 'hospital_name',
  'created_at', 'updated_at',
].join(', ');

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

function parseRecord(body) {
  return {
    patient_email: v.email(body.patient_email, 'Patient email'),
    patient_name: v.requiredStr(body.patient_name, 'Patient name', 120),
    patient_age: v.int(body.patient_age, 'Age', 0, 150),
    patient_gender: v.oneOf(body.patient_gender, GENDERS, 'Gender'),
    patient_phone: v.str(body.patient_phone, 20),
    visit_date: v.date(body.visit_date, 'Visit date') || today(),
    chief_complaint: v.str(body.chief_complaint, 500),
    symptoms: v.str(body.symptoms, 2000),
    diagnosis: v.requiredStr(body.diagnosis, 'Diagnosis', 1000),
    bp: v.str(body.bp, 20),
    pulse: v.int(body.pulse, 'Pulse', 0, 300),
    temperature: v.decimal(body.temperature, 'Temperature', 25, 115),
    weight_kg: v.decimal(body.weight_kg, 'Weight', 0, 500),
    notes: v.str(body.notes, 4000),
    next_visit_date: v.date(body.next_visit_date, 'Next visit date'),
  };
}

function parsePrescriptions(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw new HttpError(400, 'Prescriptions must be a list');
  if (list.length > MAX_PRESCRIPTIONS) throw new HttpError(400, `At most ${MAX_PRESCRIPTIONS} medicines per record`);
  return list.map((rx, i) => ({
    medicine_name: v.requiredStr(rx && rx.medicine_name, `Medicine name in row ${i + 1}`, 200),
    dosage: v.str(rx.dosage, 100),
    frequency: v.str(rx.frequency, 100),
    duration_days: v.int(rx.duration_days, `Duration in row ${i + 1}`, 0, 3650),
    instructions: v.str(rx.instructions, 500),
  }));
}

router.get('/', requireRole('doctor', 'patient', 'admin'), async (req, res) => {
  const { db, profile, doctor, user } = req.auth;
  const q = req.query;

  const page = Math.max(1, Number.parseInt(q.page, 10) || 1);
  const from = v.date(q.from, 'From date');
  const to = v.date(q.to, 'To date');
  const search = v.searchTerm(q.q);
  const diagnosis = v.searchTerm(q.diagnosis);

  let query = db
    .from('medical_records')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order('visit_date', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (profile.role === 'doctor') {
    query = query.eq('doctor_id', doctor.id);
  } else if (profile.role === 'patient') {
    query = query.eq('patient_email', String(user.email).toLowerCase());
  } else {
    if (q.hospital_id) query = query.eq('hospital_id', v.id(q.hospital_id, 'hospital'));
    if (q.doctor_id) query = query.eq('doctor_id', v.id(q.doctor_id, 'doctor'));
  }

  if (from) query = query.gte('visit_date', from);
  if (to) query = query.lte('visit_date', to);
  if (diagnosis) query = query.ilike('diagnosis', `%${diagnosis}%`);
  if (q.upcoming === '1') query = query.gte('next_visit_date', today());
  if (search) {
    const fields = profile.role === 'patient'
      ? ['diagnosis', 'doctor_name', 'hospital_name']
      : ['patient_name', 'patient_email'];
    query = query.or(fields.map((f) => `${f}.ilike.%${search}%`).join(','));
  }

  const { data, count, error } = await query;
  if (error) throw fromSupabase(error);

  res.json({ records: data, total: count || 0, page, pageSize: PAGE_SIZE });
});

router.get('/:id', requireRole('doctor', 'patient', 'admin'), async (req, res) => {
  const { db, profile, doctor } = req.auth;
  const recordId = v.id(req.params.id, 'record');

  const { data: record, error } = await db
    .from('medical_records')
    .select('*, prescriptions(id, medicine_name, dosage, frequency, duration_days, instructions)')
    .eq('id', recordId)
    .order('id', { referencedTable: 'prescriptions', ascending: true })
    .maybeSingle();

  if (error) throw fromSupabase(error);
  if (!record) throw new HttpError(404, 'Record not found');

  const canEdit = profile.role === 'doctor' && record.doctor_id === doctor.id;
  let historyCount = 0;
  if (profile.role !== 'patient') {
    const { count } = await db
      .from('medical_record_history')
      .select('id', { count: 'exact', head: true })
      .eq('record_id', recordId);
    historyCount = count || 0;
  }

  res.json({ record, canEdit, historyCount });
});

router.get('/:id/history', requireRole('doctor', 'admin'), async (req, res) => {
  const recordId = v.id(req.params.id, 'record');
  const { data, error } = await req.auth.db
    .from('medical_record_history')
    .select('id, changed_at, changed_by, old_data')
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false });

  if (error) throw fromSupabase(error);
  res.json({ history: data });
});

async function save(req, recordId) {
  const body = req.body || {};
  const { data, error } = await req.auth.db.rpc('save_medical_record', {
    p_record_id: recordId,
    p_record: parseRecord(body),
    p_prescriptions: parsePrescriptions(body.prescriptions),
  });
  if (error) throw fromSupabase(error);
  return data;
}

router.post('/', requireRole('doctor'), async (req, res) => {
  const id = await save(req, null);
  res.status(201).json({ id });
});

router.put('/:id', requireRole('doctor'), async (req, res) => {
  const id = await save(req, v.id(req.params.id, 'record'));
  res.json({ id });
});

module.exports = router;
