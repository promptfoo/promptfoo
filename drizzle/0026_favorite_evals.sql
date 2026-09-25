ALTER TABLE `evals` ADD `is_favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `evals_is_favorite_idx` ON `evals` (`is_favorite`);