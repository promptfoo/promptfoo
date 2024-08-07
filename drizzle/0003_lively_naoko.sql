CREATE INDEX `datasets_created_at_idx` ON `datasets` (`created_at`);--> statement-breakpoint
CREATE INDEX `evals_created_at_idx` ON `evals` (`created_at`);--> statement-breakpoint
CREATE INDEX `evals_author_idx` ON `evals` (`author`);--> statement-breakpoint
CREATE INDEX `evals_to_datasets_eval_id_idx` ON `evals_to_datasets` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_datasets_dataset_id_idx` ON `evals_to_datasets` (`dataset_id`);--> statement-breakpoint
CREATE INDEX `evals_to_prompts_eval_id_idx` ON `evals_to_prompts` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_prompts_prompt_id_idx` ON `evals_to_prompts` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `prompts_created_at_idx` ON `prompts` (`created_at`);