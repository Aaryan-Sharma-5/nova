create extension if not exists pgcrypto;

create table if not exists public.appraisal_suggestions (
    id uuid primary key default gen_random_uuid(),
    employee_id text not null,
    generated_at timestamptz not null default timezone('utc', now()),
    composite_score double precision not null,
    category text not null,
    summary text not null,
    recommendations jsonb not null default '[]'::jsonb,
    salary_action text not null,
    promotion_eligible boolean not null default false,
    review_flag text not null default 'none',
    hr_notes text,
    hr_decision text,
    status text not null default 'draft',
    finalized_by text,
    finalized_at timestamptz,
    department text,
    employee_name text,
    employee_role text,
    score_breakdown jsonb not null default '{}'::jsonb,
    constraint chk_appraisal_status check (status in ('draft', 'under_review', 'finalized')),
    constraint chk_recommendations_array check (jsonb_typeof(recommendations) = 'array')
);

create index if not exists idx_appraisal_employee_id on public.appraisal_suggestions(employee_id);
create index if not exists idx_appraisal_generated_at on public.appraisal_suggestions(generated_at desc);
create index if not exists idx_appraisal_status on public.appraisal_suggestions(status);
create index if not exists idx_appraisal_department on public.appraisal_suggestions(department);
create index if not exists idx_appraisal_category on public.appraisal_suggestions(category);
create index if not exists idx_appraisal_review_flag on public.appraisal_suggestions(review_flag);
create index if not exists idx_appraisal_promotion_eligible on public.appraisal_suggestions(promotion_eligible);

alter table public.appraisal_suggestions enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'appraisal_suggestions'
          and policyname = 'Service role has full access to appraisal_suggestions'
    ) then
        create policy "Service role has full access to appraisal_suggestions"
            on public.appraisal_suggestions
            for all
            using (auth.role() = 'service_role');
    end if;
end
$$;
