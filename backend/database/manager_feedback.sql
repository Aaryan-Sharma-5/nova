CREATE TABLE IF NOT EXISTS manager_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id TEXT NOT NULL,
    submitted_by_employee_id TEXT,
    ratings JSONB NOT NULL,
    free_text TEXT,
    sentiment_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manager_feedback_manager_id ON manager_feedback(manager_id);
CREATE INDEX IF NOT EXISTS idx_manager_feedback_created_at ON manager_feedback(created_at DESC);

ALTER TABLE manager_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manager feedback all" ON manager_feedback;
CREATE POLICY "service role manager feedback all"
    ON manager_feedback FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "authenticated read manager feedback" ON manager_feedback;
CREATE POLICY "authenticated read manager feedback"
    ON manager_feedback FOR SELECT
    USING (auth.role() IN ('authenticated', 'service_role'));
