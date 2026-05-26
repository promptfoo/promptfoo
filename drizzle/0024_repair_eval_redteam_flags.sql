-- Repair stale `is_redteam` values to match the runtime classification used by
-- the write paths in src/models/eval.ts (`config.redteam !== undefined`).
--
-- `json_type` is used here (not `json_extract`) on purpose:
--   * json_extract(config, '$.redteam') returns SQL NULL both when the key is
--     missing and when its value is JSON null.
--   * json_type(config, '$.redteam')    returns SQL NULL only when the key is
--     missing; it returns 'null' (string) when the value is JSON null.
-- Only `json_type` matches `config.redteam !== undefined` in JS.
--
-- The WHERE clause narrows the write to rows whose stored flag actually
-- disagrees with the derived value, so re-runs and already-correct databases
-- skip the bulk update.
UPDATE `evals` SET `is_redteam` = CASE
  WHEN json_valid(`config`) AND json_type(`config`, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END
WHERE `is_redteam` != CASE
  WHEN json_valid(`config`) AND json_type(`config`, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END;
