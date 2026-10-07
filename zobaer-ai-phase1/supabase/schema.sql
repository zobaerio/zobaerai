-- Phase 1 schema. Run in Supabase SQL editor.
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text, created_at timestamptz default now());
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null, created_at timestamptz default now());
create table if not exists settings (
  user_id uuid primary key references auth.users on delete cascade,
  model_tier text not null default 'balanced' check (model_tier in ('fast','balanced','advanced')),
  memory_enabled boolean not null default true, updated_at timestamptz default now());
create index if not exists conv_user_idx on conversations(user_id, updated_at desc);
create index if not exists msg_conv_idx on messages(conversation_id, created_at);

alter table profiles enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table settings enable row level security;
create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own conversations" on conversations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own messages" on messages for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, display_name) values (new.id, split_part(new.email,'@',1)) on conflict do nothing;
  insert into settings(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
