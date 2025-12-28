CREATE TABLE `blob_assets` (
	`hash` text PRIMARY KEY NOT NULL,
	`size_bytes` integer NOT NULL,
	`mime_type` text NOT NULL,
	`provider` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `blob_assets_provider_idx` ON `blob_assets` (`provider`);--> statement-breakpoint
CREATE INDEX `blob_assets_created_at_idx` ON `blob_assets` (`created_at`);--> statement-breakpoint
CREATE TABLE `blob_references` (
	`id` text PRIMARY KEY NOT NULL,
	`blob_hash` text NOT NULL,
	`eval_id` text NOT NULL,
	`test_idx` integer,
	`prompt_idx` integer,
	`location` text,
	`kind` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`blob_hash`) REFERENCES `blob_assets`(`hash`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blob_references_blob_idx` ON `blob_references` (`blob_hash`);--> statement-breakpoint
CREATE INDEX `blob_references_eval_idx` ON `blob_references` (`eval_id`);