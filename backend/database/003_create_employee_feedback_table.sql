-- Employee personal page feedback storage

create extension if not exists pgcrypto;

create table if not exists public.employee_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    user_role text not null,
    category text not null,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_employee_feedback_user_id on public.employee_feedback(user_id);
create index if not exists idx_employee_feedback_created_at on public.employee_feedback(created_at desc);

alter table public.employee_feedback enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'employee_feedback'
          and policyname = 'Service role has full access to employee_feedback'
    ) then
        create policy "Service role has full access to employee_feedback" on public.employee_feedback
            for all
            using (auth.role() = 'service_role');
    end if;
end
$$;
