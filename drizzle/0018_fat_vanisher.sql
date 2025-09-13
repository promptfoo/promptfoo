CREATE TABLE `model_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`name` text,
	`author` text,
	`model_path` text NOT NULL,
	`model_type` text,
	`results` text NOT NULL,
	`checks` text,
	`issues` text,
	`has_errors` integer NOT NULL,
	`total_checks` integer,
	`passed_checks` integer,
	`failed_checks` integer,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `model_audits_created_at_idx` ON `model_audits` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_audits_model_path_idx` ON `model_audits` (`model_path`);--> statement-breakpoint
CREATE INDEX `model_audits_has_errors_idx` ON `model_audits` (`has_errors`);--> statement-breakpoint
CREATE INDEX `model_audits_model_type_idx` ON `model_audits` (`model_type`);