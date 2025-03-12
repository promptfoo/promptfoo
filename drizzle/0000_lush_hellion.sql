CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`test_case_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`description` text,
	`results` text NOT NULL,
	`config` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `evals_to_datasets` (
	`eval_id` text NOT NULL,
	`dataset_id` text NOT NULL,
	PRIMARY KEY(`dataset_id`, `eval_id`),
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evals_to_prompts` (
	`eval_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	PRIMARY KEY(`eval_id`, `prompt_id`),
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`prompt` text NOT NULL,
	`hash` text NOT NULL
);
