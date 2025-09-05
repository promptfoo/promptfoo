ALTER TABLE `evals` ADD `is_redteam` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `evals_is_redteam_idx` ON `evals` (`is_redteam`);--> statement-breakpoint


UPDATE `evals` set `is_redteam` = CASE
  WHEN json_valid(config) AND json_extract(config, '$.redteam') IS NOT NULL THEN 1
  ELSE 0
END;