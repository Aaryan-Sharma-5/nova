-- Rich employee feedback records for HR Feedback Analyzer

create extension if not exists pgcrypto;

create table if not exists public.employee_feedbacks (
    id uuid primary key default gen_random_uuid(),
    employee_id text not null,
    submitted_at timestamptz not null default timezone('utc', now()),
    feedback_type text not null,
    raw_text text not null,
    department text not null,
    is_anonymous boolean not null default false,
    sentiment_score double precision not null default 0,
    emotion_tags jsonb not null default '{}'::jsonb,
    themes jsonb not null default '[]'::jsonb,
    analyzed_at timestamptz,
    analyzed_by_ai boolean not null default false,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint chk_employee_feedbacks_feedback_type
        check (feedback_type in ('pulse_survey', 'exit_interview', 'session_transcript', 'peer_review')),
    constraint chk_employee_feedbacks_sentiment_score
        check (sentiment_score >= -1 and sentiment_score <= 1),
    constraint chk_employee_feedbacks_themes_array
        check (jsonb_typeof(themes) = 'array')
);

create index if not exists idx_employee_feedbacks_department
    on public.employee_feedbacks(department);
create index if not exists idx_employee_feedbacks_feedback_type
    on public.employee_feedbacks(feedback_type);
create index if not exists idx_employee_feedbacks_submitted_at
    on public.employee_feedbacks(submitted_at desc);
create index if not exists idx_employee_feedbacks_is_anonymous
    on public.employee_feedbacks(is_anonymous);
create index if not exists idx_employee_feedbacks_sentiment
    on public.employee_feedbacks(sentiment_score);
create index if not exists idx_employee_feedbacks_text_search
    on public.employee_feedbacks using gin (to_tsvector('english', coalesce(raw_text, '')));
create index if not exists idx_employee_feedbacks_themes
    on public.employee_feedbacks using gin (themes);

create or replace function public.update_employee_feedbacks_updated_at()
returns trigger as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_employee_feedbacks_updated_at on public.employee_feedbacks;
create trigger trg_employee_feedbacks_updated_at
before update on public.employee_feedbacks
for each row execute function public.update_employee_feedbacks_updated_at();

alter table public.employee_feedbacks enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'employee_feedbacks'
          and policyname = 'Service role has full access to employee_feedbacks'
    ) then
        create policy "Service role has full access to employee_feedbacks"
            on public.employee_feedbacks
            for all
            using (auth.role() = 'service_role');
    end if;
end
$$;
