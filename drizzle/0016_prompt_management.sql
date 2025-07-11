CREATE TABLE `managed_prompts` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `tags` text,
  `current_version` integer DEFAULT 1 NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  `author` text,
  `metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `managed_prompts_name_idx` ON `managed_prompts` (`name`);--> statement-breakpoint
CREATE INDEX `managed_prompts_created_at_idx` ON `managed_prompts` (`created_at`);--> statement-breakpoint
CREATE TABLE `prompt_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `prompt_id` text NOT NULL,
  `version` integer NOT NULL,
  `content` text NOT NULL,
  `author` text,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `notes` text,
  `config` text, -- JSON: Prompt-specific configuration
  `content_type` text CHECK (content_type IN ('string', 'json', 'function', 'file')),
  `function_source` text, -- Source code for function prompts
  `function_name` text, -- Function name for multi-function files
  `file_format` text, -- Original file format (.txt, .json, .yaml, etc.)
  `transform` text, -- Prompt-level transform
  `label` text, -- Custom label for the prompt
  FOREIGN KEY (`prompt_id`) REFERENCES `managed_prompts`(`id`) ON DELETE CASCADE,
  UNIQUE(prompt_id, version)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_version_idx` ON `prompt_versions` (`prompt_id`, `version`);--> statement-breakpoint
CREATE INDEX `prompt_versions_created_at_idx` ON `prompt_versions` (`created_at`);--> statement-breakpoint
CREATE TABLE `prompt_deployments` (
  `prompt_id` text NOT NULL,
  `environment` text NOT NULL,
  `version_id` text NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_by` text,
  PRIMARY KEY(`prompt_id`, `environment`),
  FOREIGN KEY (`prompt_id`) REFERENCES `managed_prompts`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`version_id`) REFERENCES `prompt_versions`(`id`)
);
--> statement-breakpoint
CREATE INDEX `prompt_deployments_env_idx` ON `prompt_deployments` (`environment`); 