-- Doses fracionárias (ex.: meia dose). O CHECK (units >= 1) obriga a reconstruir plan_entries.
DROP VIEW item_stock;

CREATE TABLE plan_entries_new (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN ('pequeno_almoco','lanche_manha','almoco','lanche_tarde','jantar')),
  position    INTEGER NOT NULL DEFAULT 0,
  item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
  title       TEXT,
  units       REAL NOT NULL DEFAULT 1 CHECK (units > 0),
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','eaten','skipped')),
  notes       TEXT NOT NULL DEFAULT '',
  person_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  prep_id     INTEGER REFERENCES preparations(id) ON DELETE SET NULL,
  thawed      INTEGER NOT NULL DEFAULT 0,
  CHECK (item_id IS NOT NULL OR title IS NOT NULL)
);

INSERT INTO plan_entries_new
  (id, date, slot, position, item_id, title, units, status, notes, person_id,
   created_by, updated_by, created_at, updated_at, prep_id, thawed)
SELECT id, date, slot, position, item_id, title, units, status, notes, person_id,
       created_by, updated_by, created_at, updated_at, prep_id, thawed
FROM plan_entries;

DROP TABLE plan_entries;
ALTER TABLE plan_entries_new RENAME TO plan_entries;

CREATE INDEX idx_plan_date ON plan_entries(date);
CREATE INDEX idx_plan_item_status ON plan_entries(item_id, status);
CREATE INDEX idx_plan_prep ON plan_entries(prep_id);

CREATE VIEW item_stock AS
SELECT i.*,
       COALESCE(SUM(CASE WHEN p.status = 'planned' THEN p.units END), 0) AS planned,
       ROUND(i.quantity - COALESCE(SUM(CASE WHEN p.status = 'planned' THEN p.units END), 0), 2) AS free
FROM items i
LEFT JOIN plan_entries p ON p.item_id = i.id
GROUP BY i.id;
