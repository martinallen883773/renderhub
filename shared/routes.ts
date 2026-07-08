import { z } from 'zod';
import { insertSmtpConfigSchema, insertEmailSchema, bulkEmailSchema, insertTagSchema, smtpConfigs, emails, tags, tagValues, type InsertSmtpConfig, type InsertEmail, type BulkEmailRequest, type InsertTag } from './schema';

export const api = {
  smtp: {
    getConfig: {
      method: 'GET' as const,
      path: '/api/smtp/config',
      responses: {
        200: z.custom<typeof smtpConfigs.$inferSelect>(),
        404: z.object({ message: z.string() }),
      },
    },
    saveConfig: {
      method: 'POST' as const,
      path: '/api/smtp/config',
      input: insertSmtpConfigSchema,
      responses: {
        200: z.custom<typeof smtpConfigs.$inferSelect>(),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/smtp/configs',
      responses: {
        200: z.array(z.custom<typeof smtpConfigs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/smtp/configs',
      input: insertSmtpConfigSchema,
      responses: {
        200: z.custom<typeof smtpConfigs.$inferSelect>(),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/smtp/configs/:id',
      input: insertSmtpConfigSchema,
      responses: {
        200: z.custom<typeof smtpConfigs.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/smtp/configs/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
  emails: {
    send: {
      method: 'POST' as const,
      path: '/api/emails/send',
      input: insertEmailSchema,
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        400: z.object({ message: z.string() }),
        500: z.object({ message: z.string() }),
      },
    },
    sendBulk: {
      method: 'POST' as const,
      path: '/api/emails/send-bulk',
      input: bulkEmailSchema,
      responses: {
        200: z.object({ success: z.boolean(), message: z.string(), sent: z.number(), failed: z.number() }),
        400: z.object({ message: z.string() }),
        500: z.object({ message: z.string() }),
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/emails',
      responses: {
        200: z.array(z.custom<typeof emails.$inferSelect>()),
      },
    },
  },
  tags: {
    list: {
      method: 'GET' as const,
      path: '/api/tags',
      responses: {
        200: z.array(z.custom<typeof tags.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tags',
      input: insertTagSchema,
      responses: {
        200: z.custom<typeof tags.$inferSelect>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tags/:id',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    getWithValues: {
      method: 'GET' as const,
      path: '/api/tags/:id',
      responses: {
        200: z.object({
          tag: z.custom<typeof tags.$inferSelect>(),
          values: z.array(z.custom<typeof tagValues.$inferSelect>()),
          counts: z.object({ total: z.number(), remaining: z.number() }),
        }),
        404: z.object({ message: z.string() }),
      },
    },
    addValues: {
      method: 'POST' as const,
      path: '/api/tags/:id/values',
      input: z.object({ text: z.string() }),
      responses: {
        200: z.object({ success: z.boolean(), added: z.number() }),
      },
    },
    reset: {
      method: 'POST' as const,
      path: '/api/tags/:id/reset',
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type { InsertSmtpConfig, InsertEmail, BulkEmailRequest, InsertTag };
