ALTER TABLE `evals` ADD `test_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `evals` ADD `pass_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `evals` ADD `fail_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `evals` ADD `error_count` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `evals` ADD `pass_rate` real DEFAULT 0;