CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`description` text,
	`vars_json` text,
	`asserts_json` text,
	`metadata_json` text,
	`source_type` text,
	`source_ref` text,
	`source_row` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `test_cases_fingerprint_unique` ON `test_cases` (`fingerprint`);--> statement-breakpoint
CREATE UNIQUE INDEX `test_cases_fingerprint_idx` ON `test_cases` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `test_cases_description_idx` ON `test_cases` (`description`);--> statement-breakpoint
CREATE INDEX `test_cases_source_type_idx` ON `test_cases` (`source_type`);--> statement-breakpoint
CREATE INDEX `test_cases_created_at_idx` ON `test_cases` (`created_at`);--> statement-breakpoint
ALTER TABLE `eval_results` ADD `test_case_id` text;--> statement-breakpoint
CREATE INDEX `eval_result_test_case_id_idx` ON `eval_results` (`test_case_id`);--> statement-breakpoint
CREATE INDEX `eval_result_test_case_id_eval_idx` ON `eval_results` (`test_case_id`,`eval_id`);--> statement-breakpoint
ALTER TABLE `traces` ADD `eval_result_id` text;--> statement-breakpoint
ALTER TABLE `traces` ADD `duration_ms` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `span_count` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `error_span_count` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `input_tokens` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `output_tokens` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `total_tokens` integer;--> statement-breakpoint
ALTER TABLE `traces` ADD `summary_json` text;--> statement-breakpoint
CREATE INDEX `traces_eval_result_id_idx` ON `traces` (`eval_result_id`);--> statement-breakpoint
CREATE INDEX `traces_test_case_id_idx` ON `traces` (`test_case_id`);--> statement-breakpoint
CREATE INDEX `traces_duration_ms_idx` ON `traces` (`duration_ms`);--> statement-breakpoint
CREATE INDEX `traces_error_span_count_idx` ON `traces` (`error_span_count`);
