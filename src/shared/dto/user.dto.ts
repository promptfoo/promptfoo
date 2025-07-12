import { z } from 'zod';

const EmailSchema = z.string().email();

export const UserDTOSchemas = {
  Get: {
    Response: z.object({
      email: EmailSchema.nullable(),
    }),
  },
  GetId: {
    Response: z.object({
      id: z.string(),
    }),
  },
  Update: {
    Request: z.object({
      email: EmailSchema,
    }),
    Response: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
  },
  EmailStatus: {
    Response: z.object({
      hasEmail: z.boolean(),
      email: EmailSchema.optional(),
      status: z.enum(['ok', 'exceeded_limit', 'show_usage_warning', 'no_email']),
      message: z.string().optional(),
    }),
  },
};

// Type inference from Zod schemas
export type UserGetResponse = z.infer<typeof UserDTOSchemas.Get.Response>;
export type UserGetIdResponse = z.infer<typeof UserDTOSchemas.GetId.Response>;
export type UserUpdateRequest = z.infer<typeof UserDTOSchemas.Update.Request>;
export type UserUpdateResponse = z.infer<typeof UserDTOSchemas.Update.Response>;
export type UserEmailStatusResponse = z.infer<typeof UserDTOSchemas.EmailStatus.Response>;