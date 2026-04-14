-- ============================================================
-- NOVA: GitHub + JIRA Integration Tables
-- ============================================================

-- Employee work profiles built from commit activity
CREATE TABLE IF NOT EXISTS employee_work_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
    github_username TEXT,
    skills TEXT[] DEFAULT '{}',
    skill_embeddings FLOAT[] DEFAULT '{}',
    total_commits INT DEFAULT 0,
    avg_code_quality FLOAT DEFAULT 0.0,
    profile_summary TEXT DEFAULT '',
    last_commit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_profiles_email
    ON employee_work_profiles(employee_email);
CREATE INDEX IF NOT EXISTS idx_work_profiles_github
    ON employee_work_profiles(github_username);

ALTER TABLE employee_work_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all work profiles" ON employee_work_profiles;
CREATE POLICY "service role all work profiles"
    ON employee_work_profiles FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- Individual commit analyses
CREATE TABLE IF NOT EXISTS commit_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_email TEXT REFERENCES users(email) ON DELETE SET NULL,
    github_username TEXT NOT NULL,
    commit_hash TEXT NOT NULL,
    commit_message TEXT DEFAULT '',
    repository TEXT DEFAULT '',
    branch TEXT DEFAULT 'main',
    diff_summary TEXT DEFAULT '',
    skills_demonstrated TEXT[] DEFAULT '{}',
    code_quality_score FLOAT DEFAULT 50.0,
    code_quality_label TEXT DEFAULT 'neutral',
    complexity TEXT DEFAULT 'low',
    impact TEXT DEFAULT 'minor',
    quality_reasoning TEXT DEFAULT '',
    triggered_profile_update BOOLEAN DEFAULT FALSE,
    lines_added INT DEFAULT 0,
    lines_deleted INT DEFAULT 0,
    files_changed INT DEFAULT 0,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commit_analyses_email
    ON commit_analyses(employee_email);
CREATE INDEX IF NOT EXISTS idx_commit_analyses_repo
    ON commit_analyses(repository);

ALTER TABLE commit_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all commit analyses" ON commit_analyses;
CREATE POLICY "service role all commit analyses"
    ON commit_analyses FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- JIRA task assignment limbo queue
-- Each JIRA issue_created event produces one row
CREATE TABLE IF NOT EXISTS jira_task_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jira_issue_key TEXT NOT NULL,
    jira_issue_title TEXT DEFAULT '',
    jira_issue_description TEXT DEFAULT '',
    project_name TEXT DEFAULT '',
    issue_type TEXT DEFAULT 'Task',
    priority TEXT DEFAULT 'Medium',
    required_skills TEXT[] DEFAULT '{}',
    recommended_assignee_email TEXT REFERENCES users(email) ON DELETE SET NULL,
    recommended_assignee_name TEXT,
    match_score FLOAT DEFAULT 0.0,
    ai_reasoning TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    raw_webhook_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_status
    ON jira_task_assignments(status);
CREATE INDEX IF NOT EXISTS idx_task_assignments_jira_key
    ON jira_task_assignments(jira_issue_key);

ALTER TABLE jira_task_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all task assignments" ON jira_task_assignments;
CREATE POLICY "service role all task assignments"
    ON jira_task_assignments FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');


-- Job postings (created when no matching talent found OR HR rejects assignment)
CREATE TABLE IF NOT EXISTS job_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jira_issue_key TEXT,
    jira_task_assignment_id UUID REFERENCES jira_task_assignments(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    required_skills TEXT[] DEFAULT '{}',
    workplace_type TEXT DEFAULT 'HYBRID',
    employment_type TEXT DEFAULT 'FULL_TIME',
    status TEXT DEFAULT 'limbo',
    ai_reasoning TEXT DEFAULT '',
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_status
    ON job_postings(status);

ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all job postings" ON job_postings;
CREATE POLICY "service role all job postings"
    ON job_postings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Public read for approved postings
DROP POLICY IF EXISTS "public read approved job postings" ON job_postings;
CREATE POLICY "public read approved job postings"
    ON job_postings FOR SELECT
    USING (status = 'approved');


-- NOVA org-wide settings (auto-approve toggle, threshold, etc.)
CREATE TABLE IF NOT EXISTS nova_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL DEFAULT 'default',
    key TEXT NOT NULL,
    value JSONB,
    updated_by TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, key)
);

ALTER TABLE nova_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role all nova settings" ON nova_settings;
CREATE POLICY "service role all nova settings"
    ON nova_settings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Defaults
INSERT INTO nova_settings (org_id, key, value) VALUES
    ('default', 'auto_approve_assignments', 'false'),
    ('default', 'auto_approve_threshold', '0.85'),
    ('default', 'auto_post_jobs', 'false')
ON CONFLICT (org_id, key) DO NOTHING;
