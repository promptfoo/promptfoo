CREATE TABLE `eval_results` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`eval_id` text NOT NULL,
	`prompt_idx` integer NOT NULL,
	`test_case_idx` integer NOT NULL,
	`test_case` text NOT NULL,
	`prompt` text NOT NULL,
	`prompt_id` text,
	`provider` text NOT NULL,
	`provider_id` text,
	`latency_ms` integer,
	`cost` real,
	`response` text,
	`error` text,
	`success` integer NOT NULL,
	`score` real NOT NULL,
	`grading_result` text,
	`named_scores` text,
	`metadata` text,
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `evals_to_providers` (
	`provider_id` text NOT NULL,
	`eval_id` text NOT NULL,
	PRIMARY KEY(`provider_id`, `eval_id`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`options` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `evals` ADD `prompts` text;--> statement-breakpoint
CREATE INDEX `eval_result_eval_id_idx` ON `eval_results` (`eval_id`);
