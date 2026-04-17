CREATE TABLE IF NOT EXISTS external_signals (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                TEXT NOT NULL,
    employee_id           TEXT,
    employee_email        TEXT,
    source                TEXT NOT NULL CHECK (source IN ('slack', 'gmail', 'github', 'jira', 'gcal')),
    signal_type           TEXT NOT NULL,
    occurred_at           TIMESTAMPTZ NOT NULL,
    after_hours           BOOLEAN DEFAULT FALSE,
    response_lag_minutes  INT,
    is_cross_team         BOOLEAN DEFAULT FALSE,
    metadata              JSONB NOT NULL DEFAULT '{}',
    raw_payload           JSONB,
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ext_signals_employee
    ON external_signals (employee_email, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ext_signals_org_source
    ON external_signals (org_id, source, occurred_at DESC);

CREATE TABLE IF NOT EXISTS composio_connections (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                TEXT NOT NULL,
    app_name              TEXT NOT NULL CHECK (app_name IN ('slack', 'gmail', 'github', 'jira', 'gcal')),
    composio_entity_id    TEXT NOT NULL,
    connection_id         TEXT NOT NULL DEFAULT '',
    scopes                TEXT[] NOT NULL DEFAULT '{}',
    is_active             BOOLEAN DEFAULT TRUE,
    connected_by          VARCHAR(255) REFERENCES users (email) ON DELETE SET NULL,
    connected_at          TIMESTAMPTZ DEFAULT now(),
    last_synced_at        TIMESTAMPTZ,
    UNIQUE (org_id, app_name)
);

ALTER TABLE external_signals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE composio_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_external_signals" ON external_signals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_composio_connections" ON composio_connections
    FOR ALL TO service_role USING (true) WITH CHECK (true);
