-- Adds analysis metadata columns introduced by
-- "Add analysis mode visibility and selectable OpenAI server configuration".

-- Submit metadata
ALTER TABLE submit ADD COLUMN analysis_mode VARCHAR(32) NOT NULL DEFAULT 'chain_of_thought';
ALTER TABLE submit ADD COLUMN openai_server VARCHAR(128) NOT NULL DEFAULT 'server-1';

-- Job metadata
ALTER TABLE analysis_job ADD COLUMN analysis_mode VARCHAR(32) NOT NULL DEFAULT 'chain_of_thought';
ALTER TABLE analysis_job ADD COLUMN openai_server VARCHAR(128) NOT NULL DEFAULT 'server-1';
