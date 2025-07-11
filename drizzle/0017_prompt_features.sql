-- Add new columns to support all prompt features
ALTER TABLE prompt_versions ADD COLUMN config text;
ALTER TABLE prompt_versions ADD COLUMN content_type text;
ALTER TABLE prompt_versions ADD COLUMN function_source text;
ALTER TABLE prompt_versions ADD COLUMN function_name text;
ALTER TABLE prompt_versions ADD COLUMN file_format text;
ALTER TABLE prompt_versions ADD COLUMN transform text;
ALTER TABLE prompt_versions ADD COLUMN label text; 