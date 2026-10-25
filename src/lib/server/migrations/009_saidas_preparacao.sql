-- Uma preparação pode ir para vários locais (ex.: 3 doses no frigorífico e 2 no congelador):
-- cada linha é um item do inventário que recebeu doses ao confirmar.
CREATE TABLE prep_outputs (
  id        INTEGER PRIMARY KEY,
  prep_id   INTEGER NOT NULL REFERENCES preparations(id) ON DELETE CASCADE,
  item_id   INTEGER REFERENCES items(id) ON DELETE SET NULL,
  units     REAL NOT NULL CHECK (units > 0),
  created   INTEGER NOT NULL DEFAULT 0      -- o item foi criado por esta preparação (apaga-se ao desfazer)
);

CREATE INDEX idx_prep_out_prep ON prep_outputs(prep_id);

-- Preparações já confirmadas passam para a tabela nova.
INSERT INTO prep_outputs (prep_id, item_id, units, created)
SELECT id, item_id, units_added, created_item FROM preparations
WHERE status = 'done' AND item_id IS NOT NULL AND units_added > 0;
