DROP INDEX IF EXISTS `tags_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_value_unique` ON `tags` (`name`,`value`);