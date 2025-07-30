ALTER TABLE `eval_results` ADD `human_rating` integer;--> statement-breakpoint
CREATE INDEX `eval_result_human_rating_idx` ON `eval_results` (`eval_id`,`human_rating`);--> statement-breakpoint
-- Backfill existing human ratings from JSON data
UPDATE eval_results 
SET human_rating = 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM json_each(grading_result, '$.componentResults') 
      WHERE json_extract(value, '$.assertion.type') = 'human'
    ) THEN 
      CASE 
        WHEN (
          SELECT json_extract(value, '$.pass') 
          FROM json_each(grading_result, '$.componentResults') 
          WHERE json_extract(value, '$.assertion.type') = 'human' 
          LIMIT 1
        ) = 1 THEN 1
        WHEN (
          SELECT json_extract(value, '$.pass') 
          FROM json_each(grading_result, '$.componentResults') 
          WHERE json_extract(value, '$.assertion.type') = 'human' 
          LIMIT 1
        ) = 0 THEN 0
        ELSE NULL
      END
    ELSE NULL
  END
WHERE grading_result IS NOT NULL;