CREATE TABLE `spans` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`span_id` text NOT NULL,
	`parent_span_id` text,
	`name` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`attributes` text,
	`status_code` integer,
	`status_message` text,
	FOREIGN KEY (`trace_id`) REFERENCES `traces`(`trace_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `spans_trace_id_idx` ON `spans` (`trace_id`);--> statement-breakpoint
CREATE INDEX `spans_span_id_idx` ON `spans` (`span_id`);--> statement-breakpoint
CREATE TABLE `traces` (
	`id` text PRIMARY KEY NOT NULL,
	`trace_id` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`metadata` text,
	FOREIGN KEY (`evaluation_id`) REFERENCES `evals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `traces_trace_id_unique` ON `traces` (`trace_id`);--> statement-breakpoint
CREATE INDEX `traces_evaluation_idx` ON `traces` (`evaluation_id`);--> statement-breakpoint
CREATE INDEX `traces_trace_id_idx` ON `traces` (`trace_id`);