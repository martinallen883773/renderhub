import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { bulkEmailSchema, insertEmailTemplateSchema, type SmtpConfig } from "@shared/schema";
import { z } from "zod";
import nodemailer from "nodemailer";
import { networkInterfaces } from "os";
import { exec } from "child_process";
import { WebSocketServer, WebSocket } from "ws";
import OpenAI from "openai";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { detectAccount } from "./smtpDetect";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL || undefined,
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function encodeQuotedPrintable(str: string): string {
  return str.replace(/[^\x20-\x7E\r\n]|=/g, (char) => {
    return '=' + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  }).replace(/(.{73})/g, '$1=\r\n');
}

interface InlineImage {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
}

function processInlineImages(htmlBody: string): { processedHtml: string; inlineImages: InlineImage[] } {
  const inlineImages: InlineImage[] = [];
  
  // Find all img tags with simple filenames (not URLs)
  const processedHtml = htmlBody.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, (match, before, src, after) => {
    // Skip if it's a URL (http/https) or data URI or already a cid
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('cid:')) {
      return match;
    }
    
    // Extract just the filename (ignore any path components for security)
    // This means user should reference just "image.png" not "path/to/image.png"
    const rawFilename = src.replace(/^\//, ''); // Remove leading slash if present
    const basename = path.basename(rawFilename); // Get only the filename, ignoring directories
    const filepath = path.join(uploadDir, basename);
    
    if (fs.existsSync(filepath)) {
      const cid = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const ext = path.extname(basename).toLowerCase().replace('.', '');
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'bmp': 'image/bmp',
        'webp': 'image/webp'
      };
      
      inlineImages.push({
        cid,
        filename: basename,
        content: fs.readFileSync(filepath),
        contentType: mimeTypes[ext] || 'application/octet-stream'
      });
      
      return `<img${before} src="cid:${cid}"${after}>`;
    }
    
    // File not found, return original
    return match;
  });
  
  return { processedHtml, inlineImages };
}

function buildRawEmail(options: {
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
  encoding: string;
  messageId?: string;
  isImportant?: boolean;
  inlineImages?: InlineImage[];
  domain?: string | null;
  customHeaders?: string;
  messageIdDomain?: string;
  enablePlainText?: boolean;
  plainTextBody?: string;
}): string {
  const emailDomain = options.domain || 'mailsender.local';
  const extractDomainFromEmail = (from: string): string => {
    const match = from.match(/@([^>]+)/);
    return match ? match[1].trim() : emailDomain;
  };
  const msgIdDomain = options.messageIdDomain && options.messageIdDomain.trim() ? options.messageIdDomain.trim() : extractDomainFromEmail(options.from);
  const msgId = options.messageId || `<${Date.now()}.${Math.random().toString(36).substr(2, 9)}@${msgIdDomain}>`;
  const date = new Date().toUTCString();
  const inlineImages = options.inlineImages || [];
  
  let encodedBody: string;
  let contentTransferEncoding: string;
  
  // Force base64 encoding when we have inline images to ensure proper multipart handling
  const effectiveEncoding = inlineImages.length > 0 ? 'base64' : options.encoding;
  
  switch (effectiveEncoding) {
    case 'base64':
      encodedBody = Buffer.from(options.htmlBody, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n');
      contentTransferEncoding = 'base64';
      break;
    case 'quoted-printable':
      encodedBody = encodeQuotedPrintable(options.htmlBody);
      contentTransferEncoding = 'quoted-printable';
      break;
    case '8bit':
      encodedBody = options.htmlBody;
      contentTransferEncoding = '8bit';
      break;
    case '7bit':
    default:
      encodedBody = options.htmlBody;
      contentTransferEncoding = '7bit';
      break;
  }

  const headers: string[] = [];
  
  // Add custom headers first (at the top of the email headers)
  // Preserve leading whitespace for header continuation lines (RFC 5322)
  if (options.customHeaders && options.customHeaders.trim()) {
    // Replace \r\n with \n first, then split by \n
    const normalizedHeaders = options.customHeaders.replace(/\r\n/g, '\n');
    const customHeaderLines = normalizedHeaders
      .split('\n')
      .filter(line => line.length > 0);  // Keep non-empty lines with their whitespace intact
    
    // Join continuation lines properly (lines starting with space/tab are continuations)
    const processedHeaders: string[] = [];
    for (const line of customHeaderLines) {
      if (line.startsWith(' ') || line.startsWith('\t')) {
        // This is a continuation line - append to previous header
        if (processedHeaders.length > 0) {
          processedHeaders[processedHeaders.length - 1] += '\r\n' + line;
        }
      } else {
        // This is a new header line
        processedHeaders.push(line);
      }
    }
    headers.push(...processedHeaders);
  }
  
  headers.push(
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    `Message-ID: ${msgId}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
  );

  if (options.isImportant) {
    headers.push(`X-Priority: 1 (Highest)`);
    headers.push(`X-MSMail-Priority: High`);
    headers.push(`Importance: High`);
  }

  // Encode plain text body if needed
  let encodedPlainText: string = options.plainTextBody || '';
  if (options.enablePlainText && options.plainTextBody) {
    switch (effectiveEncoding) {
      case 'base64':
        encodedPlainText = Buffer.from(options.plainTextBody, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n');
        break;
      case 'quoted-printable':
        encodedPlainText = encodeQuotedPrintable(options.plainTextBody);
        break;
      default:
        encodedPlainText = options.plainTextBody;
        break;
    }
  }

  // Handle multipart content types
  const hasPlainText = options.enablePlainText && options.plainTextBody;
  
  if (inlineImages.length > 0 || hasPlainText) {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (inlineImages.length > 0 && hasPlainText) {
      // multipart/mixed with multipart/alternative inside for plain+html, then images
      const altBoundary = `----=_Alt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      headers.push(`Content-Type: multipart/related; boundary="${boundary}"`);
      headers.push(``);
      
      const parts = [
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
        ``,
        `--${altBoundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: ${contentTransferEncoding}`,
        ``,
        encodedPlainText,
        `--${altBoundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: ${contentTransferEncoding}`,
        ``,
        encodedBody,
        `--${altBoundary}--`,
      ];
      
      // Add inline images
      for (const img of inlineImages) {
        parts.push(`--${boundary}`);
        parts.push(`Content-Type: ${img.contentType}; name="${img.filename}"`);
        parts.push(`Content-Transfer-Encoding: base64`);
        parts.push(`Content-ID: <${img.cid}>`);
        parts.push(`Content-Disposition: inline; filename="${img.filename}"`);
        parts.push(``);
        parts.push(img.content.toString('base64').replace(/(.{76})/g, '$1\r\n'));
      }
      
      parts.push(`--${boundary}--`);
      headers.push(parts.join('\r\n'));
    } else if (hasPlainText) {
      // multipart/alternative for plain text + HTML
      headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      headers.push(``);
      
      const parts = [
        `--${boundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        `Content-Transfer-Encoding: ${contentTransferEncoding}`,
        ``,
        encodedPlainText,
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: ${contentTransferEncoding}`,
        ``,
        encodedBody,
        `--${boundary}--`,
      ];
      
      headers.push(parts.join('\r\n'));
    } else {
      // Only inline images, use multipart/related
      headers.push(`Content-Type: multipart/related; boundary="${boundary}"`);
      headers.push(``);
      
      const parts = [
        `--${boundary}`,
        `Content-Type: text/html; charset=utf-8`,
        `Content-Transfer-Encoding: ${contentTransferEncoding}`,
        ``,
        encodedBody,
      ];
      
      // Add inline images
      for (const img of inlineImages) {
        parts.push(`--${boundary}`);
        parts.push(`Content-Type: ${img.contentType}; name="${img.filename}"`);
        parts.push(`Content-Transfer-Encoding: base64`);
        parts.push(`Content-ID: <${img.cid}>`);
        parts.push(`Content-Disposition: inline; filename="${img.filename}"`);
        parts.push(``);
        parts.push(img.content.toString('base64').replace(/(.{76})/g, '$1\r\n'));
      }
      
      parts.push(`--${boundary}--`);
      headers.push(parts.join('\r\n'));
    }
  } else {
    headers.push(`Content-Type: text/html; charset=utf-8`);
    headers.push(`Content-Transfer-Encoding: ${contentTransferEncoding}`);
    headers.push(``);
    headers.push(encodedBody);
  }

  return headers.join('\r\n');
}

const sendingClients = new Set<WebSocket>();

// Global flag to stop bulk sending
let stopBulkSending = false;

export function getStopBulkSending() {
  return stopBulkSending;
}

export function setStopBulkSending(value: boolean) {
  stopBulkSending = value;
}

