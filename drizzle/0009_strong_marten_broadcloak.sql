PRAGMA foreign_keys=off;--> statement-breakpoint

-- Create a new table without the provider_id column
CREATE TABLE `new_eval_results` AS SELECT * FROM `eval_results`;--> statement-breakpoint

-- Drop the provider_id column from the new table
ALTER TABLE `new_eval_results` DROP COLUMN `provider_id`;--> statement-breakpoint

-- Drop the old table
DROP TABLE `eval_results`;--> statement-breakpoint

-- Rename the new table to the original name
ALTER TABLE `new_eval_results` RENAME TO `eval_results`;--> statement-breakpoint

-- The rest of your migration remains the same
DROP TABLE `evals_to_providers`;--> statement-breakpoint
DROP TABLE `providers`;--> statement-breakpoint

PRAGMA foreign_keys=on;