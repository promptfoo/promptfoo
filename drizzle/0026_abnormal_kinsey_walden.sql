CREATE INDEX `eval_result_saved_report_idx` ON `eval_results` (`eval_id`,`prompt_idx`) WHERE CASE WHEN json_valid(metadata) THEN
  json_type(metadata, '$.codexSecurity.version') IN ('integer', 'real')
    AND json_extract(metadata, '$.codexSecurity.version') = 1
    AND json_extract(metadata, '$.codexSecurity.source.kind') = 'saved-report'
  ELSE 0 END;