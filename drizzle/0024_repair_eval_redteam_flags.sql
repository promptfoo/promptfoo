-- Backfill `is_redteam` to match the runtime predicate `config.redteam !== undefined`
-- used by writes in src/models/eval.ts.
--
-- Uses `json_type` (not `json_extract`) so that `{"redteam": null}` is classified as
-- a redteam: `json_extract` returns SQL NULL for both missing keys and JSON null,
-- but `json_type` only returns NULL when the key is missing.
UPDATE `evals` SET `is_redteam` = CASE
  WHEN json_valid(`config`) AND json_type(`config`, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END
WHERE `is_redteam` != CASE
  WHEN json_valid(`config`) AND json_type(`config`, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END;
