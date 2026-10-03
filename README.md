# Medi-Vault

A medical records app that any hospital can use.

**Live site:** [https://medivault-0417.onrender.com](https://medivault-0417.onrender.com)

> Hosted on Render's free plan, so the first visit after a period of inactivity can take 30–60 seconds to load.

- **Doctors** sign up under one hospital (it can't be changed later), add patient visit records with diagnosis, vitals and prescriptions, and edit their own records. They see only the records they created.
- **Patients** sign up with their email and see every record any doctor saved with that email. If there are none, they see "No records yet".
- **Admin** (set in the database only) views all records read-only and manages the hospitals list (add, edit, activate / deactivate).

Every edit keeps a copy of the previous version in the record history. Records can't be deleted.

Built with Node.js (Express) and Supabase (PostgreSQL + Auth). Access rules are enforced in the database with row-level security, not only in the app.

## Setup

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/seed.sql`](supabase/seed.sql) for sample hospitals.
3. In **Authentication → Sign In / Providers → Email**, make sure **Confirm email** is turned on. Patients only see records after their email is confirmed.
4. In **Authentication → URL Configuration**, set **Site URL** to `http://localhost:3000` and add `http://localhost:3000/**` to **Redirect URLs**. Use your real domain when you deploy.

### 2. Run the app

```bash
npm install
cp .env.example .env   # on Windows: copy .env.example .env
```

Fill in `.env` from **Project Settings → API** in Supabase:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
APP_URL=http://localhost:3000
```

Use the anon (publishable) key only. Never put the `service_role` key in this app.

```bash
npm run dev
```

Open http://localhost:3000.

### 3. Create the admin

1. Sign up in the app as a patient using the admin's email, and confirm the email.
2. In the Supabase SQL editor run:

```sql
update public.profiles set role = 'admin' where email = 'admin@example.com';
delete from public.patients
where profile_id = (select id from public.profiles where email = 'admin@example.com');
```

3. Log in at http://localhost:3000/auth.html?as=admin.

## Project structure

```
server.js                 Express app: security headers, API routes, page guards
src/
  config.js               Environment variables
  supabase.js             Supabase clients (requests run as the logged-in user)
  middleware/auth.js      Session cookies, role checks, page redirects
  routes/auth.js          Sign up, login, logout, current user
  routes/records.js       List with filters, detail, create, edit, history
  routes/hospitals.js     Active hospitals for the sign-up form
  routes/admin.js         Hospital management and doctor list for filters
  validate.js             Input validation
supabase/
  schema.sql              Tables, triggers, row-level security, save function
  seed.sql                Sample hospitals and admin instructions
public/
  index.html              Landing page
  auth.html               Login / sign up for doctors, patients and admin
  doctor/                 Doctor dashboard and add / edit record form
  patient/                Patient dashboard
  admin/                  All records and hospital management
  record.html             Full record detail (all roles)
```

## Deploying

The live site runs on [Render](https://render.com) as a Web Service connected to this repo. Every push to `main` redeploys it automatically. GitHub Pages can't be used because it only hosts static files.

- Build command: `npm install`
- Start command: `npm start`
- Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_URL` (the deployed URL), `NODE_ENV=production`, `NODE_VERSION=22`

In Supabase, **Authentication → URL Configuration** must list the deployed URL as the **Site URL** and `https://<your-app>.onrender.com/**` under **Redirect URLs**, so confirmation emails link to the live site.
