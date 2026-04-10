CREATE TABLE IF NOT EXISTS integration_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id TEXT NOT NULL,
    integration_type TEXT NOT NULL,
    config JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_configs_org_type
    ON integration_configs (org_id, integration_type);

ALTER TABLE integration_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role all integration configs" ON integration_configs;
CREATE POLICY "service role all integration configs"
    ON integration_configs FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "hr leadership read integration configs" ON integration_configs;
CREATE POLICY "hr leadership read integration configs"
    ON integration_configs FOR SELECT
    USING (auth.role() IN ('authenticated', 'service_role'));
