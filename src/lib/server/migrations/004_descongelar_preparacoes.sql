-- Refeições ligadas a uma preparação ainda por fazer, e aviso para descongelar.
ALTER TABLE plan_entries ADD COLUMN prep_id INTEGER REFERENCES preparations(id) ON DELETE SET NULL;
ALTER TABLE plan_entries ADD COLUMN thawed INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_plan_prep ON plan_entries(prep_id);
