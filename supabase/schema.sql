-- Medi-Vault database schema for Supabase (PostgreSQL).
-- Run this whole file once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.hospitals (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  description text,
  address     text not null,
  phone       text,
  email       text,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  full_name  text not null,
  phone      text,
  role       text not null default 'patient' check (role in ('patient', 'doctor', 'admin')),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.doctors (
  id             bigint generated always as identity primary key,
  profile_id     uuid not null unique references public.profiles (id) on delete cascade,
  hospital_id    bigint not null references public.hospitals (id),
  specialization text,
  license_no     text,
  created_at     timestamptz not null default now()
);

create table if not exists public.patients (
  id         bigint generated always as identity primary key,
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  dob        date,
  gender     text,
  created_at timestamptz not null default now()
);

create table if not exists public.medical_records (
  id              bigint generated always as identity primary key,
  doctor_id       bigint not null references public.doctors (id),
  hospital_id     bigint not null references public.hospitals (id),
  doctor_name     text not null,
  hospital_name   text not null,
  patient_email   text not null check (patient_email = lower(patient_email)),
  patient_name    text not null,
  patient_age     int check (patient_age between 0 and 150),
  patient_gender  text,
  patient_phone   text,
  visit_date      date not null default current_date,
  chief_complaint text,
  symptoms        text,
  diagnosis       text not null,
  bp              text,
  pulse           int check (pulse between 0 and 300),
  temperature     numeric(4, 1),
  weight_kg       numeric(5, 1),
  notes           text,
  next_visit_date date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id)
);

create index if not exists medical_records_patient_email_idx on public.medical_records (patient_email);
create index if not exists medical_records_doctor_visit_idx on public.medical_records (doctor_id, visit_date desc);
create index if not exists medical_records_hospital_idx on public.medical_records (hospital_id);

create table if not exists public.prescriptions (
  id            bigint generated always as identity primary key,
  record_id     bigint not null references public.medical_records (id) on delete cascade,
  medicine_name text not null,
  dosage        text,
  frequency     text,
  duration_days int check (duration_days between 0 and 3650),
  instructions  text
);

create index if not exists prescriptions_record_idx on public.prescriptions (record_id);

create table if not exists public.medical_record_history (
  id         bigint generated always as identity primary key,
  record_id  bigint not null references public.medical_records (id) on delete cascade,
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now(),
  old_data   jsonb not null
);

create index if not exists medical_record_history_record_idx on public.medical_record_history (record_id, changed_at desc);

create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 254),
  sender_type text not null default 'other' check (sender_type in ('patient', 'doctor', 'hospital', 'other')),
  subject     text check (char_length(subject) <= 200),
  message     text not null check (char_length(message) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions used by the security policies.
-- SECURITY DEFINER so they can read profiles/doctors without recursing into RLS.
-- ---------------------------------------------------------------------------

create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create or replace function public.current_doctor_id()
returns bigint language sql stable security definer set search_path = public as $$
  select d.id
  from doctors d
  join profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid() and p.role = 'doctor' and p.status = 'active'
$$;

create or replace function public.current_doctor_hospital_id()
returns bigint language sql stable security definer set search_path = public as $$
  select d.hospital_id
  from doctors d
  join profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid() and p.role = 'doctor' and p.status = 'active'
$$;

-- Returns the patient's email only once Supabase Auth has confirmed it.
create or replace function public.current_verified_email()
returns text language sql stable security definer set search_path = public, auth as $$
  select lower(u.email)
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.id = auth.uid()
    and u.email_confirmed_at is not null
    and p.role = 'patient'
    and p.status = 'active'
$$;

-- ---------------------------------------------------------------------------
-- Sign-up trigger: creates the profile (and doctor/patient row) for each new
-- auth user. The role can only ever be 'doctor' or 'patient' here; admins are
-- promoted manually with SQL.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role      text := coalesce(meta ->> 'role', 'patient');
  v_hospital  bigint;
begin
  if v_role not in ('patient', 'doctor') then
    v_role := 'patient';
  end if;

  insert into profiles (id, email, full_name, phone, role)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(trim(meta ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta ->> 'phone'), ''),
    v_role
  );

  if v_role = 'doctor' then
    select id into v_hospital
    from hospitals
    where id = nullif(meta ->> 'hospital_id', '')::bigint and status = 'active';

    if v_hospital is null then
      raise exception 'A valid active hospital is required for doctor sign-up';
    end if;

    insert into doctors (profile_id, hospital_id, specialization, license_no)
    values (
      new.id,
      v_hospital,
      nullif(trim(meta ->> 'specialization'), ''),
      nullif(trim(meta ->> 'license_no'), '')
    );
  else
    insert into patients (profile_id, dob, gender)
    values (
      new.id,
      nullif(meta ->> 'dob', '')::date,
      nullif(trim(meta ->> 'gender'), '')
    );
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists hospitals_touch_updated_at on public.hospitals;
create trigger hospitals_touch_updated_at
  before update on public.hospitals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Saving records. All record/prescription writes go through this function so
