-- Migration 008: Temporary message buffer for in-flight sentiment analysis.
-- Raw text lives here only until the 2-minute sentiment job processes it,
-- then rows are deleted. Nothing here is shown to users.
CREATE TABLE IF NOT EXISTS message_buffer (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         TEXT NOT NULL,
    employee_email TEXT NOT NULL,
    source         TEXT NOT NULL DEFAULT 'slack',
    message_text   TEXT NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_buffer_org_email
    ON message_buffer (org_id, employee_email, created_at);

ALTER TABLE message_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_message_buffer" ON message_buffer
    FOR ALL TO service_role USING (true) WITH CHECK (true);
