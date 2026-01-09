CREATE INDEX `blob_assets_mime_type_idx` ON `blob_assets` (`mime_type`);--> statement-breakpoint
CREATE INDEX `blob_references_blob_created_at_idx` ON `blob_references` (`blob_hash`,`created_at`);