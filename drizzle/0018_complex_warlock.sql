CREATE TABLE `model_audit_assets` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`path` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`file_metadata` text,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_assets_scan_id_idx` ON `model_audit_assets` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_assets_path_idx` ON `model_audit_assets` (`path`);--> statement-breakpoint
CREATE INDEX `model_audit_assets_type_idx` ON `model_audit_assets` (`type`);--> statement-breakpoint
CREATE TABLE `model_audit_checks` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`location` text,
	`severity` text,
	`timestamp` real,
	`details` text,
	`why` text,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_checks_scan_id_idx` ON `model_audit_checks` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_checks_status_idx` ON `model_audit_checks` (`status`);--> statement-breakpoint
CREATE INDEX `model_audit_checks_name_idx` ON `model_audit_checks` (`name`);--> statement-breakpoint
CREATE INDEX `model_audit_checks_severity_idx` ON `model_audit_checks` (`severity`);--> statement-breakpoint
CREATE TABLE `model_audit_issues` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`location` text,
	`timestamp` real,
	`details` text,
	`why` text,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_issues_scan_id_idx` ON `model_audit_issues` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_issues_severity_idx` ON `model_audit_issues` (`severity`);--> statement-breakpoint
CREATE INDEX `model_audit_issues_location_idx` ON `model_audit_issues` (`location`);--> statement-breakpoint
CREATE TABLE `model_audit_scan_paths` (
	`id` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`scan_id` text NOT NULL,
	`path` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `model_audit_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `model_audit_scan_paths_scan_id_idx` ON `model_audit_scan_paths` (`scan_id`);--> statement-breakpoint
CREATE INDEX `model_audit_scan_paths_path_idx` ON `model_audit_scan_paths` (`path`);--> statement-breakpoint
DROP INDEX "configs_created_at_idx";--> statement-breakpoint
DROP INDEX "configs_type_idx";--> statement-breakpoint
DROP INDEX "datasets_created_at_idx";--> statement-breakpoint
DROP INDEX "eval_result_eval_id_idx";--> statement-breakpoint
DROP INDEX "eval_result_test_idx";--> statement-breakpoint
DROP INDEX "eval_result_eval_test_idx";--> statement-breakpoint
DROP INDEX "eval_result_eval_success_idx";--> statement-breakpoint
DROP INDEX "eval_result_eval_failure_idx";--> statement-breakpoint
DROP INDEX "eval_result_eval_test_success_idx";--> statement-breakpoint
DROP INDEX "eval_result_response_idx";--> statement-breakpoint
DROP INDEX "eval_result_grading_result_reason_idx";--> statement-breakpoint
DROP INDEX "eval_result_grading_result_comment_idx";--> statement-breakpoint
DROP INDEX "eval_result_test_case_vars_idx";--> statement-breakpoint
DROP INDEX "eval_result_test_case_metadata_idx";--> statement-breakpoint
DROP INDEX "eval_result_named_scores_idx";--> statement-breakpoint
DROP INDEX "eval_result_metadata_idx";--> statement-breakpoint
DROP INDEX "eval_result_metadata_plugin_id_idx";--> statement-breakpoint
DROP INDEX "eval_result_metadata_strategy_id_idx";--> statement-breakpoint
DROP INDEX "evals_created_at_idx";--> statement-breakpoint
DROP INDEX "evals_author_idx";--> statement-breakpoint
DROP INDEX "evals_to_datasets_eval_id_idx";--> statement-breakpoint
DROP INDEX "evals_to_datasets_dataset_id_idx";--> statement-breakpoint
DROP INDEX "evals_to_prompts_eval_id_idx";--> statement-breakpoint
DROP INDEX "evals_to_prompts_prompt_id_idx";--> statement-breakpoint
DROP INDEX "evals_to_tags_eval_id_idx";--> statement-breakpoint
DROP INDEX "evals_to_tags_tag_id_idx";--> statement-breakpoint
DROP INDEX "model_audit_assets_scan_id_idx";--> statement-breakpoint
DROP INDEX "model_audit_assets_path_idx";--> statement-breakpoint
DROP INDEX "model_audit_assets_type_idx";--> statement-breakpoint
DROP INDEX "model_audit_checks_scan_id_idx";--> statement-breakpoint
DROP INDEX "model_audit_checks_status_idx";--> statement-breakpoint
DROP INDEX "model_audit_checks_name_idx";--> statement-breakpoint
DROP INDEX "model_audit_checks_severity_idx";--> statement-breakpoint
DROP INDEX "model_audit_issues_scan_id_idx";--> statement-breakpoint
DROP INDEX "model_audit_issues_severity_idx";--> statement-breakpoint
DROP INDEX "model_audit_issues_location_idx";--> statement-breakpoint
DROP INDEX "model_audit_scan_paths_scan_id_idx";--> statement-breakpoint
DROP INDEX "model_audit_scan_paths_path_idx";--> statement-breakpoint
DROP INDEX "model_audit_scans_created_at_idx";--> statement-breakpoint
DROP INDEX "model_audit_scans_author_idx";--> statement-breakpoint
DROP INDEX "model_audit_scans_primary_path_idx";--> statement-breakpoint
DROP INDEX "model_audit_scans_has_errors_idx";--> statement-breakpoint
DROP INDEX "prompts_created_at_idx";--> statement-breakpoint
DROP INDEX "spans_trace_id_idx";--> statement-breakpoint
DROP INDEX "spans_span_id_idx";--> statement-breakpoint
DROP INDEX "tags_name_idx";--> statement-breakpoint
DROP INDEX "tags_name_value_unique";--> statement-breakpoint
DROP INDEX "traces_trace_id_unique";--> statement-breakpoint
DROP INDEX "traces_evaluation_idx";--> statement-breakpoint
DROP INDEX "traces_trace_id_idx";--> statement-breakpoint
ALTER TABLE `model_audit_scans` ALTER COLUMN "results" TO "results" text;--> statement-breakpoint
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
CREATE INDEX `eval_result_grading_result_reason_idx` ON `eval_results` (`json_extract("grading_result"`,` '$.reason')`);--> statement-breakpoint
CREATE INDEX `eval_result_grading_result_comment_idx` ON `eval_results` (`json_extract("grading_result"`,` '$.comment')`);--> statement-breakpoint
CREATE INDEX `eval_result_test_case_vars_idx` ON `eval_results` (`json_extract("test_case"`,` '$.vars')`);--> statement-breakpoint
CREATE INDEX `eval_result_test_case_metadata_idx` ON `eval_results` (`json_extract("metadata"`,` '$')`);--> statement-breakpoint
CREATE INDEX `eval_result_named_scores_idx` ON `eval_results` (`json_extract("named_scores"`,` '$')`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_idx` ON `eval_results` (`json_extract("metadata"`,` '$')`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_plugin_id_idx` ON `eval_results` (`json_extract("metadata"`,` '$.pluginId')`);--> statement-breakpoint
CREATE INDEX `eval_result_metadata_strategy_id_idx` ON `eval_results` (`json_extract("metadata"`,` '$.strategyId')`);--> statement-breakpoint
CREATE INDEX `evals_created_at_idx` ON `evals` (`created_at`);--> statement-breakpoint
CREATE INDEX `evals_author_idx` ON `evals` (`author`);--> statement-breakpoint
CREATE INDEX `evals_to_datasets_eval_id_idx` ON `evals_to_datasets` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_datasets_dataset_id_idx` ON `evals_to_datasets` (`dataset_id`);--> statement-breakpoint
CREATE INDEX `evals_to_prompts_eval_id_idx` ON `evals_to_prompts` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_prompts_prompt_id_idx` ON `evals_to_prompts` (`prompt_id`);--> statement-breakpoint
CREATE INDEX `evals_to_tags_eval_id_idx` ON `evals_to_tags` (`eval_id`);--> statement-breakpoint
CREATE INDEX `evals_to_tags_tag_id_idx` ON `evals_to_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_created_at_idx` ON `model_audit_scans` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_author_idx` ON `model_audit_scans` (`author`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_primary_path_idx` ON `model_audit_scans` (`primary_path`);--> statement-breakpoint
CREATE INDEX `model_audit_scans_has_errors_idx` ON `model_audit_scans` (`has_errors`);--> statement-breakpoint
CREATE INDEX `prompts_created_at_idx` ON `prompts` (`created_at`);--> statement-breakpoint
CREATE INDEX `spans_trace_id_idx` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `spans_span_id_idx` ON `spans` (`span_id`);--> statement-breakpoint
CREATE INDEX `tags_name_idx` ON `tags` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_value_unique` ON `tags` (`name`,`value`);--> statement-breakpoint
CREATE UNIQUE INDEX `traces_trace_id_unique` ON `traces` (`trace_id`);--> statement-breakpoint
CREATE INDEX `traces_evaluation_idx` ON `traces` (`evaluation_id`);--> statement-breakpoint
CREATE INDEX `traces_trace_id_idx` ON `traces` (`trace_id`);--> statement-breakpoint
ALTER TABLE `model_audit_scans` ALTER COLUMN "config" TO "config" text;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `bytes_scanned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `files_scanned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `start_time` real;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `duration` real;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `has_errors` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `total_checks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `passed_checks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `failed_checks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `total_issues` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `critical_issues` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `warning_issues` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_audit_scans` ADD `info_issues` integer DEFAULT 0 NOT NULL;