CREATE TABLE IF NOT EXISTS agent_performance_goals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goals JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_performance_goals_agent_id_key ON agent_performance_goals(agent_id);

CREATE TRIGGER set_agent_performance_goals_updated_at
    BEFORE UPDATE ON agent_performance_goals
    FOR EACH ROW
    EXECUTE PROCEDURE set_updated_at();
