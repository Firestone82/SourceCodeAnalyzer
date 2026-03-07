-- Store AI Critiquer ratings separately from teacher ratings.

CREATE TABLE IF NOT EXISTS ai_submit_rating (
    id SERIAL PRIMARY KEY,
    submit_id INTEGER NOT NULL UNIQUE REFERENCES submit(id) ON DELETE CASCADE,
    relevance_rating INTEGER NULL,
    quality_rating INTEGER NULL,
    comment TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_issue_rating (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL UNIQUE REFERENCES issue(id) ON DELETE CASCADE,
    relevance_rating INTEGER NULL,
    quality_rating INTEGER NULL,
    comment TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
