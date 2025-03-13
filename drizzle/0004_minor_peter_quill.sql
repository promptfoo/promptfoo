CREATE TABLE `evals_to_tags` (
	`eval_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`eval_id`, `tag_id`),
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS `evals_tags_idx`;--> statement-breakpoint
CREATE INDEX `evals_to_tags_eval_id_idx` ON `evals_to_tags` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_tags_tag_id_idx` ON `evals_to_tags` (`tag_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);