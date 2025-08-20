CREATE TABLE `repo_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`label` text,
	`root_paths` text,
	`options` text,
	`result` text NOT NULL
);
CREATE INDEX `repo_scans_created_at_idx` ON `repo_scans` (`created_at`); 