import { z } from 'zod';

const RecordSchema = z.record(z.string(), z.unknown());

export const A2APartSchema = z.looseObject({
  text: z.union([z.string(), z.looseObject({ text: z.string().optional() })]).optional(),
  data: z.unknown().optional(),
  file: z.unknown().optional(),
});

export const A2AMessageSchema = z.looseObject({
  contextId: z.string().optional(),
  messageId: z.string().optional(),
  parts: z.array(A2APartSchema).optional(),
  role: z.string().optional(),
});

export const A2AArtifactSchema = z.looseObject({
  artifactId: z.string().optional(),
  name: z.string().optional(),
  parts: z.array(A2APartSchema).optional(),
});

export const A2ATaskSchema = z.looseObject({
  artifacts: z.array(A2AArtifactSchema).optional(),
  contextId: z.string().optional(),
  history: z.array(A2AMessageSchema).optional(),
  id: z.string().optional(),
  status: z
    .looseObject({
      message: A2AMessageSchema.optional(),
      state: z.string().optional(),
    })
    .optional(),
});

export const A2AStreamResponseSchema = z.looseObject({
  artifactUpdate: z
    .looseObject({
      artifact: A2AArtifactSchema.optional(),
      contextId: z.string().optional(),
      taskId: z.string().optional(),
    })
    .optional(),
  message: A2AMessageSchema.optional(),
  statusUpdate: z
    .looseObject({
      contextId: z.string().optional(),
      status: z
        .looseObject({
          message: A2AMessageSchema.optional(),
          state: z.string().optional(),
        })
        .optional(),
      taskId: z.string().optional(),
    })
    .optional(),
  task: A2ATaskSchema.optional(),
});

export const A2AAgentInterfaceSchema = z.looseObject({
  protocolBinding: z.string().optional(),
  protocolVersion: z.string().optional(),
  tenant: z.string().optional(),
  url: z.string().optional(),
});

export const A2AAgentCardSchema = z.looseObject({
  capabilities: z
    .looseObject({
      streaming: z.boolean().optional(),
    })
    .optional(),
  name: z.string().optional(),
  supportedInterfaces: z.array(A2AAgentInterfaceSchema).optional(),
  url: z.string().optional(),
});

export const A2AProviderConfigSchema = z
  .object({
    agentCardUrl: z.string().optional(),
    configuration: RecordSchema.optional(),
    headers: z.record(z.string(), z.string()).optional(),
    message: RecordSchema.optional(),
    mode: z.enum(['auto', 'send', 'stream']).prefault('auto'),
    polling: z
      .object({
        enabled: z.boolean().prefault(true),
        intervalMs: z.number().min(0).prefault(1000),
        timeoutMs: z.number().min(1).prefault(300000),
      })
      .prefault({}),
    protocolVersion: z.string().optional(),
    tenant: z.string().optional(),
    timeoutMs: z.number().min(1).optional(),
    transformResponse: z.union([z.string(), z.function()]).optional(),
    url: z.string().optional(),
  })
  .passthrough();

export type A2AAgentCard = z.infer<typeof A2AAgentCardSchema>;
export type A2AAgentInterface = z.infer<typeof A2AAgentInterfaceSchema>;
export type A2AArtifact = z.infer<typeof A2AArtifactSchema>;
export type A2AMessage = z.infer<typeof A2AMessageSchema>;
export type A2APart = z.infer<typeof A2APartSchema>;
export type A2AProviderConfig = z.infer<typeof A2AProviderConfigSchema>;
export type A2AStreamResponse = z.infer<typeof A2AStreamResponseSchema>;
export type A2ATask = z.infer<typeof A2ATaskSchema>;

export interface A2AFinalResponse {
  events: unknown[];
  message?: A2AMessage;
  raw: unknown;
  task?: A2ATask;
}
