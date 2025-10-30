ALTER TABLE `model_audits` ADD `model_id` text;--> statement-breakpoint
ALTER TABLE `model_audits` ADD `revision_sha` text;--> statement-breakpoint
ALTER TABLE `model_audits` ADD `content_hash` text;--> statement-breakpoint
ALTER TABLE `model_audits` ADD `model_source` text;--> statement-breakpoint
ALTER TABLE `model_audits` ADD `source_last_modified` integer;--> statement-breakpoint
ALTER TABLE `model_audits` ADD `scanner_version` text;--> statement-breakpoint
CREATE INDEX `model_audits_model_id_idx` ON `model_audits` (`model_id`);--> statement-breakpoint
CREATE INDEX `model_audits_revision_sha_idx` ON `model_audits` (`revision_sha`);--> statement-breakpoint
CREATE INDEX `model_audits_content_hash_idx` ON `model_audits` (`content_hash`);--> statement-breakpoint
CREATE INDEX `model_audits_model_revision_idx` ON `model_audits` (`model_id`,`revision_sha`);--> statement-breakpoint
CREATE INDEX `model_audits_model_content_idx` ON `model_audits` (`model_id`,`content_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_model_audits_unique_revision` ON `model_audits` (`model_id`, `revision_sha`) WHERE `revision_sha` IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_model_audits_unique_content` ON `model_audits` (`model_id`, `content_hash`) WHERE `revision_sha` IS NULL AND `content_hash` IS NOT NULL;--> statement-breakpoint

-- Backfill model_id and model_source from existing model_path data
-- Extract owner/repo (first 2 path segments) to match parseHuggingFaceModel() logic
UPDATE `model_audits`
SET
  `model_id` = CASE
    -- hf://owner/repo[/tree/branch] -> owner/repo (first 2 segments after prefix)
    WHEN `model_path` LIKE 'hf://%' THEN
      CASE
        -- If there's a 3rd slash, extract up to it; otherwise take everything
        WHEN LENGTH(`model_path`) - LENGTH(REPLACE(SUBSTR(`model_path`, 6), '/', '')) >= 2 THEN
          SUBSTR(SUBSTR(`model_path`, 6), 1,
            INSTR(SUBSTR(`model_path`, 6 + INSTR(SUBSTR(`model_path`, 6), '/') + 1), '/') + INSTR(SUBSTR(`model_path`, 6), '/')
          )
        ELSE SUBSTR(`model_path`, 6)
      END
    -- https://huggingface.co/owner/repo[/tree/branch] -> owner/repo
    WHEN `model_path` LIKE 'https://huggingface.co/%' THEN
      CASE
        WHEN LENGTH(`model_path`) - LENGTH(REPLACE(SUBSTR(`model_path`, 24), '/', '')) >= 2 THEN
          SUBSTR(SUBSTR(`model_path`, 24), 1,
            INSTR(SUBSTR(`model_path`, 24 + INSTR(SUBSTR(`model_path`, 24), '/') + 1), '/') + INSTR(SUBSTR(`model_path`, 24), '/')
          )
        ELSE SUBSTR(`model_path`, 24)
      END
    -- https://hf.co/owner/repo[/tree/branch] -> owner/repo
    WHEN `model_path` LIKE 'https://hf.co/%' THEN
      CASE
        WHEN LENGTH(`model_path`) - LENGTH(REPLACE(SUBSTR(`model_path`, 15), '/', '')) >= 2 THEN
          SUBSTR(SUBSTR(`model_path`, 15), 1,
            INSTR(SUBSTR(`model_path`, 15 + INSTR(SUBSTR(`model_path`, 15), '/') + 1), '/') + INSTR(SUBSTR(`model_path`, 15), '/')
          )
        ELSE SUBSTR(`model_path`, 15)
      END
    WHEN `model_path` LIKE 's3://%' THEN SUBSTR(`model_path`, 6)
    WHEN `model_path` LIKE 'gs://%' THEN SUBSTR(`model_path`, 6)
    ELSE `model_path`
  END,
  `model_source` = CASE
    WHEN `model_path` LIKE 'hf://%' THEN 'huggingface'
    WHEN `model_path` LIKE 'https://huggingface.co/%' THEN 'huggingface'
    WHEN `model_path` LIKE 'https://hf.co/%' THEN 'huggingface'
    WHEN `model_path` LIKE 's3://%' THEN 's3'
    WHEN `model_path` LIKE 'gs://%' THEN 'gcs'
    ELSE 'local'
  END
WHERE `model_id` IS NULL;