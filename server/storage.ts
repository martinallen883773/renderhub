import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  smtpConfigs, emails, tags, tagValues, emailTemplates, sizeHistory, imageTags,
  type SmtpConfig, type InsertSmtpConfig,
  type Email, type InsertEmail,
  type Tag, type InsertTag,
  type TagValue,
  type EmailTemplate, type InsertEmailTemplate,
  type SizeHistory, type InsertSizeHistory,
  type ImageTag, type InsertImageTag
} from "@shared/schema";

export interface IStorage {
  getAllSmtpConfigs(): Promise<SmtpConfig[]>;
  getActiveSmtpConfigs(): Promise<SmtpConfig[]>;
  getSmtpConfig(id?: number): Promise<SmtpConfig | undefined>;
  createSmtpConfig(config: InsertSmtpConfig): Promise<SmtpConfig>;
  updateSmtpConfig(id: number, config: InsertSmtpConfig): Promise<SmtpConfig>;
  deleteSmtpConfig(id: number): Promise<void>;
  saveSmtpConfig(config: InsertSmtpConfig): Promise<SmtpConfig>;
  incrementSmtpSentCount(id: number): Promise<void>;
  resetAllSmtpSentCounts(): Promise<void>;
  createEmail(email: Pick<InsertEmail, "to" | "subject" | "body">): Promise<Email>;
  getEmails(): Promise<Email[]>;
  updateEmailStatus(id: number, status: string, error?: string): Promise<Email>;
  getAllTags(): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  deleteTag(id: number): Promise<void>;
  addTagValues(tagId: number, values: string[]): Promise<void>;
  getTagValuesCount(tagId: number): Promise<{ total: number; remaining: number }>;
  getNextTagValue(tagId: number): Promise<{ id: number; value: string } | null>;
  markTagValueConsumed(valueId: number): Promise<void>;
  consumeNextTagValue(tagId: number): Promise<string | null>;
  resetTagValues(tagId: number): Promise<void>;
  getTagWithValues(tagId: number): Promise<{ tag: Tag; values: TagValue[] } | null>;
  getRemainingTagValues(tagId: number): Promise<string[]>;
  getAllTemplates(): Promise<EmailTemplate[]>;
  createTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateTemplate(id: number, template: InsertEmailTemplate): Promise<EmailTemplate>;
  deleteTemplate(id: number): Promise<void>;
  getAllSizeHistory(): Promise<SizeHistory[]>;
  createSizeHistory(size: InsertSizeHistory): Promise<SizeHistory>;
  clearSizeHistory(): Promise<void>;
  getSizeHistory(imageTagId: number): Promise<SizeHistory[]>;
  addSizeHistory(imageTagId: number, width: number, height: number): Promise<SizeHistory>;
  getAllImageTags(): Promise<ImageTag[]>;
  createImageTag(imageTag: InsertImageTag): Promise<ImageTag>;
  deleteImageTag(id: number): Promise<void>;
  getImageTagByName(name: string): Promise<ImageTag | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getAllSmtpConfigs(): Promise<SmtpConfig[]> {
    return await db.select().from(smtpConfigs).orderBy(smtpConfigs.id);
  }

  async getActiveSmtpConfigs(): Promise<SmtpConfig[]> {
    return await db.select().from(smtpConfigs).where(eq(smtpConfigs.isActive, true)).orderBy(smtpConfigs.id);
  }

  async getSmtpConfig(id?: number): Promise<SmtpConfig | undefined> {
    if (id) {
      const [config] = await db.select().from(smtpConfigs).where(eq(smtpConfigs.id, id)).limit(1);
      return config;
    }
    const [config] = await db.select().from(smtpConfigs).where(eq(smtpConfigs.isActive, true)).orderBy(smtpConfigs.id).limit(1);
    return config;
  }

  async createSmtpConfig(config: InsertSmtpConfig): Promise<SmtpConfig> {
    const cleanedConfig = {
      ...config,
      username: config.username || null,
      password: config.password || null,
      domainAuth: config.domainAuth || null,
    };
    const [created] = await db.insert(smtpConfigs).values(cleanedConfig).returning();
    return created;
  }

  async updateSmtpConfig(id: number, config: InsertSmtpConfig): Promise<SmtpConfig> {
    const cleanedConfig = {
      ...config,
      username: config.username || null,
      password: config.password || null,
      domainAuth: config.domainAuth || null,
    };
    const [updated] = await db
      .update(smtpConfigs)
      .set(cleanedConfig)
      .where(eq(smtpConfigs.id, id))
      .returning();
    return updated;
  }

  async deleteSmtpConfig(id: number): Promise<void> {
    await db.delete(smtpConfigs).where(eq(smtpConfigs.id, id));
  }

  async incrementSmtpSentCount(id: number): Promise<void> {
    await db.execute(sql`UPDATE smtp_configs SET sent_count = COALESCE(sent_count, 0) + 1 WHERE id = ${id}`);
  }

  async resetAllSmtpSentCounts(): Promise<void> {
    await db.update(smtpConfigs).set({ sentCount: 0 });
  }

