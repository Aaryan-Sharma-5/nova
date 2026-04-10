-- Mandatory AI feedback sessions for NOVA

create extension if not exists pgcrypto;

create table if not exists public.feedback_sessions (
    id uuid primary key default gen_random_uuid(),
    employee_id text not null,
    department text,
    scheduled_date timestamptz not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'skipped')),
    is_mandatory boolean not null default true,
    recording_url text,
    recording_hash text,
    transcript text,
    emotion_analysis jsonb not null default '{}'::jsonb,
    derived_scores jsonb not null default '{}'::jsonb,
    hr_reviewed boolean not null default false,
    hr_reviewer_id text,
    created_at timestamptz not null default now()
);

create table if not exists public.session_consent_log (
    session_id uuid not null references public.feedback_sessions(id) on delete cascade,
    employee_id text not null,
    consented_at timestamptz not null default now(),
    consent_version text not null,
    ip_address text,
    primary key (session_id, employee_id, consented_at)
);

create index if not exists idx_feedback_sessions_employee_id on public.feedback_sessions(employee_id);
create index if not exists idx_feedback_sessions_status on public.feedback_sessions(status);
create index if not exists idx_feedback_sessions_created_at on public.feedback_sessions(created_at desc);
create index if not exists idx_consent_session_id on public.session_consent_log(session_id);

alter table public.feedback_sessions enable row level security;
alter table public.session_consent_log enable row level security;

-- Employees can view only their own feedback sessions.
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'feedback_sessions' and policyname = 'Employees can view own feedback sessions'
    ) then
        create policy "Employees can view own feedback sessions"
            on public.feedback_sessions
            for select
            using (employee_id = coalesce(auth.jwt() ->> 'sub', auth.email()));
    end if;
end
$$;

-- HR and Leadership can view all sessions.
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'feedback_sessions' and policyname = 'HR Leadership can view all feedback sessions'
    ) then
        create policy "HR Leadership can view all feedback sessions"
            on public.feedback_sessions
            for select
            using ((auth.jwt() ->> 'role') in ('hr', 'leadership'));
    end if;
end
$$;

-- Service role full access for inserts/updates via backend admin client.
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'feedback_sessions' and policyname = 'Service role full access feedback sessions'
    ) then
        create policy "Service role full access feedback sessions"
            on public.feedback_sessions
            for all
            using (auth.role() = 'service_role')
            with check (auth.role() = 'service_role');
    end if;
end
$$;

-- Consent log policies.
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'session_consent_log' and policyname = 'Employees can view own consent logs'
    ) then
        create policy "Employees can view own consent logs"
            on public.session_consent_log
            for select
            using (employee_id = coalesce(auth.jwt() ->> 'sub', auth.email()));
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'session_consent_log' and policyname = 'HR Leadership can view all consent logs'
    ) then
        create policy "HR Leadership can view all consent logs"
            on public.session_consent_log
            for select
            using ((auth.jwt() ->> 'role') in ('hr', 'leadership'));
    end if;
end
$$;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'session_consent_log' and policyname = 'Service role full access consent logs'
    ) then
        create policy "Service role full access consent logs"
            on public.session_consent_log
            for all
            using (auth.role() = 'service_role')
            with check (auth.role() = 'service_role');
    end if;
end
$$;
