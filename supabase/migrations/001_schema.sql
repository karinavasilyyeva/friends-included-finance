create table if not exists public.employees (
  name text primary key,
  role text not null check (role in ('sales','expenses','manager')),
  display_order integer not null,
  telegram_user_id text unique,
  telegram_chat_id text
);

insert into public.employees(name, role, display_order) values
 ('Richard','sales',1),('Anastasia','sales',2),('Jean-Claude','sales',3),('Kevin','expenses',4),('Svetlana','manager',5)
on conflict (name) do nothing;

create table if not exists public.transactions (
  reference text primary key,
  type text not null check (type in ('sale','expense')),
  submitted_at timestamptz not null,
  decided_at timestamptz,
  submitter text not null references public.employees(name),
  customer text,
  project text,
  description text not null,
  category text,
  amount numeric(12,2) not null check (amount > 0),
  proposed_split jsonb,
  approved_split jsonb,
  commission_pool numeric(12,2) not null default 0,
  commission_earned jsonb,
  proposed_allocation text,
  final_allocation text,
  status text not null,
  origin_chat_id text,
  sync_status text not null default 'pending',
  sync_error text,
  notify_status text not null default 'not_required',
  notify_error text
);

alter table public.employees enable row level security;
alter table public.transactions enable row level security;
-- The application uses the server-only service-role key. No anonymous policies are created.
