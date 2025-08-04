CREATE TABLE `model_audit_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`author` text,
	`description` text,
	`primary_path` text NOT NULL,
	`results` text NOT NULL,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_audit_scans_created_at_idx` ON `model_audit_scans` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_author_idx` ON `model_audit_scans` (`author`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_primary_path_idx` ON `model_audit_scans` (`primary_path`);