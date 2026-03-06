DELETE FROM `spans`
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM `spans`
  GROUP BY `trace_id`, `span_id`
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spans_trace_span_unique` ON `spans` (`trace_id`,`span_id`);
