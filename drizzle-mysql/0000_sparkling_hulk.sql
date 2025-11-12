CREATE TABLE `configs` (
	`id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`name` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`config` json NOT NULL,
	CONSTRAINT `configs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` varchar(255) NOT NULL,
	`tests` json,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `datasets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `eval_results` (
	`id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`eval_id` varchar(255) NOT NULL,
	`prompt_idx` int NOT NULL,
	`test_idx` int NOT NULL,
	`test_case` json NOT NULL,
	`prompt` json NOT NULL,
	`prompt_id` varchar(255),
	`provider` json NOT NULL,
	`latency_ms` int,
	`cost` decimal(10,6),
	`response` json,
	`error` text,
	`failure_reason` int NOT NULL DEFAULT 0,
	`success` boolean NOT NULL,
	`score` decimal(5,4) NOT NULL,
	`grading_result` json,
	`named_scores` json,
	`metadata` json,
	CONSTRAINT `eval_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evals` (
	`id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`author` varchar(255),
	`description` text,
	`results` json NOT NULL,
	`config` json NOT NULL,
	`prompts` json,
	`vars` json,
	`runtime_options` json,
	`is_redteam` boolean NOT NULL DEFAULT false,
	CONSTRAINT `evals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `evals_to_datasets` (
	`eval_id` varchar(255) NOT NULL,
	`dataset_id` varchar(255) NOT NULL,
	CONSTRAINT `evals_to_datasets_eval_id_dataset_id_pk` PRIMARY KEY(`eval_id`,`dataset_id`)
);
--> statement-breakpoint
CREATE TABLE `evals_to_prompts` (
	`eval_id` varchar(255) NOT NULL,
	`prompt_id` varchar(255) NOT NULL,
	CONSTRAINT `evals_to_prompts_eval_id_prompt_id_pk` PRIMARY KEY(`eval_id`,`prompt_id`)
);
--> statement-breakpoint
CREATE TABLE `evals_to_tags` (
	`eval_id` varchar(255) NOT NULL,
	`tag_id` varchar(255) NOT NULL,
	CONSTRAINT `evals_to_tags_eval_id_tag_id_pk` PRIMARY KEY(`eval_id`,`tag_id`)
);
--> statement-breakpoint
CREATE TABLE `model_audits` (
	`id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	`name` varchar(255),
	`author` varchar(255),
	`model_path` text NOT NULL,
	`model_type` varchar(100),
	`results` json NOT NULL,
	`checks` json,
	`issues` json,
	`has_errors` boolean NOT NULL,
	`total_checks` int,
	`passed_checks` int,
	`failed_checks` int,
	`metadata` json,
	CONSTRAINT `model_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`prompt` text NOT NULL,
	CONSTRAINT `prompts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `spans` (
	`id` varchar(255) NOT NULL,
	`trace_id` varchar(255) NOT NULL,
	`span_id` varchar(255) NOT NULL,
	`parent_span_id` varchar(255),
	`name` varchar(255) NOT NULL,
	`start_time` bigint NOT NULL,
	`end_time` bigint,
	`attributes` json,
	`status_code` int,
	`status_message` text,
	CONSTRAINT `spans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `tags_name_value_unique` UNIQUE(`name`,`value`)
);
--> statement-breakpoint
CREATE TABLE `traces` (
	`id` varchar(255) NOT NULL,
	`trace_id` varchar(255) NOT NULL,
	`evaluation_id` varchar(255) NOT NULL,
	`test_case_id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`metadata` json,
	CONSTRAINT `traces_id` PRIMARY KEY(`id`),
	CONSTRAINT `traces_trace_id_unique` UNIQUE(`trace_id`)
);
--> statement-breakpoint
ALTER TABLE `eval_results` ADD CONSTRAINT `eval_results_eval_id_evals_id_fk` FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `eval_results` ADD CONSTRAINT `eval_results_prompt_id_prompts_id_fk` FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evals_to_datasets` ADD CONSTRAINT `evals_to_datasets_eval_id_evals_id_fk` FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evals_to_datasets` ADD CONSTRAINT `evals_to_datasets_dataset_id_datasets_id_fk` FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evals_to_prompts` ADD CONSTRAINT `evals_to_prompts_eval_id_evals_id_fk` FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evals_to_prompts` ADD CONSTRAINT `evals_to_prompts_prompt_id_prompts_id_fk` FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evals_to_tags` ADD CONSTRAINT `evals_to_tags_eval_id_evals_id_fk` FOREIGN KEY (`eval_id`) REFERENCES `evals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evals_to_tags` ADD CONSTRAINT `evals_to_tags_tag_id_tags_id_fk` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `spans` ADD CONSTRAINT `spans_trace_id_traces_trace_id_fk` FOREIGN KEY (`trace_id`) REFERENCES `traces`(`trace_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `traces` ADD CONSTRAINT `traces_evaluation_id_evals_id_fk` FOREIGN KEY (`evaluation_id`) REFERENCES `evals`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `configs_created_at_idx` ON `configs` (`created_at`);--> statement-breakpoint
CREATE INDEX `configs_type_idx` ON `configs` (`type`);--> statement-breakpoint
CREATE INDEX `datasets_created_at_idx` ON `datasets` (`created_at`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_id_idx` ON `eval_results` (`eval_id`);--> statement-breakpoint
CREATE INDEX `eval_result_test_idx` ON `eval_results` (`test_idx`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_test_idx` ON `eval_results` (`eval_id`,`test_idx`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_success_idx` ON `eval_results` (`eval_id`,`success`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_failure_idx` ON `eval_results` (`eval_id`,`failure_reason`);--> statement-breakpoint
CREATE INDEX `eval_result_eval_test_success_idx` ON `eval_results` (`eval_id`,`test_idx`,`success`);--> statement-breakpoint
CREATE INDEX `eval_result_response_idx` ON `eval_results` (`response`);--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_reason_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`grading_result``,` '$.reason')))`);--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_comment_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`grading_result``,` '$.comment')))`);--> statement-breakpoint
CREATE INDEX `eval_result_test_case_vars_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`test_case``,` '$.vars')))`);--> statement-breakpoint
CREATE INDEX `eval_result_test_case_metadata_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`metadata``,` '$')))`);--> statement-breakpoint
CREATE INDEX `eval_result_named_scores_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`named_scores``,` '$')))`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`metadata``,` '$')))`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_plugin_id_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`metadata``,` '$.pluginId')))`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_strategy_id_idx` ON `eval_results` (`(JSON_UNQUOTE(JSON_EXTRACT(`metadata``,` '$.strategyId')))`);--> statement-breakpoint
CREATE INDEX `evals_created_at_idx` ON `evals` (`created_at`);--> statement-breakpoint
CREATE INDEX `evals_author_idx` ON `evals` (`author`);--> statement-breakpoint
CREATE INDEX `evals_is_redteam_idx` ON `evals` (`is_redteam`);--> statement-breakpoint
CREATE INDEX `evals_to_datasets_eval_id_idx` ON `evals_to_datasets` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_datasets_dataset_id_idx` ON `evals_to_datasets` (`dataset_id`);--> statement-breakpoint
CREATE INDEX `evals_to_prompts_eval_id_idx` ON `evals_to_prompts` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_prompts_prompt_id_idx` ON `evals_to_prompts` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `evals_to_tags_eval_id_idx` ON `evals_to_tags` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_tags_tag_id_idx` ON `evals_to_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `model_audits_created_at_idx` ON `model_audits` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_audits_model_path_idx` ON `model_audits` (`model_path`);--> statement-breakpoint
CREATE INDEX `model_audits_has_errors_idx` ON `model_audits` (`has_errors`);--> statement-breakpoint
CREATE INDEX `model_audits_model_type_idx` ON `model_audits` (`model_type`);--> statement-breakpoint
CREATE INDEX `prompts_created_at_idx` ON `prompts` (`created_at`);--> statement-breakpoint
CREATE INDEX `spans_trace_id_idx` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `spans_span_id_idx` ON `spans` (`span_id`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE INDEX `traces_evaluation_idx` ON `traces` (`evaluation_id`);--> statement-breakpoint
CREATE INDEX `traces_trace_id_idx` ON `traces` (`trace_id`);