-- every edit is captured in medical_record_history and cannot be bypassed.
-- p_record_id = null creates a new record; otherwise the doctor's own record
-- is updated and its prescriptions replaced.
-- ---------------------------------------------------------------------------

create or replace function public.save_medical_record(
  p_record_id     bigint,
  p_record        jsonb,
  p_prescriptions jsonb
)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_doctor        doctors%rowtype;
  v_doctor_name   text;
  v_hospital      hospitals%rowtype;
  v_old           medical_records%rowtype;
  v_id            bigint;
  v_rx            jsonb;
  v_email         text := lower(trim(coalesce(p_record ->> 'patient_email', '')));
  v_name          text := trim(coalesce(p_record ->> 'patient_name', ''));
  v_diagnosis     text := trim(coalesce(p_record ->> 'diagnosis', ''));
  v_prescriptions jsonb := coalesce(p_prescriptions, '[]'::jsonb);
begin
  select d.* into v_doctor
  from doctors d
  join profiles p on p.id = d.profile_id
  where d.profile_id = auth.uid() and p.role = 'doctor' and p.status = 'active';

  if not found then
    raise exception 'Only doctors can save medical records' using errcode = '42501';
  end if;

  select * into v_hospital from hospitals where id = v_doctor.hospital_id;
  if v_hospital.status <> 'active' then
    raise exception 'Your hospital is inactive, so records cannot be saved' using errcode = '42501';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid patient email is required';
  end if;
  if v_name = '' then
    raise exception 'Patient name is required';
  end if;
  if v_diagnosis = '' then
    raise exception 'Diagnosis is required';
  end if;
  if jsonb_typeof(v_prescriptions) <> 'array' then
    raise exception 'Prescriptions must be a list';
  end if;

  if p_record_id is null then
    select full_name into v_doctor_name from profiles where id = auth.uid();

    insert into medical_records (
      doctor_id, hospital_id, doctor_name, hospital_name,
      patient_email, patient_name, patient_age, patient_gender, patient_phone,
      visit_date, chief_complaint, symptoms, diagnosis,
      bp, pulse, temperature, weight_kg, notes, next_visit_date, updated_by
    ) values (
      v_doctor.id, v_hospital.id, v_doctor_name, v_hospital.name,
      v_email, v_name,
      (p_record ->> 'patient_age')::int,
      nullif(trim(p_record ->> 'patient_gender'), ''),
      nullif(trim(p_record ->> 'patient_phone'), ''),
      coalesce((p_record ->> 'visit_date')::date, current_date),
      nullif(trim(p_record ->> 'chief_complaint'), ''),
      nullif(trim(p_record ->> 'symptoms'), ''),
      v_diagnosis,
      nullif(trim(p_record ->> 'bp'), ''),
      (p_record ->> 'pulse')::int,
      (p_record ->> 'temperature')::numeric,
      (p_record ->> 'weight_kg')::numeric,
      nullif(trim(p_record ->> 'notes'), ''),
      (p_record ->> 'next_visit_date')::date,
      auth.uid()
    )
    returning id into v_id;
  else
    select * into v_old from medical_records where id = p_record_id for update;

    if not found or v_old.doctor_id <> v_doctor.id then
      raise exception 'Record not found' using errcode = 'P0002';
    end if;

    insert into medical_record_history (record_id, changed_by, old_data)
    values (
      p_record_id,
      auth.uid(),
      to_jsonb(v_old) || jsonb_build_object(
        'prescriptions',
        coalesce(
          (select jsonb_agg(to_jsonb(x) - 'record_id' order by x.id)
           from prescriptions x where x.record_id = p_record_id),
          '[]'::jsonb
        )
      )
    );

    update medical_records set
      patient_email   = v_email,
      patient_name    = v_name,
      patient_age     = (p_record ->> 'patient_age')::int,
      patient_gender  = nullif(trim(p_record ->> 'patient_gender'), ''),
      patient_phone   = nullif(trim(p_record ->> 'patient_phone'), ''),
      visit_date      = coalesce((p_record ->> 'visit_date')::date, v_old.visit_date),
      chief_complaint = nullif(trim(p_record ->> 'chief_complaint'), ''),
      symptoms        = nullif(trim(p_record ->> 'symptoms'), ''),
      diagnosis       = v_diagnosis,
      bp              = nullif(trim(p_record ->> 'bp'), ''),
      pulse           = (p_record ->> 'pulse')::int,
      temperature     = (p_record ->> 'temperature')::numeric,
      weight_kg       = (p_record ->> 'weight_kg')::numeric,
      notes           = nullif(trim(p_record ->> 'notes'), ''),
      next_visit_date = (p_record ->> 'next_visit_date')::date,
      updated_at      = now(),
      updated_by      = auth.uid()
    where id = p_record_id;

    delete from prescriptions where record_id = p_record_id;
    v_id := p_record_id;
  end if;

  for v_rx in select * from jsonb_array_elements(v_prescriptions) loop
    if trim(coalesce(v_rx ->> 'medicine_name', '')) = '' then
      raise exception 'Each prescription needs a medicine name';
    end if;

    insert into prescriptions (record_id, medicine_name, dosage, frequency, duration_days, instructions)
    values (
      v_id,
      trim(v_rx ->> 'medicine_name'),
      nullif(trim(v_rx ->> 'dosage'), ''),
      nullif(trim(v_rx ->> 'frequency'), ''),
      (v_rx ->> 'duration_days')::int,
      nullif(trim(v_rx ->> 'instructions'), '')
    );
  end loop;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges. Supabase grants everything to anon/authenticated by default, so