  async saveSmtpConfig(config: InsertSmtpConfig): Promise<SmtpConfig> {
    const existing = await this.getSmtpConfig();
    
    const cleanedConfig = {
      ...config,
      username: config.username || null,
      password: config.password || null,
      domainAuth: config.domainAuth || null,
    };
    
    if (existing) {
      const [updated] = await db
        .update(smtpConfigs)
        .set(cleanedConfig)
        .where(eq(smtpConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(smtpConfigs).values(cleanedConfig).returning();
    return created;
  }

  async createEmail(email: Pick<InsertEmail, "to" | "subject" | "body">): Promise<Email> {
    const [created] = await db.insert(emails).values({ ...email, status: 'pending' }).returning();
    return created;
  }

  async getEmails(): Promise<Email[]> {
    return await db.select().from(emails).orderBy(desc(emails.sentAt));
  }

  async updateEmailStatus(id: number, status: string, error?: string): Promise<Email> {
    const [updated] = await db
      .update(emails)
      .set({ status, error })
      .where(eq(emails.id, id))
      .returning();
    return updated;
  }

  async getAllTags(): Promise<Tag[]> {
    return await db.select().from(tags).orderBy(tags.id);
  }

  async createTag(tag: InsertTag): Promise<Tag> {
    const [created] = await db.insert(tags).values(tag).returning();
    return created;
  }

  async deleteTag(id: number): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  async addTagValues(tagId: number, values: string[]): Promise<void> {
    if (values.length === 0) return;
    const insertValues = values.map(value => ({ tagId, value, consumed: false }));
    await db.insert(tagValues).values(insertValues);
  }

  async getTagValuesCount(tagId: number): Promise<{ total: number; remaining: number }> {
    const allValues = await db.select().from(tagValues).where(eq(tagValues.tagId, tagId));
    const remaining = allValues.filter(v => !v.consumed).length;
    return { total: allValues.length, remaining };
  }

  async getNextTagValue(tagId: number): Promise<{ id: number; value: string } | null> {
    const [nextValue] = await db
      .select()
      .from(tagValues)
      .where(and(eq(tagValues.tagId, tagId), eq(tagValues.consumed, false)))
      .limit(1);
    
    if (!nextValue) return null;
    return { id: nextValue.id, value: nextValue.value };
  }

  async markTagValueConsumed(valueId: number): Promise<void> {
    await db
      .update(tagValues)
      .set({ consumed: true })
      .where(eq(tagValues.id, valueId));
  }

  async consumeNextTagValue(tagId: number): Promise<string | null> {
    const next = await this.getNextTagValue(tagId);
    if (!next) return null;
    await this.markTagValueConsumed(next.id);
    return next.value;
  }

  async resetTagValues(tagId: number): Promise<void> {
    await db
      .update(tagValues)
      .set({ consumed: false })
      .where(eq(tagValues.tagId, tagId));
  }

  async getTagWithValues(tagId: number): Promise<{ tag: Tag; values: TagValue[] } | null> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
    if (!tag) return null;
    const values = await db.select().from(tagValues).where(eq(tagValues.tagId, tagId)).orderBy(tagValues.id);
    return { tag, values };
  }

  async getRemainingTagValues(tagId: number): Promise<string[]> {
    const values = await db
      .select({ value: tagValues.value })
      .from(tagValues)
      .where(and(eq(tagValues.tagId, tagId), eq(tagValues.consumed, false)))
      .orderBy(tagValues.id);
    return values.map(v => v.value);
  }

  async getAllTemplates(): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates).orderBy(emailTemplates.id);
  }

  async createTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [created] = await db.insert(emailTemplates).values(template).returning();
    return created;
  }

  async updateTemplate(id: number, template: InsertEmailTemplate): Promise<EmailTemplate> {
    const [updated] = await db.update(emailTemplates).set(template).where(eq(emailTemplates.id, id)).returning();
    return updated;
  }

  async deleteTemplate(id: number): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  async getAllSizeHistory(): Promise<SizeHistory[]> {
    return await db.select().from(sizeHistory).orderBy(desc(sizeHistory.createdAt));
  }

  async createSizeHistory(size: InsertSizeHistory): Promise<SizeHistory> {
    const [created] = await db.insert(sizeHistory).values(size).returning();
    return created;
  }

  async clearSizeHistory(): Promise<void> {
    await db.delete(sizeHistory);
  }

  async getSizeHistory(imageTagId: number): Promise<SizeHistory[]> {
    return await db.select().from(sizeHistory).where(eq(sizeHistory.imageTagId, imageTagId)).orderBy(desc(sizeHistory.createdAt));
  }

  async addSizeHistory(imageTagId: number, width: number, height: number): Promise<SizeHistory> {
    const [created] = await db.insert(sizeHistory).values({ imageTagId, width, height }).returning();
    return created;
  }

  async getAllImageTags(): Promise<ImageTag[]> {
    return await db.select().from(imageTags).orderBy(imageTags.id);
  }

  async createImageTag(imageTag: InsertImageTag): Promise<ImageTag> {
    const [created] = await db.insert(imageTags).values(imageTag).returning();
    return created;
  }

  async deleteImageTag(id: number): Promise<void> {
    await db.delete(imageTags).where(eq(imageTags.id, id));
  }

  async getImageTagByName(name: string): Promise<ImageTag | undefined> {
    const [imageTag] = await db.select().from(imageTags).where(eq(imageTags.name, name)).limit(1);
    return imageTag;
  }
}

export const storage = new DatabaseStorage();
