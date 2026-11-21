import { z } from 'zod';

const GeneratedSourceInputSchema = z.strictObject({
  type: z.literal('generated'),
  generator: z
    .literal('basic-document')
    .optional()
    .describe('Defaults to basic-document at runtime'),
  format: z.enum(['pdf', 'png', 'jpeg', 'jpg']).optional().describe('Defaults to pdf at runtime'),
  text: z.string().optional().describe('Generated document text; supports templates'),
});
const PathSourceInputSchema = z.strictObject({
  type: z.literal('path'),
  path: z.string().describe('File path; templates and file access are resolved during execution'),
});
const FieldInputSchema = z.strictObject({
  kind: z.literal('field'),
  name: z.string().describe('Multipart form field name'),
  value: z.union([z.string(), z.number(), z.boolean()]),
});
const FileInputSchema = z.strictObject({
  kind: z.literal('file'),
  name: z.string().describe('Multipart form file field name'),
  filename: z.string().optional(),
  filenameTemplate: z.string().optional().describe('Template for the uploaded filename'),
  contentType: z.string().optional().describe('MIME type of the uploaded file'),
  source: z.discriminatedUnion('type', [GeneratedSourceInputSchema, PathSourceInputSchema]),
});

export const HttpMultipartInputSchema = z.strictObject({
  parts: z.array(z.discriminatedUnion('kind', [FieldInputSchema, FileInputSchema])).min(1),
});

export const HttpGeneratedDocumentSourceSchema = GeneratedSourceInputSchema.strip().extend({
  generator: z.literal('basic-document').optional().default('basic-document'),
  format: z.enum(['pdf', 'png', 'jpeg', 'jpg']).optional().default('pdf'),
});
export const HttpPathFileSourceSchema = PathSourceInputSchema.strip();
export const HttpMultipartConfigSchema = z.object({
  parts: z
    .array(
      z.union([
        FieldInputSchema.strip(),
        FileInputSchema.strip().extend({
          source: z.union([HttpGeneratedDocumentSourceSchema, HttpPathFileSourceSchema]),
        }),
      ]),
    )
    .min(1),
});
