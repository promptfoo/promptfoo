CREATE TABLE `prompt_labels` (
	`prompt_id` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`prompt_id`, `label`),
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `prompts` RENAME COLUMN `prompt` TO `content`;
--> statement-breakpoint
ALTER TABLE `prompts` ADD `type` text DEFAULT 'prompt' NOT NULL;
--> statement-breakpoint
ALTER TABLE `prompts` ADD `version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `prompts` ADD `author` text;
--> statement-breakpoint
CREATE INDEX `prompt_labels_prompt_id_idx` ON `prompt_labels` (`prompt_id`);
--> statement-breakpoint
CREATE INDEX `prompt_labels_label_idx` ON `prompt_labels` (`label`);
--> statement-breakpoint
CREATE INDEX `prompts_type_idx` ON `prompts` (`type`);
--> statement-breakpoint
CREATE INDEX `prompts_version_idx` ON `prompts` (`version`);
