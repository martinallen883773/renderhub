import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const smtpConfigs = pgTable("smtp_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("Default"),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  username: text("username"),
  password: text("password"),
  fromEmail: text("from_email").notNull(),
  isSecure: boolean("is_secure").default(false),
  domainAuth: text("domain_auth"),
  isActive: boolean("is_active").default(true),
  sentCount: integer("sent_count").default(0),
});

export const emails = pgTable("emails", {
  id: serial("id").primaryKey(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const tagValues = pgTable("tag_values", {
  id: serial("id").primaryKey(),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: 'cascade' }),
  value: text("value").notNull(),
  consumed: boolean("consumed").default(false),
});

export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  fromEmail: text("from_email"),
  customHeaders: text("custom_headers"),
  messageIdDomain: text("message_id_domain"),
  heloHostname: text("helo_hostname"),
  encoding: text("encoding"),
  delaySeconds: integer("delay_seconds"),
  batchSize: integer("batch_size"),
  concurrentConnections: integer("concurrent_connections"),
  shortlinkUrl: text("shortlink_url"),
  tlylinkUrl: text("tlylink_url"),
  companyName: text("company_name"),
});

export const insertSmtpConfigSchema = createInsertSchema(smtpConfigs).omit({ id: true }).extend({
  name: z.string().min(1).default("Default"),
  username: z.string().nullish(),
  password: z.string().nullish(),
  domainAuth: z.string().nullish(),
  isActive: z.boolean().default(true),
});
export const encodingOptions = ['7bit', '8bit', 'base64', 'quoted-printable'] as const;
export type EncodingType = typeof encodingOptions[number];

export const insertEmailSchema = createInsertSchema(emails).omit({ id: true, sentAt: true, status: true, error: true }).extend({
  fromEmail: z.string().optional(),
  encoding: z.enum(encodingOptions).optional().default('7bit'),
  isImportant: z.boolean().optional().default(false),
  sureInbox: z.boolean().optional().default(false),
  customHeaders: z.string().optional(),
  messageIdDomain: z.string().optional(),
  heloHostname: z.string().optional(),
  enablePlainText: z.boolean().optional().default(false),
  plainTextBody: z.string().optional(),
});

export const sendModeOptions = ['single', 'bcc'] as const;
export type SendMode = typeof sendModeOptions[number];

export const bulkEmailSchema = z.object({
  emails: z.string(),
  fromEmail: z.string().optional(),
  fromEmailList: z.array(z.string()).optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  encoding: z.enum(encodingOptions).optional().default('7bit'),
  delaySeconds: z.number().min(0).max(60).default(1),
  batchSize: z.number().min(0).max(1000).optional(),
  concurrentConnections: z.number().min(1).max(50).default(1),
  sendMode: z.enum(sendModeOptions).optional().default('single'),
  bccToEmail: z.string().optional(),
  isImportant: z.boolean().optional().default(false),
  sureInbox: z.boolean().optional().default(false),
  customHeaders: z.string().optional(),
  messageIdDomain: z.string().optional(),
  heloHostname: z.string().optional(),
  enablePlainText: z.boolean().optional().default(false),
  plainTextBody: z.string().optional(),
});

export const insertTagSchema = createInsertSchema(tags).omit({ id: true });
export const insertTagValueSchema = createInsertSchema(tagValues).omit({ id: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true });

export type SmtpConfig = typeof smtpConfigs.$inferSelect;
export type InsertSmtpConfig = z.infer<typeof insertSmtpConfigSchema>;
export type Email = typeof emails.$inferSelect;
export type InsertEmail = z.infer<typeof insertEmailSchema>;
export type BulkEmailRequest = z.infer<typeof bulkEmailSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type TagValue = typeof tagValues.$inferSelect;
export type InsertTagValue = z.infer<typeof insertTagValueSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Chat models for AI integrations
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

// Size history to track used image dimensions and avoid repetition
export const sizeHistory = pgTable("size_history", {
  id: serial("id").primaryKey(),
  imageTagId: integer("image_tag_id").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSizeHistorySchema = createInsertSchema(sizeHistory).omit({ id: true, createdAt: true });
export type SizeHistory = typeof sizeHistory.$inferSelect;
export type InsertSizeHistory = z.infer<typeof insertSizeHistorySchema>;

// Image tags - store images with tag names like {{IMG1}}
export const imageTags = pgTable("image_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  filename: text("filename").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertImageTagSchema = createInsertSchema(imageTags).omit({ id: true, createdAt: true });
export type ImageTag = typeof imageTags.$inferSelect;
export type InsertImageTag = z.infer<typeof insertImageTagSchema>;
