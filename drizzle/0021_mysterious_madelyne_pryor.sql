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
CREATE UNIQUE INDEX `idx_model_audits_unique_content` ON `model_audits` (`model_id`, `content_hash`) WHERE `revision_sha` IS NULL AND `content_hash` IS NOT NULL;