CREATE TABLE `configs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `configs_created_at_idx` ON `configs` (`created_at`);--> statement-breakpoint
CREATE INDEX `configs_type_idx` ON `configs` (`type`);