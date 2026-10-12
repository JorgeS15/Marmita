-- Doses realmente descontadas do stock quando a refeição foi comida (o stock
-- nunca desce abaixo de 0). Ao desfazer repõe-se exatamente isto, e não as
-- doses todas, para não aparecerem doses que não existiam.
ALTER TABLE plan_entries ADD COLUMN deducted REAL NOT NULL DEFAULT 0;
UPDATE plan_entries SET deducted = units WHERE status = 'eaten' AND item_id IS NOT NULL;

-- A preparação criou um item novo ao ser confirmada (para o apagar ao desfazer).
ALTER TABLE preparations ADD COLUMN created_item INTEGER NOT NULL DEFAULT 0;
