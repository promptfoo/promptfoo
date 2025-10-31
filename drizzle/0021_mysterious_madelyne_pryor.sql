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
-- Best-effort extraction for backward compatibility with existing records
-- Note: Single-segment paths (e.g., hf://gpt2) are extracted as-is but won't trigger
--       unique constraint violations since they typically have NULL revision_sha/content_hash
-- New scans use parseHuggingFaceModel() in application code which validates properly
UPDATE `model_audits`
SET
  `model_id` = CASE
    -- hf://owner/repo or hf://owner/repo/... -> owner/repo
    WHEN `model_path` LIKE 'hf://%/%' THEN
      -- Find position of second slash, extract owner/repo
      RTRIM(
        SUBSTR(
          `model_path`,
          6,
          CASE
            WHEN INSTR(SUBSTR(`model_path`, 6 + INSTR(SUBSTR(`model_path`, 6), '/')), '/') > 0
            THEN INSTR(SUBSTR(`model_path`, 6), '/') + INSTR(SUBSTR(`model_path`, 6 + INSTR(SUBSTR(`model_path`, 6), '/')), '/') - 1
            ELSE LENGTH(SUBSTR(`model_path`, 6))
          END
        ),
        '/'
      )
    WHEN `model_path` LIKE 'hf://%' THEN SUBSTR(`model_path`, 6)
    -- https://huggingface.co/owner/repo or .../owner/repo/... -> owner/repo
    WHEN `model_path` LIKE 'https://huggingface.co/%/%' THEN
      RTRIM(
        SUBSTR(
          `model_path`,
          24,
          CASE
            WHEN INSTR(SUBSTR(`model_path`, 24 + INSTR(SUBSTR(`model_path`, 24), '/')), '/') > 0
            THEN INSTR(SUBSTR(`model_path`, 24), '/') + INSTR(SUBSTR(`model_path`, 24 + INSTR(SUBSTR(`model_path`, 24), '/')), '/') - 1
            ELSE LENGTH(SUBSTR(`model_path`, 24))
          END
        ),
        '/'
      )
    WHEN `model_path` LIKE 'https://huggingface.co/%' THEN SUBSTR(`model_path`, 24)
    -- https://hf.co/owner/repo or .../owner/repo/... -> owner/repo
    WHEN `model_path` LIKE 'https://hf.co/%/%' THEN
      RTRIM(
        SUBSTR(
          `model_path`,
          15,
          CASE
            WHEN INSTR(SUBSTR(`model_path`, 15 + INSTR(SUBSTR(`model_path`, 15), '/')), '/') > 0
            THEN INSTR(SUBSTR(`model_path`, 15), '/') + INSTR(SUBSTR(`model_path`, 15 + INSTR(SUBSTR(`model_path`, 15), '/')), '/') - 1
            ELSE LENGTH(SUBSTR(`model_path`, 15))
          END
        ),
        '/'
      )
    WHEN `model_path` LIKE 'https://hf.co/%' THEN SUBSTR(`model_path`, 15)
    -- Other sources
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