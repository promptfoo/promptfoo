ALTER TABLE `evals` ADD `vars` text;--> statement-breakpoint
CREATE INDEX `eval_result_eval_id_test_idx_idx` ON `eval_results` (`eval_id`,`test_idx`);