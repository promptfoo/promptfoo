UPDATE `evals` SET `is_redteam` = CASE
  WHEN json_valid(`config`) AND json_type(`config`, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END
WHERE `is_redteam` != CASE
  WHEN json_valid(`config`) AND json_type(`config`, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END;
