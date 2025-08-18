CREATE TABLE `model_audit_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`author` text,
	`description` text,
	`primary_path` text NOT NULL,
	`bytes_scanned` integer DEFAULT 0 NOT NULL,
	`files_scanned` integer DEFAULT 0 NOT NULL,
	`start_time` real,
	`duration` real,
	`has_errors` integer DEFAULT false NOT NULL,
	`total_checks` integer DEFAULT 0 NOT NULL,
	`passed_checks` integer DEFAULT 0 NOT NULL,
	`failed_checks` integer DEFAULT 0 NOT NULL,
	`total_issues` integer DEFAULT 0 NOT NULL,
	`critical_issues` integer DEFAULT 0 NOT NULL,
	`warning_issues` integer DEFAULT 0 NOT NULL,
	`info_issues` integer DEFAULT 0 NOT NULL,
	`model_audit_version` text,
	`promptfoo_version` text,
	`results` text,
	`config` text
);
--> statement-breakpoint
CREATE TABLE `model_audit_assets` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`file_metadata` text,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_assets_scan_id_idx` ON `model_audit_assets` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_assets_path_idx` ON `model_audit_assets` (`path`);--> statement-breakpoint
CREATE INDEX `model_audit_assets_type_idx` ON `model_audit_assets` (`type`);--> statement-breakpoint
CREATE TABLE `model_audit_checks` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`location` text,
	`severity` text,
	`timestamp` real,
	`details` text,
	`why` text,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_checks_scan_id_idx` ON `model_audit_checks` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_checks_status_idx` ON `model_audit_checks` (`status`);--> statement-breakpoint
CREATE INDEX `model_audit_checks_name_idx` ON `model_audit_checks` (`name`);--> statement-breakpoint
CREATE INDEX `model_audit_checks_severity_idx` ON `model_audit_checks` (`severity`);--> statement-breakpoint
CREATE TABLE `model_audit_issues` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`location` text,
	`timestamp` real,
	`details` text,
	`why` text,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_issues_scan_id_idx` ON `model_audit_issues` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_issues_severity_idx` ON `model_audit_issues` (`severity`);--> statement-breakpoint
CREATE INDEX `model_audit_issues_location_idx` ON `model_audit_issues` (`location`);--> statement-breakpoint
CREATE TABLE `model_audit_scan_paths` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`path` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_scan_paths_scan_id_idx` ON `model_audit_scan_paths` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_scan_paths_path_idx` ON `model_audit_scan_paths` (`path`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_created_at_idx` ON `model_audit_scans` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_author_idx` ON `model_audit_scans` (`author`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_primary_path_idx` ON `model_audit_scans` (`primary_path`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_has_errors_idx` ON `model_audit_scans` (`has_errors`);