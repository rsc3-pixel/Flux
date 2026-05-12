-- One-shot migration: create sub-categories for the owner (user_id = 2) and
-- reclassify existing transactions based on description keywords.
--
-- IDEMPOTENT: re-running won't duplicate sub-categories (NOT EXISTS check) and
-- won't move transactions that have already been manually re-categorized
-- (UPDATE filters by current category_id = parent).
--
-- Run AFTER deploying v1.10.0 (which adds the parent_id column):
--   sqlite3 /var/lib/flux/database.sqlite < scripts/migrate-finance-hierarchy.sql
--
-- Categories referenced (user_id = 2):
--   id 3 = Moradia (expense)
--   id 4 = Transporte (expense)

BEGIN;

-- ============ MORADIA SUB-CATEGORIES ============
INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Luz', 'expense', '💡',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       3
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Luz' AND parent_id = 3);

INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Água', 'expense', '🚰',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       3
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Água' AND parent_id = 3);

INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Internet/Telefone', 'expense', '📞',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       3
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Internet/Telefone' AND parent_id = 3);

INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Condomínio', 'expense', '🏢',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       3
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Condomínio' AND parent_id = 3);

INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Pets', 'expense', '🐱',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       3
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Pets' AND parent_id = 3);

-- ============ TRANSPORTE SUB-CATEGORIES ============
INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Combustível', 'expense', '⛽',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       4
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Combustível' AND parent_id = 4);

INSERT INTO finance_categories (user_id, name, kind, icon, position, parent_id)
SELECT 2, 'Condução Marina', 'expense', '🚌',
       (SELECT COALESCE(MAX(position), -1) + 1 FROM finance_categories WHERE user_id = 2 AND kind = 'expense'),
       4
WHERE NOT EXISTS (SELECT 1 FROM finance_categories WHERE user_id = 2 AND name = 'Condução Marina' AND parent_id = 4);

-- ============ RECLASSIFY EXISTING TRANSACTIONS ============
-- Each UPDATE only touches rows whose current category_id is still the parent —
-- so manually-recategorized rows are untouched, and re-running is safe.

-- Moradia > Luz
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Luz' AND parent_id = 3 LIMIT 1)
WHERE user_id = 2 AND category_id = 3 AND LOWER(description) LIKE '%luz%';

-- Moradia > Água  (cover both "água" and accidental "agua")
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Água' AND parent_id = 3 LIMIT 1)
WHERE user_id = 2 AND category_id = 3
  AND (LOWER(description) LIKE '%água%' OR LOWER(description) LIKE '%agua%');

-- Moradia > Internet/Telefone
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Internet/Telefone' AND parent_id = 3 LIMIT 1)
WHERE user_id = 2 AND category_id = 3
  AND (LOWER(description) LIKE '%telefone%' OR LOWER(description) LIKE '%internet%');

-- Moradia > Condomínio
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Condomínio' AND parent_id = 3 LIMIT 1)
WHERE user_id = 2 AND category_id = 3
  AND (LOWER(description) LIKE '%condomínio%' OR LOWER(description) LIKE '%condominio%');

-- Moradia > Pets  (gatos: ração / areia)
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Pets' AND parent_id = 3 LIMIT 1)
WHERE user_id = 2 AND category_id = 3
  AND (LOWER(description) LIKE '%gato%' OR LOWER(description) LIKE '%ração%' OR LOWER(description) LIKE '%racao%' OR LOWER(description) LIKE '%areia%');

-- Transporte > Combustível
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Combustível' AND parent_id = 4 LIMIT 1)
WHERE user_id = 2 AND category_id = 4
  AND (LOWER(description) LIKE '%combust%' OR LOWER(description) LIKE '%gasol%');

-- Transporte > Condução Marina
UPDATE finance_transactions
SET category_id = (SELECT id FROM finance_categories WHERE user_id = 2 AND name = 'Condução Marina' AND parent_id = 4 LIMIT 1)
WHERE user_id = 2 AND category_id = 4
  AND (LOWER(description) LIKE '%condução%' OR LOWER(description) LIKE '%conducao%' OR LOWER(description) LIKE '%marina%');

COMMIT;

-- ============ VERIFY (read-only, after commit) ============
.headers on
.mode column

SELECT 'Sub-categories created:' AS '';
SELECT id, name, icon, parent_id FROM finance_categories
WHERE user_id = 2 AND parent_id IS NOT NULL
ORDER BY parent_id, position;

SELECT '' AS '';
SELECT 'Transactions reclassified (count per sub-category):' AS '';
SELECT c.name AS sub_cat, p.name AS parent, COUNT(t.id) AS tx_count, SUM(t.amount_cents)/100.0 AS total_reais
FROM finance_transactions t
JOIN finance_categories c ON c.id = t.category_id
JOIN finance_categories p ON p.id = c.parent_id
WHERE t.user_id = 2
GROUP BY c.id
ORDER BY p.name, c.name;
