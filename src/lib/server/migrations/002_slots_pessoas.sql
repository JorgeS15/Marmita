-- Cores por utilizador e refeições atribuídas a uma pessoa.
-- Novos slots: pequeno-almoço, lanche da manhã e lanche da tarde.

ALTER TABLE users ADD COLUMN color TEXT NOT NULL DEFAULT '';

UPDATE users SET color = (
  SELECT CASE (r.rn - 1) % 6
    WHEN 0 THEN '#2563eb' WHEN 1 THEN '#db2777' WHEN 2 THEN '#16a34a'
    WHEN 3 THEN '#9333ea' WHEN 4 THEN '#ea580c' ELSE '#0891b2' END
  FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM users) r
  WHERE r.id = users.id
);

-- O CHECK do slot não se altera com ALTER TABLE: reconstruir a tabela.
DROP VIEW item_stock;

CREATE TABLE plan_entries_new (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN ('pequeno_almoco','lanche_manha','almoco','lanche_tarde','jantar')),
  position    INTEGER NOT NULL DEFAULT 0,
  item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
  title       TEXT,
  units       INTEGER NOT NULL DEFAULT 1 CHECK (units >= 1),
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','eaten','skipped')),
  notes       TEXT NOT NULL DEFAULT '',
  person_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (item_id IS NOT NULL OR title IS NOT NULL)
);

INSERT INTO plan_entries_new
  (id, date, slot, position, item_id, title, units, status, notes, created_by, updated_by, created_at, updated_at)
SELECT id, date, slot, position, item_id, title, units, status, notes, created_by, updated_by, created_at, updated_at
FROM plan_entries;

DROP TABLE plan_entries;
ALTER TABLE plan_entries_new RENAME TO plan_entries;

CREATE INDEX idx_plan_date ON plan_entries(date);
CREATE INDEX idx_plan_item_status ON plan_entries(item_id, status);

CREATE VIEW item_stock AS
SELECT i.*,
       COALESCE(SUM(CASE WHEN p.status = 'planned' THEN p.units END), 0) AS planned,
       i.quantity - COALESCE(SUM(CASE WHEN p.status = 'planned' THEN p.units END), 0) AS free
FROM items i
LEFT JOIN plan_entries p ON p.item_id = i.id
GROUP BY i.id;
