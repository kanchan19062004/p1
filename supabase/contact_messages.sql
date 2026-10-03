-- Contact form messages. Anyone can send one; only the admin can read them.
-- Already included in schema.sql; run this file on its own only if your
-- database was created before the contact form was added. Safe to re-run.

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

revoke all on table public.contact_messages from anon, authenticated;
grant insert on public.contact_messages to anon, authenticated;
grant select on public.contact_messages to authenticated;

alter table public.contact_messages enable row level security;

drop policy if exists contact_messages_insert on public.contact_messages;
create policy contact_messages_insert on public.contact_messages for insert to anon, authenticated
  with check (true);

drop policy if exists contact_messages_admin_select on public.contact_messages;
create policy contact_messages_admin_select on public.contact_messages for select to authenticated
  using (public.is_admin());