function broadcastLog(message: { type: string; data: any }) {
  const payload = JSON.stringify(message);
  sendingClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  registerChatRoutes(app);
  registerImageRoutes(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/sending-logs" });

  wss.on("connection", (ws) => {
    sendingClients.add(ws);
    ws.on("close", () => {
      sendingClients.delete(ws);
    });
  });

  app.post('/api/restart-server', async (req, res) => {
    try {
      res.json({ success: true, message: "Server will restart in 2 seconds..." });
      setTimeout(() => {
        exec('kill 1', (error: any) => {
          if (error) {
            console.error('Failed to restart server:', error);
          }
        });
      }, 2000);
    } catch (err) {
      res.status(500).json({ message: "Failed to restart server" });
    }
  });

  app.get('/api/server-ip', async (req, res) => {
    try {
      const nets = networkInterfaces();
      const ips: string[] = [];
      
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            ips.push(net.address);
          }
        }
      }
      
      const forwardedFor = req.headers['x-forwarded-for'];
      const realIp = req.headers['x-real-ip'];
      
      let publicIP = null;
      let outboundIPs: string[] = [];
      
      // Try multiple IP detection services to get outbound IPs
      const ipServices = [
        'https://api.ipify.org?format=json',
        'https://api.my-ip.io/v2/ip.json',
        'https://httpbin.org/ip',
      ];
      
      for (const service of ipServices) {
        try {
          const response = await fetch(service, { signal: AbortSignal.timeout(5000) });
          if (response.ok) {
            const data = await response.json();
            const ip = data.ip || data.origin;
            if (ip && !outboundIPs.includes(ip)) {
              outboundIPs.push(ip);
              if (!publicIP) publicIP = ip;
            }
          }
        } catch (e) {
          console.error(`Failed to fetch from ${service}:`, e);
        }
      }
      
      res.json({
        localIPs: ips,
        forwardedFor: forwardedFor || null,
        realIp: realIp || null,
        publicIP: publicIP,
        outboundIPs: outboundIPs,
        hostname: req.hostname,
        note: "For SMTP IP authentication, add ALL outbound IPs to your whitelist. These IPs may change on restart.",
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get IP address" });
    }
  });

  app.get(api.smtp.list.path, async (req, res) => {
    const configs = await storage.getAllSmtpConfigs();
    res.json(configs);
  });

  app.post(api.smtp.create.path, async (req, res) => {
    try {
      const input = api.smtp.create.input.parse(req.body);
      const config = await storage.createSmtpConfig(input);
      res.json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create configuration" });
    }
  });

  app.put('/api/smtp/configs/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const input = api.smtp.update.input.parse(req.body);
      const config = await storage.updateSmtpConfig(id, input);
      res.json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update configuration" });
    }
  });

  app.delete('/api/smtp/configs/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSmtpConfig(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete configuration" });
    }
  });

  // Reset all SMTP sent counts
  app.post('/api/smtp/reset-sent-counts', async (req, res) => {
    try {
      await storage.resetAllSmtpSentCounts();
      res.json({ success: true, message: 'All sent counts have been reset' });
    } catch (err) {
      res.status(500).json({ message: "Failed to reset sent counts" });
    }
  });

  // Test SMTP connection
  app.post('/api/smtp/configs/:id/test', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const configs = await storage.getAllSmtpConfigs();
      const config = configs.find(c => c.id === id);
      
      if (!config) {
        return res.status(404).json({ success: false, message: "SMTP configuration not found" });
      }

      const logs: string[] = [];
      const startTime = Date.now();
      
      logs.push(`[${new Date().toISOString()}] Testing SMTP connection...`);
      logs.push(`[${new Date().toISOString()}] Host: ${config.host}`);
      logs.push(`[${new Date().toISOString()}] Port: ${config.port}`);
      logs.push(`[${new Date().toISOString()}] Username: ${config.username || '(none)'}`);
      logs.push(`[${new Date().toISOString()}] Secure: ${config.isSecure ? 'Yes' : 'No'}`);

      const transportConfig: any = {
        host: config.host,
        port: config.port,
        secure: false,
        requireTLS: true,
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        tls: {
          rejectUnauthorized: false,
        },
      };

      if (config.domainAuth) {
        transportConfig.name = config.domainAuth;
        logs.push(`[${new Date().toISOString()}] HELO Domain: ${config.domainAuth}`);
      }

      if (config.username && config.password) {
        transportConfig.auth = {
          user: config.username,
          pass: config.password,
        };
      }

      const transporter = nodemailer.createTransport(transportConfig);

      try {
        logs.push(`[${new Date().toISOString()}] Connecting to server...`);
        await transporter.verify();
        const duration = Date.now() - startTime;
        logs.push(`[${new Date().toISOString()}] Connection successful!`);
        logs.push(`[${new Date().toISOString()}] Authentication successful!`);
        logs.push(`[${new Date().toISOString()}] Total time: ${duration}ms`);
        
        transporter.close();
        
        res.json({ 
          success: true, 
          message: "SMTP connection successful!", 
          logs 
        });
      } catch (verifyError: any) {
        const duration = Date.now() - startTime;
        logs.push(`[${new Date().toISOString()}] ERROR: ${verifyError.message}`);
        if (verifyError.code) {
          logs.push(`[${new Date().toISOString()}] Error Code: ${verifyError.code}`);
        }
        if (verifyError.command) {
          logs.push(`[${new Date().toISOString()}] Failed Command: ${verifyError.command}`);
        }
        logs.push(`[${new Date().toISOString()}] Total time: ${duration}ms`);
        
        transporter.close();
        
        res.json({ 
          success: false, 
          message: `Connection failed: ${verifyError.message}`, 
          logs 
        });
      }
    } catch (err: any) {
      res.status(500).json({ 
        success: false, 
        message: `Failed to test connection: ${err.message}`,
        logs: [`[${new Date().toISOString()}] ERROR: ${err.message}`]
      });
    }
  });

  // Import webmail accounts (email:password) and auto-detect their SMTP servers
  app.post('/api/smtp/import-webmails', async (req, res) => {
    try {
      const schema = z.object({
        text: z.string().optional(),
        entries: z.array(z.object({ email: z.string(), password: z.string() })).optional(),
        verify: z.boolean().optional().default(true),
      });
      const input = schema.parse(req.body);

      // Build the list of {email, password} from either raw text or structured entries
      let accounts: { email: string; password: string }[] = [];
      if (input.entries && input.entries.length > 0) {
        accounts = input.entries;
      } else if (input.text) {
        for (const rawLine of input.text.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          const sepIdx = line.search(/[:,;\t|]/);
          if (sepIdx === -1) continue;
          const email = line.slice(0, sepIdx).trim();
          const password = line.slice(sepIdx + 1).trim();
          if (!email.includes('@')) continue;
          accounts.push({ email, password });
        }
      }

      if (accounts.length === 0) {
        return res.status(400).json({ message: "No valid email:password lines found" });
      }

      const MAX_ACCOUNTS = 1000;
      let truncated = false;
      if (accounts.length > MAX_ACCOUNTS) {
        accounts = accounts.slice(0, MAX_ACCOUNTS);
        truncated = true;
      }

      // De-duplicate within the request and against existing configs
      const existing = await storage.getAllSmtpConfigs();
      const existingEmails = new Set(
        existing.map(c => (c.username || c.fromEmail || '').trim().toLowerCase()).filter(Boolean)
      );

      const seenInRequest = new Set<string>();
      const deduped: { email: string; password: string }[] = [];
      const skipped: { email: string; reason: string }[] = [];
      for (const acc of accounts) {
        const key = acc.email.trim().toLowerCase();
        if (seenInRequest.has(key)) {
          continue;
        }
        seenInRequest.add(key);
        if (existingEmails.has(key)) {
          skipped.push({ email: acc.email, reason: "Already exists" });
          continue;
        }
        deduped.push(acc);
      }

      const results: any[] = [];
      let created = 0;
      let failed = 0;

      let inactive = 0;

      // Process with limited concurrency so detection/verification doesn't block too long
      const concurrency = 8;
      let cursor = 0;
      async function worker() {
        while (cursor < deduped.length) {
          const idx = cursor++;
          const acc = deduped[idx];
          const detection = await detectAccount(acc.email, acc.password, input.verify);

          if (detection.host && detection.port) {
            // When verifying, accounts that fail auth are still added but kept inactive
            const isActiveVal = input.verify ? detection.verified : true;
            const rowSuccess = input.verify ? detection.verified : true;
            try {
              const config = await storage.createSmtpConfig({
                name: acc.email,
                host: detection.host,
                port: detection.port,
                username: acc.email,
                password: acc.password,
                fromEmail: acc.email,
                isSecure: detection.port === 465,
                domainAuth: null,
                isActive: isActiveVal,
              });
              created++;
              if (!isActiveVal) inactive++;
              results.push({
                email: acc.email,
                success: rowSuccess,
                verified: detection.verified,
                host: detection.host,
                port: detection.port,
                isActive: config.isActive,
                configId: config.id,
                message: rowSuccess
                  ? detection.message
                  : "Added as inactive — login could not be verified",
              });
            } catch (createErr: any) {
              failed++;
              results.push({
                email: acc.email,
                success: false,
                verified: false,
                host: detection.host,
                port: detection.port,
                message: `Failed to save: ${createErr.message}`,
              });
            }
          } else {
            failed++;
            results.push({
              email: acc.email,
              success: false,
              verified: false,
              host: null,
              port: null,
              message: detection.message,
            });
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, deduped.length) }, () => worker()));

      res.json({
        summary: {
          total: accounts.length,
          processed: deduped.length,
          created,
          inactive,
          failed,
          skipped: skipped.length,
          truncated,
        },
        skipped,
        results,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: `Failed to import webmails: ${err.message}` });
    }
  });

  app.get(api.smtp.getConfig.path, async (req, res) => {
    const config = await storage.getSmtpConfig();
    if (!config) {
      return res.status(404).json({ message: "SMTP configuration not found" });
    }
    res.json(config);
  });

  app.post(api.smtp.saveConfig.path, async (req, res) => {
    try {
      const input = api.smtp.saveConfig.input.parse(req.body);
      const config = await storage.saveSmtpConfig(input);
      res.json(config);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to save configuration" });
    }
  });

  app.get(api.emails.list.path, async (req, res) => {
    const emails = await storage.getEmails();
    res.json(emails);
  });

  function createTransporterFromConfig(smtpConfig: SmtpConfig, heloOverride?: string) {
    const transportConfig: any = {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: false,
      requireTLS: true,
      tls: {
        rejectUnauthorized: false,
      },
      logger: true,
      debug: true,
    };

    const heloHostname = heloOverride && heloOverride.trim() ? heloOverride.trim() : smtpConfig.domainAuth;
    if (heloHostname) {
      transportConfig.name = heloHostname;
    }

    if (smtpConfig.username && smtpConfig.password) {
      transportConfig.auth = {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      };
    }

    return { 
      transporter: nodemailer.createTransport(transportConfig), 
      fromEmail: smtpConfig.fromEmail,
      domainAuth: smtpConfig.domainAuth,
      configName: smtpConfig.name,
      configId: smtpConfig.id,
    };
  }

  async function createTransporter(heloOverride?: string) {
    const smtpConfig = await storage.getSmtpConfig();
    if (!smtpConfig) {
      return null;
    }
    return createTransporterFromConfig(smtpConfig, heloOverride);
  }

  app.post(api.emails.send.path, async (req, res) => {
    try {
      const input = api.emails.send.input.parse(req.body);
      
      const transporterData = await createTransporter(input.heloHostname);
      if (!transporterData) {
        return res.status(400).json({ message: "SMTP configuration missing. Please configure SMTP settings first." });
      }

      const userFromEmail = input.fromEmail || transporterData.fromEmail;
      const combinedTemplate = `${input.subject} ${input.body} ${userFromEmail} ${input.customHeaders || ''}`;
      const usedTags = await findTagsInTemplateSingle(combinedTemplate);
      
      const allTags = await storage.getAllTags();
      const tagMap = new Map(allTags.map(t => [t.name, t.id]));
      
      const tagValuesMap = new Map<string, string>();
      
      // Add built-in {{EMAIL}} tag with the recipient's email address
      tagValuesMap.set('{{EMAIL}}', input.to);
      // Add built-in {{FROM}} tag with the sending account's own email address
      tagValuesMap.set('{{FROM}}', (transporterData.fromEmail.match(/<([^>]+)>/)?.[1] || transporterData.fromEmail).trim());
      // Add built-in {{DOMAIN}} tag with the SMTP server's Domain Authentication value
      tagValuesMap.set('{{DOMAIN}}', transporterData.domainAuth || '');
      
      for (const tagName of usedTags) {
        if (tagName === '{{EMAIL}}' || tagName === '{{FROM}}' || tagName === '{{DOMAIN}}') continue; // Skip built-in tags
        if (tagMap.has(tagName)) {
          const tagId = tagMap.get(tagName)!;
          const nextVal = await storage.getNextTagValue(tagId);
          if (nextVal) {
            tagValuesMap.set(tagName, nextVal.value);
            await storage.markTagValueConsumed(nextVal.id);
          }
        }
      }

      const finalSubject = replaceTagsWithValuesSingle(input.subject, tagValuesMap);
      const finalBody = replaceTagsWithValuesSingle(input.body, tagValuesMap);
      const finalFrom = replaceTagsWithValuesSingle(userFromEmail, tagValuesMap);

      const emailLog = await storage.createEmail({
        to: input.to,
        subject: finalSubject,
        body: finalBody,
      });

      try {
        const encoding = input.encoding || '7bit';
        
        // Process inline images
        const { processedHtml, inlineImages } = processInlineImages(finalBody);
        
        const finalCustomHeaders = replaceTagsWithValuesSingle(input.customHeaders || '', tagValuesMap);
        
        const finalPlainText = input.enablePlainText && input.plainTextBody 
          ? replaceTagsWithValuesSingle(input.plainTextBody, tagValuesMap)
          : undefined;
        
        const rawMessage = buildRawEmail({
          from: finalFrom,
          to: input.to,
          subject: finalSubject,
          htmlBody: processedHtml,
          encoding: encoding,
          isImportant: input.isImportant,
          inlineImages: inlineImages,
          domain: transporterData.domainAuth,
          customHeaders: finalCustomHeaders,
          messageIdDomain: input.messageIdDomain,
          enablePlainText: input.enablePlainText,
          plainTextBody: finalPlainText,
        });

        // Extract just the email address from "Name <email>" format
        const extractEmail = (str: string) => {
          const match = str.match(/<([^>]+)>/);
          return match ? match[1] : str;
        };
        
        const mailOptions: any = {
          raw: rawMessage,
          envelope: {
            from: transporterData.domainAuth 
              ? `info@${transporterData.domainAuth}` 
              : extractEmail(finalFrom),
            to: input.to,
          },
        };

        await transporterData.transporter.sendMail(mailOptions);

        await storage.updateEmailStatus(emailLog.id, 'sent');
        await storage.incrementSmtpSentCount(transporterData.configId);
        res.json({ success: true, message: "Email sent successfully" });
      } catch (sendError: any) {
        console.error("Failed to send email:", sendError);
        await storage.updateEmailStatus(emailLog.id, 'failed', sendError.message);
        res.status(500).json({ message: `Failed to send email: ${sendError.message}` });
      }

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  function findTagsInTemplateSingle(template: string): string[] {
    const tagRegex = /\{\{([A-Z0-9_]+)\}\}/g;
    const tags: string[] = [];
    let match;
    while ((match = tagRegex.exec(template)) !== null) {
      const fullTag = `{{${match[1]}}}`;
      if (!tags.includes(fullTag)) {
        tags.push(fullTag);
      }
    }
    return tags;
  }

  function replaceTagsWithValuesSingle(template: string, tagValues: Map<string, string>): string {
    let result = template;
    tagValues.forEach((value, tag) => {
      result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
    });
    return result;
  }

  async function findTagsInTemplate(template: string): Promise<string[]> {
    const tagRegex = /\{\{([A-Z0-9_]+)\}\}/g;
    const tags: string[] = [];
    let match;
    while ((match = tagRegex.exec(template)) !== null) {
      const fullTag = `{{${match[1]}}}`;
      if (!tags.includes(fullTag)) {
        tags.push(fullTag);
      }
    }
    return tags;
  }

  async function replaceTagsWithValues(template: string, tagValues: Map<string, string>): Promise<string> {
    let result = template;
    tagValues.forEach((value, tag) => {
      result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
    });
    return result;
  }

  // Find image tags like {{IMG1}}, {{IMG2}} in template
  function findImageTagsInTemplate(template: string): string[] {
    const imageTagRegex = /\{\{(IMG[A-Z0-9_]+)\}\}/g;
    const tags: string[] = [];
    let match;
    while ((match = imageTagRegex.exec(template)) !== null) {
      const tagName = match[1]; // e.g., "IMG1"
      if (!tags.includes(tagName)) {
        tags.push(tagName);
      }
    }
    return tags;
  }

  // Generate unique image variant with random dimensions and filename
  async function generateUniqueImageVariant(
    imageTagId: number, 
    originalPath: string, 
    mimeType: string
  ): Promise<{ buffer: Buffer; filename: string; contentId: string }> {
    // Generate unique filename with UUID
    const ext = mimeType.split('/')[1] || 'jpg';
    const uniqueFilename = `${uuidv4()}.${ext}`;
    const contentId = uuidv4();

    // Read original image asynchronously
    const originalBuffer = await fs.promises.readFile(originalPath);
    const metadata = await sharp(originalBuffer).metadata();
    
    if (!metadata.width || !metadata.height) {
      // Return original if can't get metadata
      return { buffer: originalBuffer, filename: uniqueFilename, contentId };
    }

    // Generate random dimension variations (95-100% of original)
    // This creates unique fingerprints for each send
    const widthVariation = 0.95 + Math.random() * 0.05;
    const heightVariation = 0.95 + Math.random() * 0.05;
    
    const newWidth = Math.max(1, Math.round(metadata.width * widthVariation));
    const newHeight = Math.max(1, Math.round(metadata.height * heightVariation));

    // Check size history to avoid repeating dimensions
    const existingSizes = await storage.getSizeHistory(imageTagId);
    const existingSizeSet = new Set(existingSizes.map(s => `${s.width}x${s.height}`));
    
    let finalWidth = newWidth;
    let finalHeight = newHeight;
    let attempts = 0;
    
    // Try to find unique dimensions
    while (existingSizeSet.has(`${finalWidth}x${finalHeight}`) && attempts < 10) {
      finalWidth = Math.max(1, Math.round(metadata.width * (0.90 + Math.random() * 0.10)));
      finalHeight = Math.max(1, Math.round(metadata.height * (0.90 + Math.random() * 0.10)));
      attempts++;
    }

    // Record this size in history
    await storage.addSizeHistory(imageTagId, finalWidth, finalHeight);

    // Resize and add random byte padding for uniqueness
    let processedBuffer: Buffer;
    try {
      const sharpInstance = sharp(originalBuffer)
        .resize(finalWidth, finalHeight, { fit: 'fill' });

      // Apply format with slight quality variation for byte uniqueness
      if (mimeType === 'image/png') {
        processedBuffer = await sharpInstance.png({ quality: 90 + Math.floor(Math.random() * 10) }).toBuffer();
      } else if (mimeType === 'image/gif') {
        processedBuffer = await sharpInstance.gif().toBuffer();
      } else if (mimeType === 'image/webp') {
        processedBuffer = await sharpInstance.webp({ quality: 85 + Math.floor(Math.random() * 15) }).toBuffer();
      } else {
        // JPEG with quality variation
        processedBuffer = await sharpInstance.jpeg({ quality: 85 + Math.floor(Math.random() * 15) }).toBuffer();
      }
    } catch (err) {
      console.error('Error processing image variant:', err);
      processedBuffer = originalBuffer;
    }

    return { buffer: processedBuffer, filename: uniqueFilename, contentId };
  }

  // Process image tags in HTML body and return modified HTML + inline image attachments
  async function processImageTags(
    htmlBody: string,
    imageTagNames: string[]
  ): Promise<{ processedHtml: string; imageAttachments: { buffer: Buffer; filename: string; contentId: string; mimeType: string }[] }> {
    const imageAttachments: { buffer: Buffer; filename: string; contentId: string; mimeType: string }[] = [];
    let processedHtml = htmlBody;

    // Get all image tags from database
    const allImageTags = await storage.getAllImageTags();
    const imageTagMap = new Map(allImageTags.map(t => [t.name, t]));

    for (const tagName of imageTagNames) {
      const imageTag = imageTagMap.get(`{{${tagName}}}`);
      if (!imageTag) {
        console.warn(`Image tag {{${tagName}}} not found in database`);
        continue;
      }

      const imagePath = path.join(process.cwd(), 'image_tags', imageTag.filename);
      if (!fs.existsSync(imagePath)) {
        console.warn(`Image file not found for tag {{${tagName}}}: ${imagePath}`);
        continue;
      }

      // Generate unique variant
      const variant = await generateUniqueImageVariant(imageTag.id, imagePath, imageTag.mimeType);
      
      imageAttachments.push({
        buffer: variant.buffer,
        filename: variant.filename,
        contentId: variant.contentId,
        mimeType: imageTag.mimeType,
      });

      // Replace tag with CID reference
      const cidReference = `<img src="cid:${variant.contentId}" alt="${tagName}" />`;
      const tagPattern = new RegExp(`\\{\\{${tagName}\\}\\}`, 'g');
      processedHtml = processedHtml.replace(tagPattern, cidReference);
    }

    return { processedHtml, imageAttachments };
  }

  app.post(api.emails.sendBulk.path, async (req, res) => {
    try {
      const input = bulkEmailSchema.parse(req.body);
      
      const activeConfigs = await storage.getActiveSmtpConfigs();
      if (activeConfigs.length === 0) {
        return res.status(400).json({ message: "No active SMTP configurations. Please add and activate at least one SMTP server." });
      }

      const emailList = input.emails
        .split(/[\n,]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0 && e.includes('@'));

      if (emailList.length === 0) {
        return res.status(400).json({ message: "No valid emails found" });
      }

      // ===== BCC MODE =====
      // Group recipients into batches. Each batch is sent as ONE message:
      //   - To header = the designated "To" email (visible)
      //   - BCC = all recipients in the batch (hidden, carried only in the SMTP envelope)
      // Batch Size = number of BCC recipients per message.
      // Batches are distributed round-robin across active SMTP servers and sent
      // with `concurrentConnections` parallel connections.
      if ((input.sendMode || 'single') === 'bcc') {
        const bccUserFromEmail = input.fromEmail || "";
        const bccFromEmailList = input.fromEmailList && input.fromEmailList.length > 0 ? input.fromEmailList : null;

        // Build batches
        const bccBatchSize = input.batchSize && input.batchSize > 0 ? input.batchSize : emailList.length;
        const batches: string[][] = [];
        for (let i = 0; i < emailList.length; i += bccBatchSize) {
          batches.push(emailList.slice(i, i + bccBatchSize));
        }
        const concurrency = input.concurrentConnections || 1;

        const extractEmailAddr = (str: string) => {
          const match = str.match(/<([^>]+)>/);
          return match ? match[1] : str.trim();
        };

        // Validate tag availability against the NUMBER OF MESSAGES (one value set per batch)
        const allSmtpFromEmails = activeConfigs.map(c => c.fromEmail).join(' ');
        const bccFromListStr = bccFromEmailList ? bccFromEmailList.join(' ') : '';
        const combinedTemplate = `${input.subject} ${input.body} ${bccUserFromEmail} ${allSmtpFromEmails} ${bccFromListStr} ${input.customHeaders || ''}`;
        const usedTags = await findTagsInTemplate(combinedTemplate);
        const allTags = await storage.getAllTags();
        const tagMap = new Map(allTags.map(t => [t.name, t.id]));

        for (const tagName of usedTags) {
          if (tagName === '{{EMAIL}}' || tagName === '{{FROM}}' || tagName === '{{DOMAIN}}') continue;
          if (/^\{\{IMG[A-Z0-9_]+\}\}$/.test(tagName)) continue;
          if (!tagMap.has(tagName)) {
            return res.status(400).json({ message: `Tag ${tagName} not found. Create it in Settings first.` });
          }
          const tagId = tagMap.get(tagName)!;
          const counts = await storage.getTagValuesCount(tagId);
          if (counts.remaining < batches.length) {
            return res.status(400).json({
              message: `Not enough values for tag ${tagName}. Need ${batches.length} (one per BCC message), have ${counts.remaining}.`
            });
          }
        }

        // Pre-reserve tag values: one map per batch (message)
        const batchTagValues: Map<string, string>[] = [];
        for (let b = 0; b < batches.length; b++) {
          const valuesMap = new Map<string, string>();
          for (const tagName of usedTags) {
            if (tagName === '{{EMAIL}}' || tagName === '{{FROM}}' || tagName === '{{DOMAIN}}') continue;
            if (/^\{\{IMG[A-Z0-9_]+\}\}$/.test(tagName)) continue;
            const tagId = tagMap.get(tagName)!;
            const nextVal = await storage.getNextTagValue(tagId);
            if (nextVal) {
              valuesMap.set(tagName, nextVal.value);
              await storage.markTagValueConsumed(nextVal.id);
            }
          }
          // {{EMAIL}} resolves to the visible To address only.
          // Never map it to a hidden BCC recipient — that would leak a recipient
          // to everyone in the batch if the template uses {{EMAIL}}.
          const toForEmailTag = (input.bccToEmail && input.bccToEmail.trim())
            ? input.bccToEmail.trim()
            : 'undisclosed-recipients';
          valuesMap.set('{{EMAIL}}', toForEmailTag);
          batchTagValues.push(valuesMap);
        }

        stopBulkSending = false;

        const serverSentCounts: Map<number, number> = new Map();
        activeConfigs.forEach(c => serverSentCounts.set(c.id, c.sentCount || 0));

        broadcastLog({ type: 'start', data: { total: emailList.length, batchSize: bccBatchSize, smtpCount: activeConfigs.length, tagsUsed: usedTags, sendMode: 'bcc', messageCount: batches.length, concurrentConnections: concurrency } });

        const transportersByServer = activeConfigs.map(config => {
          const t = createTransporterFromConfig(config, input.heloHostname);
          return { serverId: config.id, serverName: config.name, transporter: t.transporter, fromEmail: t.fromEmail, domainAuth: t.domainAuth };
        });

        let sent = 0;
        let failed = 0;
        let bccRateLimited = false;

        async function sendBccBatch(batchIdx: number) {
          if (stopBulkSending) return;
          const batch = batches[batchIdx];
          const tagValuesMap = batchTagValues[batchIdx];
          const serverData = transportersByServer[batchIdx % transportersByServer.length];

          const visibleTo = (input.bccToEmail && input.bccToEmail.trim())
            ? input.bccToEmail.trim()
            : 'undisclosed-recipients:;';

          tagValuesMap.set('{{FROM}}', (serverData.fromEmail.match(/<([^>]+)>/)?.[1] || serverData.fromEmail).trim());
          tagValuesMap.set('{{DOMAIN}}', serverData.domainAuth || '');
          const finalSubject = await replaceTagsWithValues(input.subject, tagValuesMap);
          const finalBody = await replaceTagsWithValues(input.body, tagValuesMap);
          const fromTemplate = bccFromEmailList
            ? bccFromEmailList[batchIdx % bccFromEmailList.length]
            : (bccUserFromEmail || serverData.fromEmail);
          const finalFrom = await replaceTagsWithValues(fromTemplate, tagValuesMap);

          broadcastLog({ type: 'sending', data: { index: batchIdx + 1, total: batches.length, email: `${batch.length} BCC recipients`, smtp: serverData.serverName, smtpId: serverData.serverId, bcc: true } });

          // All recipients that should actually receive the message (envelope only)
          const envelopeRecipients = [...batch];
          if (input.bccToEmail && input.bccToEmail.trim()) {
            const toAddr = extractEmailAddr(input.bccToEmail);
            if (!envelopeRecipients.some(r => r.toLowerCase() === toAddr.toLowerCase())) {
              envelopeRecipients.push(toAddr);
            }
          }

          // Persist one log row representing this message
          const emailLog = await storage.createEmail({
            to: `${visibleTo} (BCC: ${batch.length})`,
            subject: finalSubject,
            body: finalBody,
          });

          try {
            const imageTagNames = findImageTagsInTemplate(finalBody);
            let bodyWithImageTags = finalBody;
            let imageTagAttachments: { buffer: Buffer; filename: string; contentId: string; mimeType: string }[] = [];
            if (imageTagNames.length > 0) {
              const imageTagResult = await processImageTags(finalBody, imageTagNames);
              bodyWithImageTags = imageTagResult.processedHtml;
              imageTagAttachments = imageTagResult.imageAttachments;
            }

            const { processedHtml, inlineImages } = processInlineImages(bodyWithImageTags);
            const finalCustomHeaders = await replaceTagsWithValues(input.customHeaders || '', tagValuesMap);
            const finalPlainText = input.enablePlainText && input.plainTextBody
              ? await replaceTagsWithValues(input.plainTextBody, tagValuesMap)
              : undefined;

            const allInlineImages = [
              ...inlineImages,
              ...imageTagAttachments.map(img => ({ cid: img.contentId, content: img.buffer, filename: img.filename, contentType: img.mimeType })),
            ];

            const rawMessage = buildRawEmail({
              from: finalFrom,
              to: visibleTo,
              subject: finalSubject,
              htmlBody: processedHtml,
              encoding: input.encoding || '7bit',
              isImportant: input.isImportant,
              inlineImages: allInlineImages,
              domain: serverData.domainAuth,
              customHeaders: finalCustomHeaders,
              messageIdDomain: input.messageIdDomain,
              enablePlainText: input.enablePlainText,
              plainTextBody: finalPlainText,
            });

            await serverData.transporter.sendMail({
              raw: rawMessage,
              envelope: {
                from: serverData.domainAuth ? `info@${serverData.domainAuth}` : extractEmailAddr(finalFrom),
                to: envelopeRecipients,
              },
            });

            await storage.updateEmailStatus(emailLog.id, 'sent');
            // Count each recipient as a sent email and remove it from the UI list
            for (const r of batch) {
              await storage.incrementSmtpSentCount(serverData.serverId);
              const newCount = (serverSentCounts.get(serverData.serverId) || 0) + 1;
              serverSentCounts.set(serverData.serverId, newCount);
              sent++;
              broadcastLog({ type: 'sent', data: { index: sent, email: r, sent, failed, smtpId: serverData.serverId, smtpName: serverData.serverName, smtpSentCount: newCount, bcc: true } });
            }

            if (input.delaySeconds > 0) {
              await sleep(input.delaySeconds * 1000);
            }
          } catch (sendError: any) {
            console.error(`BCC batch ${batchIdx + 1} failed:`, sendError.message);
            await storage.updateEmailStatus(emailLog.id, 'failed', sendError.message);
            const errorLower = sendError.message.toLowerCase();
            const isRateLimited = errorLower.includes('ratelimit') || errorLower.includes('rate limit') || errorLower.includes('limitation') || errorLower.includes('rate-limit');
            for (const r of batch) {
              failed++;
              broadcastLog({ type: 'failed', data: { index: batchIdx + 1, email: r, error: sendError.message, sent, failed, ratelimited: isRateLimited, smtpId: serverData.serverId, smtpName: serverData.serverName, bcc: true } });
            }
            if (isRateLimited) {
              bccRateLimited = true;
              stopBulkSending = true;
              broadcastLog({ type: 'ratelimit_stop', data: { message: 'Rate limit detected! Stopping all sending...', error: sendError.message } });
            }
          }
        }

        // Run batches with concurrency limit
        let nextBatch = 0;
        async function bccWorker() {
          while (nextBatch < batches.length && !stopBulkSending) {
            const current = nextBatch++;
            await sendBccBatch(current);
          }
        }
        await Promise.all(Array(Math.min(concurrency, batches.length)).fill(null).map(() => bccWorker()));

        transportersByServer.forEach(t => t.transporter.close());

        if (stopBulkSending) {
          if (bccRateLimited) {
            broadcastLog({ type: 'complete', data: { sent, failed, total: emailList.length, ratelimited: true, message: 'Sending stopped - rate limit detected' } });
          } else {
            broadcastLog({ type: 'stopped', data: { message: 'Sending stopped by user', sent, failed, remaining: emailList.length - sent - failed } });
            broadcastLog({ type: 'complete', data: { sent, failed, total: emailList.length, stoppedByUser: true, message: 'Sending stopped by user' } });
          }
        } else {
          broadcastLog({ type: 'complete', data: { sent, failed, total: emailList.length } });
        }

        return res.json({ success: true, message: `BCC send complete: ${sent} sent, ${failed} failed across ${batches.length} message(s)`, sent, failed });
      }
      // ===== END BCC MODE =====

      const userFromEmail = input.fromEmail || "";
      const fromEmailList = input.fromEmailList && input.fromEmailList.length > 0 ? input.fromEmailList : null;
      const allSmtpFromEmails = activeConfigs.map(c => c.fromEmail).join(' ');
      const fromEmailListStr = fromEmailList ? fromEmailList.join(' ') : '';
      const combinedTemplate = `${input.subject} ${input.body} ${userFromEmail} ${allSmtpFromEmails} ${fromEmailListStr} ${input.customHeaders || ''}`;
      const usedTags = await findTagsInTemplate(combinedTemplate);
      
      const allTags = await storage.getAllTags();
      const tagMap = new Map(allTags.map(t => [t.name, t.id]));
      
      for (const tagName of usedTags) {
        if (tagName === '{{EMAIL}}' || tagName === '{{FROM}}' || tagName === '{{DOMAIN}}') continue; // Skip built-in tags
        // Skip image tags - they are handled separately by processImageTags
        if (/^\{\{IMG[A-Z0-9_]+\}\}$/.test(tagName)) continue;
        if (!tagMap.has(tagName)) {
          return res.status(400).json({ message: `Tag ${tagName} not found. Create it in Settings first.` });
        }
        const tagId = tagMap.get(tagName)!;
        const counts = await storage.getTagValuesCount(tagId);
        if (counts.remaining < emailList.length) {
          return res.status(400).json({ 
            message: `Not enough values for tag ${tagName}. Need ${emailList.length}, have ${counts.remaining}.` 
          });
        }
      }

      // Track if user explicitly set batch size for server rotation logic
      const userSetBatchSize = input.batchSize && input.batchSize > 0;
      const batchSize = userSetBatchSize ? input.batchSize! : emailList.length;
      const concurrency = input.concurrentConnections || 1;

      // Reset stop flag at start
      stopBulkSending = false;
      
      // Track sent counts per server in memory for real-time updates (cumulative from DB)
      const serverSentCounts: Map<number, number> = new Map();
      activeConfigs.forEach(c => serverSentCounts.set(c.id, c.sentCount || 0));
      
      broadcastLog({ type: 'start', data: { total: emailList.length, batchSize, smtpCount: activeConfigs.length, tagsUsed: usedTags, sureInbox: input.sureInbox, concurrentConnections: concurrency } });

      let sent = 0;
      let failed = 0;
      let stoppedBySureInbox = false;
      let stoppedByUser = false;
      let lastUsedServerIndex = -1; // Track server switches for logging

      // Pre-reserve all tag values to avoid race conditions in concurrent mode
      const allReservedValues: Map<string, string>[] = [];
      for (let i = 0; i < emailList.length; i++) {
        const reservedValues: { tagName: string; valueId: number; value: string }[] = [];
        for (const tagName of usedTags) {
          if (tagName === '{{EMAIL}}' || tagName === '{{FROM}}' || tagName === '{{DOMAIN}}') continue; // Skip built-in tags
          const tagId = tagMap.get(tagName)!;
          const nextVal = await storage.getNextTagValue(tagId);
          if (nextVal) {
            reservedValues.push({ tagName, valueId: nextVal.id, value: nextVal.value });
            await storage.markTagValueConsumed(nextVal.id);
          }
        }
        const valuesMap = new Map(reservedValues.map(v => [v.tagName, v.value]));
        // Add built-in {{EMAIL}} tag with the recipient's email address
        valuesMap.set('{{EMAIL}}', emailList[i]);
        allReservedValues.push(valuesMap);
      }

      // Create transporters for ALL active SMTP servers
      // Each server gets 'concurrency' number of connections
      const transportersByServer: { serverId: number; serverName: string; transporter: any; fromEmail: string; domainAuth: string | null }[] = [];
      for (const config of activeConfigs) {
        const t = createTransporterFromConfig(config, input.heloHostname);
        transportersByServer.push({
          serverId: config.id,
          serverName: config.name,
          transporter: t.transporter,
          fromEmail: t.fromEmail,
          domainAuth: t.domainAuth
        });
      }

      // Sure Inbox: test first email synchronously
      if (input.sureInbox && emailList.length > 0) {
        const email = emailList[0];
        const tagValuesMap = allReservedValues[0];
        const serverData = transportersByServer[0];
        
        broadcastLog({ type: 'sure_inbox_test', data: { email, message: 'Testing first email delivery...' } });
        
        tagValuesMap.set('{{FROM}}', (serverData.fromEmail.match(/<([^>]+)>/)?.[1] || serverData.fromEmail).trim());
        tagValuesMap.set('{{DOMAIN}}', serverData.domainAuth || '');
        const finalSubject = await replaceTagsWithValues(input.subject, tagValuesMap);
        const finalBody = await replaceTagsWithValues(input.body, tagValuesMap);
        const fromTemplate = fromEmailList ? fromEmailList[0] : (userFromEmail || serverData.fromEmail);
        const finalFrom = await replaceTagsWithValues(fromTemplate, tagValuesMap);

        const emailLog = await storage.createEmail({
          to: email,
          subject: finalSubject,
          body: finalBody,
        });

        try {
          // Process image tags first for SureInbox test
          const imageTagNames = findImageTagsInTemplate(finalBody);
          let bodyWithImageTags = finalBody;
          let imageTagAttachments: { buffer: Buffer; filename: string; contentId: string; mimeType: string }[] = [];
          
          if (imageTagNames.length > 0) {
            const imageTagResult = await processImageTags(finalBody, imageTagNames);
            bodyWithImageTags = imageTagResult.processedHtml;
            imageTagAttachments = imageTagResult.imageAttachments;
          }
          
          const { processedHtml, inlineImages } = processInlineImages(bodyWithImageTags);
          const finalCustomHeaders = await replaceTagsWithValues(input.customHeaders || '', tagValuesMap);
          const finalPlainText = input.enablePlainText && input.plainTextBody 
            ? await replaceTagsWithValues(input.plainTextBody, tagValuesMap)
            : undefined;
          
          // Combine regular inline images with image tag attachments
          const allInlineImages = [
            ...inlineImages,
            ...imageTagAttachments.map(img => ({
              cid: img.contentId,
              content: img.buffer,
              filename: img.filename,
              contentType: img.mimeType,
            }))
          ];
          
          const rawMessage = buildRawEmail({
            from: finalFrom,
            to: email,
            subject: finalSubject,
            htmlBody: processedHtml,
            encoding: input.encoding || '7bit',
            isImportant: input.isImportant,
            inlineImages: allInlineImages,
            domain: serverData.domainAuth,
            customHeaders: finalCustomHeaders,
            messageIdDomain: input.messageIdDomain,
            enablePlainText: input.enablePlainText,
            plainTextBody: finalPlainText,
          });

          const extractEmailAddr = (str: string) => {
            const match = str.match(/<([^>]+)>/);
            return match ? match[1] : str;
          };

          await serverData.transporter.sendMail({
            raw: rawMessage,
            envelope: {
              from: serverData.domainAuth ? `info@${serverData.domainAuth}` : extractEmailAddr(finalFrom),
              to: email,
            },
          });
          
          await storage.updateEmailStatus(emailLog.id, 'sent');
          await storage.incrementSmtpSentCount(serverData.serverId);
          const newCount = (serverSentCounts.get(serverData.serverId) || 0) + 1;
          serverSentCounts.set(serverData.serverId, newCount);
          sent++;
          broadcastLog({ type: 'sure_inbox_success', data: { email, message: 'First email delivered successfully! Continuing with remaining emails...' } });
          broadcastLog({ type: 'sent', data: { index: 1, email, sent, failed, smtpId: serverData.serverId, smtpName: serverData.serverName, smtpSentCount: newCount } });
        } catch (sendError: any) {
          await storage.updateEmailStatus(emailLog.id, 'failed', sendError.message);
          failed++;
          stoppedBySureInbox = true;
          broadcastLog({ type: 'sure_inbox_failed', data: { email, error: sendError.message, message: 'SURE INBOX: First email failed! Stopping all sending.' } });
          
          // Close all transporters
          transportersByServer.forEach(t => t.transporter.close());
          broadcastLog({ type: 'complete', data: { sent, failed, total: emailList.length, stoppedBySureInbox: true, message: 'Sending stopped - first email failed delivery test' } });
          return res.json({ success: true, message: `Bulk send stopped: ${sent} sent, ${failed} failed`, sent, failed });
        }
      }

      const startIndex = input.sureInbox ? 1 : 0;
      const remainingEmails = emailList.slice(startIndex);
      const remainingTagValues = allReservedValues.slice(startIndex);

      // Simple concurrency limiter without external dependencies
      async function limitConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
        const results: T[] = [];
        let index = 0;
        
        async function runNext(): Promise<void> {
          while (index < tasks.length) {
            const currentIndex = index++;
            try {
              results[currentIndex] = await tasks[currentIndex]();
            } catch (err) {
              // Error already handled inside task
            }
          }
        }
        
        const workers = Array(Math.min(limit, tasks.length)).fill(null).map(() => runNext());
        await Promise.all(workers);
        return results;
      }

      // Queue for retrying emails that fail due to "too many sessions"
      const retryQueue: { email: string; idx: number; tagValuesMap: Map<string, string>; retryCount: number; emailLogId?: number }[] = [];
      const MAX_RETRIES = 3;
      const RETRY_DELAY_MS = 5000;

      // Helper to check if error is retryable (session-related)
      const isSessionError = (errorMsg: string) => {
        const lower = errorMsg.toLowerCase();
        return lower.includes('too many sessions') || 
               lower.includes('connection limit') ||
               lower.includes('too many connections') ||
               lower.includes('session limit');
      };

      // Helper to send a single email
      async function sendSingleEmail(
        email: string, 
        actualIndex: number, 
        tagValuesMap: Map<string, string>,
        retryAttempt: number = 0,
        existingEmailLogId?: number
      ): Promise<{ email: string; success: boolean; error?: string; isInvalidEmail?: boolean; needsRetry?: boolean; emailLogId?: number }> {
        // Check stop flag
        if (stopBulkSending || stoppedBySureInbox) {
          return { email, success: false };
        }

        // Server selection logic:
        // - If user set batchSize: batch-based selection (each server sends batchSize emails before moving to next)
        // - If no batchSize: round-robin distribution across all servers
        let serverIndex: number;
        if (userSetBatchSize) {
          // Batch-based: emails 0-(batchSize-1) go to server 0, batchSize-(2*batchSize-1) to server 1, etc.
          serverIndex = Math.floor(actualIndex / batchSize) % transportersByServer.length;
        } else {
          // Round-robin: distribute emails evenly across all servers
          serverIndex = actualIndex % transportersByServer.length;
        }
        const serverData = transportersByServer[serverIndex];

        // Log when switching to a new server (only for batch-based mode to show clear transitions)
        if (userSetBatchSize && serverIndex !== lastUsedServerIndex && retryAttempt === 0) {
          lastUsedServerIndex = serverIndex;
          broadcastLog({ 
            type: 'smtp_switch', 
            data: { 
              configName: serverData.serverName, 
              serverId: serverData.serverId, 
              batchSize: batchSize
            } 
          });
        }

        tagValuesMap.set('{{FROM}}', (serverData.fromEmail.match(/<([^>]+)>/)?.[1] || serverData.fromEmail).trim());
        tagValuesMap.set('{{DOMAIN}}', serverData.domainAuth || '');
        const finalSubject = await replaceTagsWithValues(input.subject, tagValuesMap);
        const finalBody = await replaceTagsWithValues(input.body, tagValuesMap);
        const fromTemplate = fromEmailList 
          ? fromEmailList[actualIndex % fromEmailList.length] 
          : (userFromEmail || serverData.fromEmail);
        const finalFrom = await replaceTagsWithValues(fromTemplate, tagValuesMap);

        // Only create email log on first attempt, reuse existing ID for retries
        let emailLogId = existingEmailLogId;
        if (retryAttempt === 0) {
          const emailLog = await storage.createEmail({
            to: email,
            subject: finalSubject,
            body: finalBody,
          });
          emailLogId = emailLog.id;
        }

        const retryLabel = retryAttempt > 0 ? ` (retry ${retryAttempt})` : '';
        broadcastLog({ type: 'sending', data: { index: actualIndex + 1, total: emailList.length, email, smtp: serverData.serverName, smtpId: serverData.serverId, tagsReplaced: tagValuesMap.size, retry: retryAttempt } });

        try {
          // Process image tags first - generate unique variants for each email
          const imageTagNames = findImageTagsInTemplate(finalBody);
          let bodyWithImageTags = finalBody;
          let imageTagAttachments: { buffer: Buffer; filename: string; contentId: string; mimeType: string }[] = [];
          
          if (imageTagNames.length > 0) {
            const imageTagResult = await processImageTags(finalBody, imageTagNames);
            bodyWithImageTags = imageTagResult.processedHtml;
            imageTagAttachments = imageTagResult.imageAttachments;
          }
          
          const { processedHtml, inlineImages } = processInlineImages(bodyWithImageTags);
          const finalCustomHeaders = await replaceTagsWithValues(input.customHeaders || '', tagValuesMap);
          const finalPlainText = input.enablePlainText && input.plainTextBody 
            ? await replaceTagsWithValues(input.plainTextBody, tagValuesMap)
            : undefined;
          
          // Combine regular inline images with image tag attachments
          const allInlineImages = [
            ...inlineImages,
            ...imageTagAttachments.map(img => ({
              cid: img.contentId,
              content: img.buffer,
              filename: img.filename,
              contentType: img.mimeType,
            }))
          ];
          
          const rawMessage = buildRawEmail({
            from: finalFrom,
            to: email,
            subject: finalSubject,
            htmlBody: processedHtml,
            encoding: input.encoding || '7bit',
            isImportant: input.isImportant,
            inlineImages: allInlineImages,
            domain: serverData.domainAuth,
            customHeaders: finalCustomHeaders,
            messageIdDomain: input.messageIdDomain,
            enablePlainText: input.enablePlainText,
            plainTextBody: finalPlainText,
          });

          const extractEmailAddr = (str: string) => {
            const match = str.match(/<([^>]+)>/);
            return match ? match[1] : str;
          };

          await serverData.transporter.sendMail({
            raw: rawMessage,
            envelope: {
              from: serverData.domainAuth ? `info@${serverData.domainAuth}` : extractEmailAddr(finalFrom),
              to: email,
            },
          });

          if (emailLogId) {
            await storage.updateEmailStatus(emailLogId, 'sent');
          }
          await storage.incrementSmtpSentCount(serverData.serverId);
          const newCount = (serverSentCounts.get(serverData.serverId) || 0) + 1;
          serverSentCounts.set(serverData.serverId, newCount);
          sent++;
          broadcastLog({ type: 'sent', data: { index: actualIndex + 1, email, sent, failed, smtpId: serverData.serverId, smtpName: serverData.serverName, smtpSentCount: newCount } });

          // Apply delay between sends
          if (input.delaySeconds > 0) {
            await sleep(input.delaySeconds * 1000);
          }

          return { email, success: true, emailLogId };
        } catch (sendError: any) {
          console.error(`Failed to send to ${email}${retryLabel}:`, sendError.message);
          
          const errorLower = sendError.message.toLowerCase();
          const isRateLimited = errorLower.includes('ratelimit') || errorLower.includes('rate limit') || errorLower.includes('limitation') || errorLower.includes('rate-limit');
          const isInvalidEmail = errorLower.includes('account closed') || 
                                 errorLower.includes('not our customer') || 
                                 errorLower.includes('mailbox not found') ||
                                 errorLower.includes('user unknown') ||
                                 errorLower.includes('recipient rejected') ||
                                 errorLower.includes('does not exist');
          const isRetryableSessionError = isSessionError(sendError.message);
          
          // If it's a session error and we haven't exceeded retries, queue for retry
          if (isRetryableSessionError && retryAttempt < MAX_RETRIES) {
            broadcastLog({ type: 'retry_queued', data: { index: actualIndex + 1, email, error: sendError.message, retryAttempt: retryAttempt + 1, smtpId: serverData.serverId, smtpName: serverData.serverName } });
            return { email, success: false, error: sendError.message, needsRetry: true, emailLogId };
          }
          
          // Permanent failure
          if (emailLogId) {
            await storage.updateEmailStatus(emailLogId, 'failed', sendError.message);
          }
          failed++;
          
          if (isRateLimited) {
            stopBulkSending = true;
            broadcastLog({ type: 'failed', data: { index: actualIndex + 1, email, error: sendError.message, sent, failed, ratelimited: true, smtpId: serverData.serverId, smtpName: serverData.serverName } });
            broadcastLog({ type: 'ratelimit_stop', data: { message: 'Rate limit detected! Stopping all sending...', email, error: sendError.message } });
          } else {
            broadcastLog({ type: 'failed', data: { index: actualIndex + 1, email, error: sendError.message, sent, failed, invalidEmail: isInvalidEmail, smtpId: serverData.serverId, smtpName: serverData.serverName } });
          }
          
          return { email, success: false, error: sendError.message, isInvalidEmail, emailLogId };
        }
      }

      // Create tasks for remaining emails with round-robin distribution across ALL servers
      const tasks = remainingEmails.map((email, idx) => {
        return async () => {
          const actualIndex = startIndex + idx;
          const tagValuesMap = remainingTagValues[idx];
          
          const result = await sendSingleEmail(email, actualIndex, tagValuesMap, 0);
          
          // If needs retry, add to retry queue with emailLogId
          if (result.needsRetry) {
            retryQueue.push({ email, idx, tagValuesMap, retryCount: 1, emailLogId: result.emailLogId });
          }
          
          return result;
        };
      });

      // Process with concurrency limit (concurrency = number of concurrent connections across all servers)
      await limitConcurrency(tasks, concurrency);
      
      // Process retry queue with delays
      while (retryQueue.length > 0 && !stopBulkSending && !stoppedBySureInbox) {
        broadcastLog({ type: 'retry_batch', data: { count: retryQueue.length, message: `Retrying ${retryQueue.length} emails after session errors...` } });
        
        // Wait before retrying to allow sessions to free up
        await sleep(RETRY_DELAY_MS);
        
        const currentBatch = [...retryQueue];
        retryQueue.length = 0; // Clear queue
        
        for (const item of currentBatch) {
          if (stopBulkSending || stoppedBySureInbox) break;
          
          const actualIndex = startIndex + item.idx;
          const result = await sendSingleEmail(item.email, actualIndex, item.tagValuesMap, item.retryCount, item.emailLogId);
          
          // If still needs retry and under max retries
          if (result.needsRetry && item.retryCount < MAX_RETRIES) {
            retryQueue.push({ ...item, retryCount: item.retryCount + 1, emailLogId: result.emailLogId });
          } else if (result.needsRetry) {
            // Max retries exceeded, mark as permanently failed
            if (result.emailLogId) {
              await storage.updateEmailStatus(result.emailLogId, 'failed', 'Max retries exceeded for session error');
            }
            failed++;
            broadcastLog({ type: 'failed', data: { index: actualIndex + 1, email: item.email, error: 'Max retries exceeded for session error', sent, failed } });
          }
        }
      }

      // Check if stopped by user
      if (stopBulkSending) {
        stoppedByUser = true;
        broadcastLog({ type: 'stopped', data: { message: 'Sending stopped by user', sent, failed, remaining: emailList.length - sent - failed } });
      }

      // Close all transporters
      transportersByServer.forEach(t => t.transporter.close());

      if (stoppedByUser) {
        broadcastLog({ type: 'complete', data: { sent, failed, total: emailList.length, stoppedByUser: true, message: 'Sending stopped by user' } });
      } else {
        broadcastLog({ type: 'complete', data: { sent, failed, total: emailList.length } });
      }

      res.json({ 
        success: true, 
        message: `Bulk send complete: ${sent} sent, ${failed} failed`,
        sent,
        failed
      });

    } catch (err: any) {
      console.error('Bulk send error:', err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  // Stop bulk sending endpoint
  app.post('/api/emails/stop-bulk', (req, res) => {
    stopBulkSending = true;
    broadcastLog({ type: 'stopping', data: { message: 'Stop requested by user...' } });
    res.json({ success: true, message: 'Stop signal sent' });
  });

  app.get(api.tags.list.path, async (req, res) => {
    const allTags = await storage.getAllTags();
    const tagsWithCounts = await Promise.all(
      allTags.map(async (tag) => {
        const counts = await storage.getTagValuesCount(tag.id);
        return { ...tag, ...counts };
      })
    );
    res.json(tagsWithCounts);
  });

  app.post(api.tags.create.path, async (req, res) => {
    try {
      const input = api.tags.create.input.parse(req.body);
      const tag = await storage.createTag(input);
      res.json(tag);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create tag" });
    }
  });

  app.delete('/api/tags/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTag(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete tag" });
    }
  });

  app.get('/api/tags/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await storage.getTagWithValues(id);
      if (!result) {
        return res.status(404).json({ message: "Tag not found" });
      }
      const counts = await storage.getTagValuesCount(id);
      res.json({ ...result, counts });
    } catch (err) {
      res.status(500).json({ message: "Failed to get tag" });
    }
  });

  app.post('/api/tags/:id/values', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { text } = req.body;
      const values = text.split(/[\n\r]+/).map((v: string) => v.trim()).filter((v: string) => v.length > 0);
      await storage.addTagValues(id, values);
      res.json({ success: true, added: values.length });
    } catch (err) {
      res.status(500).json({ message: "Failed to add values" });
    }
  });

  app.post('/api/tags/:id/reset', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.resetTagValues(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to reset tag values" });
    }
  });

  app.get('/api/tags/:id/download', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const remainingValues = await storage.getRemainingTagValues(id);
      const tag = await storage.getTagWithValues(id);
      const tagName = tag?.tag.name || 'tag';
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${tagName.replace(/[{}]/g, '')}_remaining.txt"`);
      res.send(remainingValues.join('\n'));
    } catch (err) {
      res.status(500).json({ message: "Failed to download tag values" });
    }
  });

  // Image Tags endpoints
  const imageTagsDir = path.join(process.cwd(), 'image_tags');
  if (!fs.existsSync(imageTagsDir)) {
    fs.mkdirSync(imageTagsDir, { recursive: true });
  }

  const imageTagUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, imageTagsDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (extname && mimetype) {
        return cb(null, true);
      }
      cb(new Error('Only image files are allowed'));
    }
  });

  app.get('/api/image-tags', async (req, res) => {
    try {
      const imageTags = await storage.getAllImageTags();
      res.json(imageTags);
    } catch (err) {
      res.status(500).json({ message: "Failed to get image tags" });
    }
  });

  app.post('/api/image-tags', imageTagUpload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      const tagName = req.body.name;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (!tagName) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Tag name is required" });
      }

      const formattedName = `{{${tagName.toUpperCase().replace(/[^A-Z0-9_]/g, '')}}}`;

      const existingTag = await storage.getImageTagByName(formattedName);
      if (existingTag) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ message: "Tag name already exists" });
      }

      const imageTag = await storage.createImageTag({
        name: formattedName,
        filename: file.filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
      });

      res.json(imageTag);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create image tag" });
    }
  });

  app.delete('/api/image-tags/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const imageTags = await storage.getAllImageTags();
      const imageTag = imageTags.find(t => t.id === id);
      
      if (imageTag) {
        const filepath = path.join(imageTagsDir, imageTag.filename);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
      }
      
      await storage.deleteImageTag(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete image tag" });
    }
  });

  app.get('/api/image-tags/:id/preview', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const imageTags = await storage.getAllImageTags();
      const imageTag = imageTags.find(t => t.id === id);
      
      if (!imageTag) {
        return res.status(404).json({ message: "Image tag not found" });
      }
      
      const filepath = path.join(imageTagsDir, imageTag.filename);
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "Image file not found" });
      }
      
      res.sendFile(filepath);
    } catch (err) {
      res.status(500).json({ message: "Failed to get image preview" });
    }
  });

  app.get('/api/templates', async (req, res) => {
    const templates = await storage.getAllTemplates();
    res.json(templates);
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const input = insertEmailTemplateSchema.parse(req.body);
      const template = await storage.createTemplate(input);
      res.json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.put('/api/templates/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      const input = insertEmailTemplateSchema.parse(req.body);
      const template = await storage.updateTemplate(id, input);
      res.json(template);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.delete('/api/templates/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      await storage.deleteTemplate(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  app.post('/api/shortlink', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }
      const apiKey = process.env.JACAT_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "ja.cat API key not configured" });
      }
      const params = new URLSearchParams({
        key: apiKey,
        url: url,
        response_type: 'json',
      });
      const response = await fetch(`https://ja.cat/api/v2/action/shorten?${params.toString()}`);
      const data = await response.json();
      if (data.action === 'shorten' && data.result) {
        res.json({ success: true, shortUrl: data.result });
      } else {
        res.status(400).json({ message: data.error || "Failed to create short link" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create short link" });
    }
  });

  app.post('/api/shortlink-tly', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }
      const apiKey = process.env.TYLINKS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "T.ly API key not configured" });
      }
      const response = await fetch('https://api.t.ly/api/v1/link/shorten', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ long_url: url }),
      });
      const data = await response.json();
      if (response.ok && data.short_url) {
        res.json({ success: true, shortUrl: data.short_url });
      } else {
        res.status(400).json({ message: data.message || data.error || "Failed to create short link" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to create short link" });
    }
  });

  // Upload image attachment endpoint
  app.post('/api/attachments/upload', upload.array('files', 10), (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }
      
      const uploaded = files.map(f => ({
        filename: f.filename,
        originalname: f.originalname,
        size: f.size,
        mimetype: f.mimetype
      }));
      
      res.json({ success: true, files: uploaded });
    } catch (err) {
      res.status(500).json({ message: "Failed to upload files" });
    }
  });

  // List uploaded attachments
  app.get('/api/attachments', (req, res) => {
    try {
      if (!fs.existsSync(uploadDir)) {
        return res.json({ files: [] });
      }
      
      const files = fs.readdirSync(uploadDir).map(filename => {
        const filepath = path.join(uploadDir, filename);
        const stats = fs.statSync(filepath);
        return {
          filename,
          size: stats.size,
          uploadedAt: stats.mtime
        };
      });
      
      res.json({ files });
    } catch (err) {
      res.status(500).json({ message: "Failed to list attachments" });
    }
  });

  // Delete uploaded attachment
  app.delete('/api/attachments/:filename', (req, res) => {
    try {
      const filename = req.params.filename;
      const filepath = path.join(uploadDir, filename);
      
      if (!fs.existsSync(filepath)) {
        return res.status(404).json({ message: "File not found" });
      }
      
      fs.unlinkSync(filepath);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete file" });
    }
  });

  // Resize and rename images endpoint
  app.post('/api/resize-images', async (req, res) => {
    try {
      const { body } = req.body;
      
      if (!body || typeof body !== 'string') {
        return res.status(400).json({ message: "Message body is required" });
      }

      // Find all image references in the body
      const imgRegex = /<img[^>]*src=["']([^"']+\.(?:png|jpg|jpeg|gif|webp))["'][^>]*>/gi;
      const matches = [...body.matchAll(imgRegex)];
      
      if (matches.length === 0) {
        return res.json({ success: true, body, message: "No images found to resize" });
      }

      // Get all previously used sizes from history
      const usedSizes = await storage.getAllSizeHistory();
      const usedSizesSet = new Set(usedSizes.map(s => `${s.width}x${s.height}`));

      // Map each image tag's stored filename to its id so resized images can be
      // linked to their owning tag when recording size history
      const allImageTags = await storage.getAllImageTags();
      const filenameToTagId = new Map(allImageTags.map(t => [t.filename, t.id]));

      let updatedBody = body;
      const renamedFiles: { oldName: string; newName: string }[] = [];

      for (const match of matches) {
        const fullTag = match[0];
        const oldFilename = match[1];
        const oldFilePath = path.join(uploadDir, oldFilename);
        
        // Check if file exists in uploads
        if (!fs.existsSync(oldFilePath)) {
          continue;
        }

        // Generate new filename with UUID
        const ext = path.extname(oldFilename);
        const newFilename = `${uuidv4()}${ext}`;
        const newFilePath = path.join(uploadDir, newFilename);

        try {
          // Read the image and get its metadata
          const image = sharp(oldFilePath);
          const metadata = await image.metadata();
          
          if (!metadata.width || !metadata.height) {
            continue;
          }

          // Generate unique size that hasn't been used before
          let newWidth: number;
          let newHeight: number;
          let sizeKey: string;
          let attempts = 0;
          const maxAttempts = 100;
          
          do {
            // Slightly resize the image (random change between -5 to +5 pixels)
            const widthChange = Math.floor(Math.random() * 11) - 5;
            const heightChange = Math.floor(Math.random() * 11) - 5;
            
            newWidth = Math.max(10, metadata.width + widthChange);
            newHeight = Math.max(10, metadata.height + heightChange);
            sizeKey = `${newWidth}x${newHeight}`;
            attempts++;
          } while (usedSizesSet.has(sizeKey) && attempts < maxAttempts);

          // If we couldn't find a unique size after max attempts, expand the range
          if (usedSizesSet.has(sizeKey)) {
            const widthChange = Math.floor(Math.random() * 21) - 10;
            const heightChange = Math.floor(Math.random() * 21) - 10;
            newWidth = Math.max(10, metadata.width + widthChange);
            newHeight = Math.max(10, metadata.height + heightChange);
            sizeKey = `${newWidth}x${newHeight}`;
          }

          // Add to used sizes set and save to database (only when the image is
          // linked to a known image tag, since size history requires a tag id)
          usedSizesSet.add(sizeKey);
          const imageTagId = filenameToTagId.get(oldFilename);
          if (imageTagId !== undefined) {
            await storage.createSizeHistory({ imageTagId, width: newWidth, height: newHeight });
          }

          // Resize and save with new name
          await sharp(oldFilePath)
            .resize(newWidth, newHeight)
            .toFile(newFilePath);

          // Delete the old file
          fs.unlinkSync(oldFilePath);

          // Update the body - replace old filename with new filename in the img tag
          const newTag = fullTag.replace(oldFilename, newFilename);
          updatedBody = updatedBody.replace(fullTag, newTag);
          
          renamedFiles.push({ oldName: oldFilename, newName: newFilename });
        } catch (imgErr) {
          console.error(`Failed to process image ${oldFilename}:`, imgErr);
        }
      }

      res.json({ 
        success: true, 
        body: updatedBody,
        renamedFiles,
        message: `Resized and renamed ${renamedFiles.length} image(s)`
      });
    } catch (err: any) {
      console.error("Failed to resize images:", err);
      res.status(500).json({ message: `Failed to resize images: ${err.message}` });
    }
  });

  // Generate random article endpoint
  app.post('/api/generate-article', async (req, res) => {
    try {
      const { companyName } = req.body || {};
      const trimmedCompanyName = typeof companyName === 'string' ? companyName.trim() : '';

      const topics = [
        "technology trends",
        "health and wellness tips",
        "business productivity",
        "travel destinations",
        "food and cooking",
        "personal development",
        "finance and investing",
        "entertainment news",
        "science discoveries",
        "lifestyle improvements"
      ];
      
      const randomTopic = topics[Math.floor(Math.random() * topics.length)];
      
      const systemPrompt = `You are an expert content writer. Generate a professional plain text article about ${randomTopic}. 
      
The article should:
1. Be formatted as plain text only (NO HTML tags)
2. Be 200-400 words
3. Be professional and informative
4. Use simple formatting like line breaks and dashes for lists
5. Have a clear structure with title and paragraphs${trimmedCompanyName ? `\n6. If you mention the company name "${trimmedCompanyName}", write it EXACTLY as given — never reword, translate, abbreviate, or alter it.` : ''}

Return ONLY the plain text article content, no JSON, no markdown, no HTML tags.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate a unique article about ${randomTopic}` }
        ],
        max_completion_tokens: 8192,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Clean up the content - remove any markdown formatting if present
      const cleanContent = content.replace(/^```.*?\n?/i, '').replace(/\n?```$/i, '').trim();

      res.json({ 
        success: true, 
        body: cleanContent
      });
    } catch (err: any) {
      console.error("Failed to generate article:", err);
      res.status(500).json({ message: `Failed to generate article: ${err.message}` });
    }
  });

  // Rephrase message body endpoint
  app.post('/api/rephrase-message', async (req, res) => {
    try {
      const { body, companyName } = req.body;
      
      if (!body || typeof body !== 'string') {
        return res.status(400).json({ message: "Message body is required" });
      }

      const trimmedCompanyName = typeof companyName === 'string' ? companyName.trim() : '';

      const preserved: { placeholder: string; original: string }[] = [];
      let processedBody = body;
      let placeholderIndex = 0;

      // First, protect all template tags like {{TAG_NAME}}
      processedBody = processedBody.replace(/\{\{[A-Z0-9_]+\}\}/g, (match) => {
        const placeholder = `__TAG_PLACEHOLDER_${placeholderIndex}__`;
        preserved.push({ placeholder, original: match });
        placeholderIndex++;
        return placeholder;
      });

      // Protect the manually specified company name so it survives verbatim
      if (trimmedCompanyName) {
        const escaped = trimmedCompanyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        processedBody = processedBody.replace(new RegExp(escaped, 'g'), (match) => {
          const placeholder = `__COMPANY_PLACEHOLDER_${placeholderIndex}__`;
          preserved.push({ placeholder, original: match });
          placeholderIndex++;
          return placeholder;
        });
      }

      // Protect all src and href attributes (these contain URLs we must preserve)
      processedBody = processedBody.replace(/(src|href)=["'][^"']*["']/gi, (match) => {
        const placeholder = `__ATTR_PLACEHOLDER_${placeholderIndex}__`;
        preserved.push({ placeholder, original: match });
        placeholderIndex++;
        return placeholder;
      });

      // Protect any remaining URLs
      const urlPatterns = [
        /https?:\/\/[^\s<>"']+/gi,
        /docs\.google\.com\/[^\s<>"']+/gi,
      ];
      
      for (const pattern of urlPatterns) {
        processedBody = processedBody.replace(pattern, (match) => {
          // Skip if already a placeholder
          if (match.includes('__PLACEHOLDER_')) return match;
          const placeholder = `__URL_PLACEHOLDER_${placeholderIndex}__`;
          preserved.push({ placeholder, original: match });
          placeholderIndex++;
          return placeholder;
        });
      }

      const systemPrompt = `You are an expert email copywriter and front-end developer. Your task is to produce a GENUINELY FRESH, restructured version of the given HTML email — not a near-copy. Follow these rules:

1. KEEP THE SAME MEANING and intent, but REWORD the copy with synonyms and alternative phrasings so it reads differently while conveying identical information.
2. FULLY REBUILD THE MARKUP. Replace every <div> and <span> with semantic HTML elements such as <section>, <article>, <header>, <footer>, <p>, <h1>-<h4>, <ul>/<li>, and <figure>. Do NOT reuse <div>/<span>. Move any inline styles onto the new semantic elements so the visual result stays comparable.
3. Produce a NOTICEABLY DIFFERENT structure on every call — vary the arrangement, grouping, and element choices so repeated runs yield different fresh variants.
4. Maintain a professional tone and keep the email visually coherent.
5. PRESERVE ALL placeholders that start and end with __ EXACTLY as they are — these are protected content (tags, URLs, company name) that must NOT be modified, moved, split, or removed.
6. Keep any brand/company name found in the content UNCHANGED — never reword, translate, or alter a company or brand name.${trimmedCompanyName ? `\n7. The company name "${trimmedCompanyName}" MUST appear unchanged (it is protected as a placeholder — keep that placeholder intact).` : ''}

CRITICAL: Any text that looks like __SOMETHING_PLACEHOLDER_N__ must be kept EXACTLY as-is in the output. Do not modify, rephrase, or reorder these placeholders.

Return ONLY the restructured HTML content, no explanations or markdown code blocks.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Rewrite and restructure this HTML email into a fresh variant:\n\n${processedBody}` }
        ],
        max_completion_tokens: 8192,
      });

      let rephrasedBody = response.choices[0]?.message?.content || body;
      
      // Remove any markdown code blocks if present
      rephrasedBody = rephrasedBody.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim();
      
      // Restore all preserved content in reverse order to handle nested placeholders
      for (const { placeholder, original } of preserved.reverse()) {
        rephrasedBody = rephrasedBody.split(placeholder).join(original);
      }

      // Validate that all original template tags are still present
      const originalTags: string[] = body.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
      const rephrasedTags: string[] = rephrasedBody.match(/\{\{[A-Z0-9_]+\}\}/g) || [];
      
      for (const tag of originalTags) {
        if (!rephrasedTags.includes(tag)) {
          // If a tag is missing, the rephrasing failed - return original
          console.warn(`Rephrase failed: missing tag ${tag}, returning original`);
          return res.json({ success: true, body: body });
        }
      }

      // Validate that the specified company name survived verbatim
      if (trimmedCompanyName && !rephrasedBody.includes(trimmedCompanyName)) {
        console.warn(`Rephrase failed: company name missing, returning original`);
        return res.json({ success: true, body: body, companyNameRejected: true });
      }

      res.json({ success: true, body: rephrasedBody });
    } catch (err: any) {
      console.error("Failed to rephrase message:", err);
      res.status(500).json({ message: `Failed to rephrase message: ${err.message}` });
    }
  });

  // Rephrase subject endpoint - generates a fresh subject with the same meaning
  app.post('/api/rephrase-subject', async (req, res) => {
    try {
      const { subject, companyName } = req.body;

      if (!subject || typeof subject !== 'string' || !subject.trim()) {
        return res.status(400).json({ message: "Subject is required" });
      }

      const trimmedCompanyName = typeof companyName === 'string' ? companyName.trim() : '';

      // Protect template tags like {{TAG_NAME}} so the AI doesn't alter them
      const preserved: { placeholder: string; original: string }[] = [];
      let placeholderIndex = 0;
      let processedSubject = subject.replace(/\{\{[A-Z0-9_]+\}\}/g, (match) => {
        const placeholder = `__TAG_PLACEHOLDER_${placeholderIndex}__`;
        preserved.push({ placeholder, original: match });
        placeholderIndex++;
        return placeholder;
      });

      // Protect the manually specified company name so it survives verbatim
      if (trimmedCompanyName) {
        const escaped = trimmedCompanyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        processedSubject = processedSubject.replace(new RegExp(escaped, 'g'), (match) => {
          const placeholder = `__COMPANY_PLACEHOLDER_${placeholderIndex}__`;
          preserved.push({ placeholder, original: match });
          placeholderIndex++;
          return placeholder;
        });
      }

      const systemPrompt = `You are an expert email copywriter. Rewrite the given email subject line so it:

1. KEEPS THE SAME MEANING and intent of the original subject
2. Uses different words and phrasing so it feels fresh and new each time
3. Stays concise and natural for an email subject line (no quotes around it)
4. Matches the original language (if the subject is Arabic, reply in Arabic; if English, reply in English)
5. PRESERVES exactly, without changing, moving, or removing, any placeholder that starts with __ and ends with __
6. Keep any brand/company name found in the subject UNCHANGED — never reword, translate, or alter a company or brand name.${trimmedCompanyName ? `\n7. The company name "${trimmedCompanyName}" MUST appear unchanged (it is protected as a placeholder — keep that placeholder intact).` : ''}

CRITICAL: Any text that looks like __SOMETHING_PLACEHOLDER_N__ must be kept EXACTLY as-is.

Return ONLY the rewritten subject line, with no quotes, no explanations, and no markdown.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Rewrite this email subject with the same meaning but different wording:\n\n${processedSubject}` }
        ],
        max_completion_tokens: 256,
      });

      let newSubject = response.choices[0]?.message?.content || subject;

      // Clean up any markdown/quote wrapping and collapse whitespace
      newSubject = newSubject
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim()
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Restore preserved template tags
      for (const { placeholder, original } of preserved.reverse()) {
        newSubject = newSubject.split(placeholder).join(original);
      }

      // Validate that all original template tags are still present with the same
      // number of occurrences; otherwise keep the original subject.
      const countTags = (text: string) => {
        const counts = new Map<string, number>();
        for (const tag of text.match(/\{\{[A-Z0-9_]+\}\}/g) || []) {
          counts.set(tag, (counts.get(tag) || 0) + 1);
        }
        return counts;
      };
      const originalTagCounts = countTags(subject);
      const newTagCounts = countTags(newSubject);
      for (const [tag, count] of Array.from(originalTagCounts.entries())) {
        if ((newTagCounts.get(tag) || 0) !== count) {
          console.warn(`Rephrase subject failed: tag ${tag} count mismatch, returning original`);
          return res.json({ success: true, subject });
        }
      }

      if (!newSubject) {
        return res.json({ success: true, subject });
      }

      // Validate that the specified company name survived verbatim
      if (trimmedCompanyName && !newSubject.includes(trimmedCompanyName)) {
        console.warn(`Rephrase subject failed: company name missing, returning original`);
        return res.json({ success: true, subject, companyNameRejected: true });
      }

      res.json({ success: true, subject: newSubject });
    } catch (err: any) {
      console.error("Failed to rephrase subject:", err);
      res.status(500).json({ message: `Failed to rephrase subject: ${err.message}` });
    }
  });

  // Encode message body endpoint - wraps text in xTextEncode and runs PHP
  app.post('/api/encode-message', async (req, res) => {
    try {
      const { body } = req.body;
      
      if (!body || typeof body !== 'string') {
        return res.status(400).json({ message: "Message body is required" });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const fs = await import('fs/promises');
      const path = await import('path');
      const execAsync = promisify(exec);

      // Function to escape string for PHP double-quoted string
      const escapeForPhp = (str: string): string => {
        return str
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/\$/g, '\\$')   // Escape dollar signs
          .replace(/"/g, '\\"')    // Escape double quotes
          .replace(/\n/g, '\\n')   // Escape newlines
          .replace(/\r/g, '\\r')   // Escape carriage returns
          .replace(/\t/g, '\\t');  // Escape tabs
      };

      // Function to wrap text content with xTextEncode
      const wrapTextWithEncode = (html: string): string => {
        // Match text content between HTML tags (not inside attributes)
        // This regex finds text that's between > and < 
        return html.replace(/>([^<]+)</g, (match, textContent) => {
          const trimmed = textContent.trim();
          // Skip if empty, only whitespace, or contains {{ template tags
          if (!trimmed || /^\s*$/.test(textContent) || /\{\{[A-Z0-9_]+\}\}/.test(textContent)) {
            return match;
          }
          // Skip if it's just HTML entities or special chars
          if (/^(&[a-z]+;|\s|&nbsp;)+$/i.test(trimmed)) {
            return match;
          }
          // Preserve leading/trailing whitespace from original textContent
          const leadingSpace = textContent.match(/^\s*/)?.[0] || '';
          const trailingSpace = textContent.match(/\s*$/)?.[0] || '';
          // Wrap with xTextEncode PHP call, properly escaping for PHP
          const escaped = escapeForPhp(trimmed);
          const encoded = `>${leadingSpace}<?php echo xTextEncode("${escaped}") ?>${trailingSpace}<`;
          return encoded;
        });
      };

      // Create the PHP content
      const wrappedHtml = wrapTextWithEncode(body);
      const phpContent = `<?php\ninclude 'joker.php';\n?>\n${wrappedHtml}`;

      // Write to encode.php
      const encodePath = path.join(process.cwd(), 'encode.php');
      await fs.writeFile(encodePath, phpContent, 'utf-8');

      // Execute PHP
      const { stdout, stderr } = await execAsync('php encode.php', {
        cwd: process.cwd(),
        timeout: 10000,
      });

      if (stderr) {
        console.error('PHP stderr:', stderr);
      }

      // Return the encoded output
      res.json({ success: true, body: stdout });
    } catch (err: any) {
      console.error("Failed to encode message:", err);
      res.status(500).json({ message: `Failed to encode message: ${err.message}` });
    }
  });

  return httpServer;
}
