-- Sample hospitals so the doctor sign-up dropdown has options.
-- Run after schema.sql. Safe to re-run.

insert into public.hospitals (name, description, address, phone, email, status) values
  ('City Care Hospital', 'Multi-speciality hospital', '12 MG Road, Bengaluru, Karnataka', '080-4000-1000', 'contact@citycare.example', 'active'),
  ('Sunrise Medical Centre', 'General medicine and paediatrics', '45 Park Street, Kolkata, West Bengal', '033-4000-2000', 'info@sunrise.example', 'active'),
  ('Green Valley Clinic', 'Outpatient clinic', '7 Ring Road, Lucknow, Uttar Pradesh', '0522-400-3000', 'hello@greenvalley.example', 'inactive')
on conflict (name) do nothing;

-- Making someone an admin (database only, never through the app):
--   1. Sign up in the app as a patient with the admin's email and confirm it.
--   2. Run:
--        update public.profiles set role = 'admin' where email = 'admin@example.com';
--        delete from public.patients
--        where profile_id = (select id from public.profiles where email = 'admin@example.com');
-- To remove admin access, set role back or set status = 'inactive'.
