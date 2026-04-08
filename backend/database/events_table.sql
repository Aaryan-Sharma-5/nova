-- Events table for historical annotations and causal analysis
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    event_type text not null,
    description text not null,
    date date not null,
    affected_department text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_events_date on public.events(date desc);
create index if not exists idx_events_event_type on public.events(event_type);
create index if not exists idx_events_department on public.events(affected_department);
create index if not exists idx_events_metadata_gin on public.events using gin(metadata);
