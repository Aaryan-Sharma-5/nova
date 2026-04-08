-- Audit log table for sensitive data access tracking
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.audit_log (
    id uuid primary key default gen_random_uuid(),
    "timestamp" timestamptz not null default now(),
    user_id text not null,
    user_role text not null,
    action text not null,
    resource_type text not null,
    resource_id text not null,
    reason text,
    ip_address text not null
);

create index if not exists idx_audit_log_timestamp on public.audit_log("timestamp" desc);
create index if not exists idx_audit_log_user_id on public.audit_log(user_id);
create index if not exists idx_audit_log_resource_type on public.audit_log(resource_type);
create index if not exists idx_audit_log_action on public.audit_log(action);

alter table public.audit_log enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'audit_log'
          and policyname = 'Service role has full access to audit_log'
    ) then
        create policy "Service role has full access to audit_log" on public.audit_log
            for all
            using (auth.role() = 'service_role');
    end if;
end
$$;