-- start from nothing and grant only what the app needs. Record writes are only
-- possible through save_medical_record().
-- ---------------------------------------------------------------------------

revoke all on table
  public.hospitals, public.profiles, public.doctors, public.patients,
  public.medical_records, public.prescriptions, public.medical_record_history,
  public.contact_messages
from anon, authenticated;

grant select on public.hospitals to anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select on public.contact_messages to authenticated;
grant insert, update on public.hospitals to authenticated;
grant select on
  public.profiles, public.doctors, public.patients,
  public.medical_records, public.prescriptions, public.medical_record_history
to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.save_medical_record(bigint, jsonb, jsonb) from public, anon;
grant execute on function public.save_medical_record(bigint, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.hospitals              enable row level security;
alter table public.profiles               enable row level security;
alter table public.doctors                enable row level security;
alter table public.patients               enable row level security;
alter table public.medical_records        enable row level security;
alter table public.prescriptions          enable row level security;
alter table public.medical_record_history enable row level security;
alter table public.contact_messages       enable row level security;

drop policy if exists contact_messages_insert on public.contact_messages;
create policy contact_messages_insert on public.contact_messages for insert to anon, authenticated
  with check (true);

drop policy if exists contact_messages_admin_select on public.contact_messages;
create policy contact_messages_admin_select on public.contact_messages for select to authenticated
  using (public.is_admin());

drop policy if exists hospitals_select on public.hospitals;
create policy hospitals_select on public.hospitals for select to anon, authenticated
  using (status = 'active' or public.is_admin() or id = public.current_doctor_hospital_id());

drop policy if exists hospitals_admin_insert on public.hospitals;
create policy hospitals_admin_insert on public.hospitals for insert to authenticated
  with check (public.is_admin());

drop policy if exists hospitals_admin_update on public.hospitals;
create policy hospitals_admin_update on public.hospitals for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists doctors_select on public.doctors;
create policy doctors_select on public.doctors for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists patients_select on public.patients;
create policy patients_select on public.patients for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists medical_records_select on public.medical_records;
create policy medical_records_select on public.medical_records for select to authenticated
  using (
    (public.app_role() = 'doctor' and doctor_id = public.current_doctor_id())
    or (public.app_role() = 'patient' and patient_email = public.current_verified_email())
    or public.is_admin()
  );

drop policy if exists prescriptions_select on public.prescriptions;
create policy prescriptions_select on public.prescriptions for select to authenticated
  using (exists (select 1 from public.medical_records r where r.id = record_id));

drop policy if exists medical_record_history_select on public.medical_record_history;
create policy medical_record_history_select on public.medical_record_history for select to authenticated
  using (
    public.app_role() in ('doctor', 'admin')
    and exists (select 1 from public.medical_records r where r.id = record_id)
  );
