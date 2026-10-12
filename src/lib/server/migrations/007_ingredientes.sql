-- Ingredientes do inventário usados numa preparação (reservados até ser feita).
CREATE TABLE prep_ingredients (
  id        INTEGER PRIMARY KEY,
  prep_id   INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  units     REAL NOT NULL CHECK (units > 0),
  consumed  REAL NOT NULL DEFAULT 0,      -- doses realmente descontadas ao confirmar (para desfazer)
  thawed    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_prep_ing_prep ON prep_ingredients(prep_id);
CREATE INDEX idx_prep_ing_item ON prep_ingredients(item_id);

-- "Planeadas" passa a incluir os ingredientes reservados por preparações por fazer.
DROP VIEW item_stock;
CREATE VIEW item_stock AS
SELECT i.*,
       ROUND(COALESCE(pe.u, 0) + COALESCE(pg.u, 0), 2) AS planned,
       ROUND(i.quantity - COALESCE(pe.u, 0) - COALESCE(pg.u, 0), 2) AS free
FROM items i
LEFT JOIN (SELECT item_id, SUM(units) AS u FROM plan_entries WHERE status = 'planned' GROUP BY item_id) pe
  ON pe.item_id = i.id
LEFT JOIN (SELECT g.item_id, SUM(g.units) AS u FROM prep_ingredients g
           JOIN preparations p ON p.id = g.prep_id WHERE p.status = 'planned' GROUP BY g.item_id) pg
  ON pg.item_id = i.id;
