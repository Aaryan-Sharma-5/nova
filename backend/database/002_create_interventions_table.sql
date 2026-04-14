-- Interventions table for tracking recommended and executed interventions.
-- Uses text identifiers because NOVA mixes email-based and external employee IDs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL,
    intervention_type VARCHAR(50) NOT NULL,
    urgency VARCHAR(20) NOT NULL CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    priority_score FLOAT NOT NULL CHECK (priority_score >= 0 AND priority_score <= 1),
    description TEXT NOT NULL,
    estimated_impact TEXT,
    timing_window TEXT,
    risks_if_delayed TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'recommended' CHECK (status IN ('recommended', 'scheduled', 'in_progress', 'completed', 'declined')),
    recommended_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMP,
    completed_at TIMESTAMP,
    notes TEXT,
    recommended_by TEXT,
    executed_by TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_interventions_employee_id ON interventions(employee_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);
CREATE INDEX IF NOT EXISTS idx_interventions_urgency ON interventions(urgency);
CREATE INDEX IF NOT EXISTS idx_interventions_recommended_at ON interventions(recommended_at);

-- Intervention execution log for audit trail
CREATE TABLE IF NOT EXISTS intervention_execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intervention_id UUID NOT NULL REFERENCES interventions(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intervention_log_intervention_id ON intervention_execution_log(intervention_id);
CREATE INDEX IF NOT EXISTS idx_intervention_log_created_at ON intervention_execution_log(created_at);

-- Anomaly detection results table
CREATE TABLE IF NOT EXISTS behavioral_anomalies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id TEXT NOT NULL,
    anomaly_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    z_score FLOAT,
    description TEXT,
    detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP,
    acknowledged_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomalies_employee_id ON behavioral_anomalies(employee_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON behavioral_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_detected_at ON behavioral_anomalies(detected_at);
