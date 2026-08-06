create table if not exists public.dictation_states (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.dictation_states enable row level security;

drop policy if exists "Users can read their own dictation state" on public.dictation_states;
create policy "Users can read their own dictation state"
  on public.dictation_states for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own dictation state" on public.dictation_states;
create policy "Users can create their own dictation state"
  on public.dictation_states for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own dictation state" on public.dictation_states;
create policy "Users can update their own dictation state"
  on public.dictation_states for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_dictation_states_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists dictation_states_updated_at on public.dictation_states;
create trigger dictation_states_updated_at
before update on public.dictation_states
for each row execute function public.set_dictation_states_updated_at();
