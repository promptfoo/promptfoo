ALTER TABLE datasets ADD `tests` text;--> statement-breakpoint
ALTER TABLE `datasets` DROP COLUMN `test_case_id`;--> statement-breakpoint
ALTER TABLE `prompts` DROP COLUMN `hash`;