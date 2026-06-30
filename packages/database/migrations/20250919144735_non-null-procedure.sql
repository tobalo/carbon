ALTER TABLE procedure ALTER COLUMN content SET DEFAULT '{}'::json;
UPDATE procedure SET content = '{}'::json WHERE content IS NULL;
ALTER TABLE procedure ALTER COLUMN content SET NOT NULL;
