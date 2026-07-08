import { useState, useEffect, useRef } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEmailSchema, bulkEmailSchema, encodingOptions, type InsertEmail, type BulkEmailRequest, type EmailTemplate } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSendEmail, useSendBulkEmails } from "@/hooks/use-emails";
import { useSMTPConfigs } from "@/hooks/use-smtp";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { CardHover } from "@/components/ui/card-hover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, AlertCircle, Loader2, Users, Mail, CheckCircle2, XCircle, Server, ArrowRightLeft, AlertTriangle, ShieldCheck, Save, FileText, Trash2, StopCircle, RefreshCw, Lock, Upload, Image, X, Download, Eye, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface SendingLog {
  id: number;
  type: 'start' | 'sending' | 'sent' | 'failed' | 'complete' | 'smtp_switch' | 'batch_complete' | 'sure_inbox_test' | 'sure_inbox_success' | 'sure_inbox_failed' | 'stopping' | 'stopped' | 'ratelimit_stop';
  timestamp: Date;
  data: any;
}

type SharedComposeForm = UseFormReturn<{
  subject: string;
  body: string;
  fromEmail?: string;
  customHeaders?: string;
  messageIdDomain?: string;
  heloHostname?: string;
  encoding: InsertEmail["encoding"];
}>;

export default function Compose() {
  const [activeTab, setActiveTab] = useState("bulk");
  const { data: smtpConfigs, isLoading: isLoadingConfig } = useSMTPConfigs();
  const sendEmail = useSendEmail();
  const sendBulkEmails = useSendBulkEmails();
  const { toast } = useToast();
  
  const [logs, setLogs] = useState<SendingLog[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);
  
  const [templateName, setTemplateName] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogType, setSaveDialogType] = useState<"single" | "bulk">("single");
  const [loadedTemplateSingle, setLoadedTemplateSingle] = useState<EmailTemplate | null>(null);
  const [loadedTemplateBulk, setLoadedTemplateBulk] = useState<EmailTemplate | null>(null);
  const [templateSelectSingle, setTemplateSelectSingle] = useState("");
  const [templateSelectBulk, setTemplateSelectBulk] = useState("");
  const [shortlinkUrlSingle, setShortlinkUrlSingle] = useState("");
  const [shortlinkUrlBulk, setShortlinkUrlBulk] = useState("");
  const [tlylinkUrlSingle, setTlylinkUrlSingle] = useState("");
  const [tlylinkUrlBulk, setTlylinkUrlBulk] = useState("");
  const [companyNameSingle, setCompanyNameSingle] = useState("");
  const [companyNameBulk, setCompanyNameBulk] = useState("");

  const activeConfigs = smtpConfigs?.filter(c => c.isActive) || [];

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/templates'],
  });

  const createTemplate = useMutation({
    mutationFn: async (data: { name: string; subject: string; body: string }) => {
      const res = await apiRequest('POST', '/api/templates', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({ title: "Template saved successfully" });
      setSaveDialogOpen(false);
      setTemplateName("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save template", description: error.message, variant: "destructive" });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (data: { id: number; name: string; subject: string; body: string; fromEmail?: string | null; customHeaders?: string | null; messageIdDomain?: string | null; heloHostname?: string | null; encoding?: string | null; delaySeconds?: number | null; batchSize?: number | null; concurrentConnections?: number | null; companyName?: string | null }) => {
      const { id, ...rest } = data;
      const res = await apiRequest('PUT', `/api/templates/${id}`, rest);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({ title: "Template updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update template", description: error.message, variant: "destructive" });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({ title: "Template deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete template", description: error.message, variant: "destructive" });
    },
  });

  const stopBulkSending = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/emails/stop-bulk');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stop signal sent", description: "Sending will stop after current email completes" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to stop", description: error.message, variant: "destructive" });
    },
  });

  const rephraseMessage = useMutation({
    mutationFn: async ({ body, companyName }: { body: string; companyName?: string }) => {
      const res = await apiRequest('POST', '/api/rephrase-message', { body, companyName });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to rephrase message", description: error.message, variant: "destructive" });
    },
  });

  const rephraseSubject = useMutation({
    mutationFn: async ({ subject, companyName }: { subject: string; companyName?: string }) => {
      const res = await apiRequest('POST', '/api/rephrase-subject', { subject, companyName });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to change subject", description: error.message, variant: "destructive" });
    },
  });

  const handleChangeSubject = async (formType: "single" | "bulk") => {
    const form = (formType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
    const currentSubject = (form.getValues("subject") || "").trim();
    if (!currentSubject) {
      toast({ title: "Please enter a subject first", variant: "destructive" });
      return;
    }
    const companyName = (formType === "single" ? companyNameSingle : companyNameBulk).trim() || undefined;
    try {
      const result = await rephraseSubject.mutateAsync({ subject: currentSubject, companyName });
      if (result?.companyNameRejected) {
        toast({
          title: "Subject rephrase rejected to protect the company name",
          description: `The rewrite changed the company name "${companyName}", so your original subject was kept unchanged.`,
          variant: "destructive",
        });
        return;
      }
      if (result?.success && result.subject) {
        if (result.subject.trim() === currentSubject) {
          toast({ title: "Couldn't generate a new subject, kept the original", variant: "destructive" });
        } else {
          form.setValue("subject", result.subject, { shouldDirty: true });
          toast({ title: "Subject changed" });
        }
      }
    } catch {
      // onError already shows a toast
    }
  };

  const generateArticle = useMutation({
    mutationFn: async (companyName?: string) => {
      const res = await apiRequest('POST', '/api/generate-article', { companyName });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate article", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerateArticle = async (formType: "single" | "bulk") => {
    const companyName = (formType === "single" ? companyNameSingle : companyNameBulk).trim() || undefined;
    const result = await generateArticle.mutateAsync(companyName);
    if (result.success) {
      if (formType === "single") {
        singleForm.setValue("plainTextBody", result.body);
      } else {
        bulkForm.setValue("plainTextBody", result.body);
      }
      toast({ title: "Article generated successfully" });
    }
  };

  const encodeMessage = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest('POST', '/api/encode-message', { body });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to encode message", description: error.message, variant: "destructive" });
    },
  });

  const resizeImages = useMutation({
    mutationFn: async (body: string) => {
      const res = await apiRequest('POST', '/api/resize-images', { body });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to resize images", description: error.message, variant: "destructive" });
    },
  });

  const createShortlink = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest('POST', '/api/shortlink', { url });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create short link", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateShortlink = async (formType: "single" | "bulk") => {
    const rawUrl = formType === "single" ? shortlinkUrlSingle : shortlinkUrlBulk;
    if (!rawUrl.trim()) {
      toast({ title: "Please enter a URL", variant: "destructive" });
      return;
    }
    const result = await createShortlink.mutateAsync(rawUrl);
    if (result.success && result.shortUrl) {
      const form = (formType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
      const currentBody = form.getValues("body") || "";
      if (currentBody.includes("{{JALINKS}}")) {
        form.setValue("body", currentBody.replace(/\{\{JALINKS\}\}/g, result.shortUrl));
      } else {
        const separator = currentBody.length > 0 ? "\n" : "";
        form.setValue("body", currentBody + separator + result.shortUrl);
      }
      toast({ title: "Short link created!", description: result.shortUrl });
    }
  };

  const createTlyShortlink = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest('POST', '/api/shortlink-tly', { url });
      return res.json();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create short link", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateTlyShortlink = async (formType: "single" | "bulk") => {
    const rawUrl = formType === "single" ? tlylinkUrlSingle : tlylinkUrlBulk;
    if (!rawUrl.trim()) {
      toast({ title: "Please enter a URL", variant: "destructive" });
      return;
    }
    const result = await createTlyShortlink.mutateAsync(rawUrl);
    if (result.success && result.shortUrl) {
      const form = (formType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
      const currentBody = form.getValues("body") || "";
      if (currentBody.includes("{{TYLINKS}}")) {
        form.setValue("body", currentBody.replace(/\{\{TYLINKS\}\}/g, result.shortUrl));
      } else {
        const separator = currentBody.length > 0 ? "\n" : "";
        form.setValue("body", currentBody + separator + result.shortUrl);
      }
      toast({ title: "Short link created!", description: result.shortUrl });
    }
  };

  const handleResizeImages = async (formType: "single" | "bulk") => {
    const body = formType === "single" ? singleForm.getValues("body") : bulkForm.getValues("body");
    if (!body) {
      toast({ title: "No message body", description: "Please add content to Message Body first", variant: "destructive" });
      return;
    }
    const result = await resizeImages.mutateAsync(body);
    if (result.success) {
      if (formType === "single") {
        singleForm.setValue("body", result.body);
      } else {
        bulkForm.setValue("body", result.body);
      }
      refetchAttachments();
      toast({ title: result.message || "Images resized successfully" });
    }
  };

  // Attachments query and mutations
  interface AttachmentFile {
    filename: string;
    size: number;
    uploadedAt?: string;
  }

  const { data: attachmentsData, refetch: refetchAttachments } = useQuery<{ files: AttachmentFile[] }>({
    queryKey: ['/api/attachments'],
  });

  const attachments = attachmentsData?.files || [];

  const uploadAttachment = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });
      const res = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Upload failed');
      }
      return res.json();
    },
    onSuccess: () => {
      refetchAttachments();
      toast({ title: "Images uploaded successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to upload images", description: error.message, variant: "destructive" });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (filename: string) => {
      await apiRequest('DELETE', `/api/attachments/${encodeURIComponent(filename)}`);
    },
    onSuccess: () => {
      refetchAttachments();
      toast({ title: "Image deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete image", description: error.message, variant: "destructive" });
    },
  });

  const fileInputSingleRef = useRef<HTMLInputElement>(null);
  const fileInputBulkRef = useRef<HTMLInputElement>(null);

  function handleRephraseMessage(formType: "single" | "bulk") {
    const form = (formType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
    const currentBody = form.getValues("body");
    
    if (!currentBody || currentBody.trim().length === 0) {
      toast({ title: "Message body is empty", description: "Please enter some content first", variant: "destructive" });
      return;
    }

    const companyName = formType === "single" ? companyNameSingle : companyNameBulk;

    rephraseMessage.mutate({ body: currentBody, companyName: companyName.trim() || undefined }, {
      onSuccess: (data) => {
        if (data.companyNameRejected) {
          toast({
            title: "Rephrase rejected to protect the company name",
            description: `The rewrite changed the company name "${companyName.trim()}", so your original message was kept unchanged.`,
            variant: "destructive",
          });
          return;
        }
        if (data.body) {
          form.setValue("body", data.body);
          toast({ title: "Message rephrased successfully", description: "Your message has been updated with fresh wording" });
        }
      },
    });
  }

  function handleEncodeMessage(formType: "single" | "bulk") {
    const form = (formType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
    const currentBody = form.getValues("body");
    
    if (!currentBody || currentBody.trim().length === 0) {
      toast({ title: "Message body is empty", description: "Please enter some content first", variant: "destructive" });
      return;
    }

    encodeMessage.mutate(currentBody, {
      onSuccess: (data) => {
        if (data.body) {
          form.setValue("body", data.body);
          toast({ title: "Message encoded successfully", description: "Text has been encoded with xTextEncode" });
        }
      },
    });
  }

  useEffect(() => {
    let reconnectTimeout: NodeJS.Timeout;
    let ws: WebSocket | null = null;
    let isUnmounting = false;
    
    const connect = () => {
      if (isUnmounting) return;
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/sending-logs`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const newLog: SendingLog = {
          id: logIdRef.current++,
          type: message.type,
          timestamp: new Date(),
          data: message.data,
        };
        
        setLogs(prev => [...prev, newLog]);
        
        if (message.type === 'start') {
          setIsSending(true);
          setSentCount(0);
          setFailedCount(0);
          setTotalCount(message.data.total || 0);
        } else if (message.type === 'sent') {
          setSentCount(prev => prev + 1);
        } else if (message.type === 'failed') {
          setFailedCount(prev => prev + 1);
        } else if (message.type === 'complete') {
          setIsSending(false);
          const d = message.data || {};
          const completeMsg = d.message
            || `Bulk send complete: ${d.sent ?? 0} sent, ${d.failed ?? 0} failed`;
          toast({
            title: d.ratelimited
              ? "Sending Stopped"
              : d.stoppedByUser
                ? "Sending Stopped"
                : "Bulk Send Complete",
            description: completeMsg,
            variant: d.ratelimited ? "destructive" : "default",
          });
        } else if (message.type === 'stopped') {
          setIsSending(false);
        } else if (message.type === 'ratelimit_stop') {
          setIsSending(false);
        }
        
        // Remove ONLY successfully sent emails from the list.
        // Failed emails are kept so they remain available for re-sending/export.
        // Remove just the first matching occurrence so duplicate addresses that
        // haven't been sent yet (or that fail later) are preserved.
        if (message.type === 'sent' && message.data?.email) {
          const emailToRemove = message.data.email.toLowerCase().trim();
          const currentEmails = bulkForm.getValues("emails");
          const emailLines = currentEmails.split(/[\n,]/).map(e => e.trim()).filter(e => e);
          const removeIndex = emailLines.findIndex(e => e.toLowerCase() === emailToRemove);
          if (removeIndex !== -1) {
            emailLines.splice(removeIndex, 1);
            bulkForm.setValue("emails", emailLines.join("\n"));
          }
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        if (!isUnmounting) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws?.close();
      };
      
      wsRef.current = ws;
    };
    
    connect();
    
    return () => {
      isUnmounting = true;
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  useEffect(() => {
    if (logsDialogOpen && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs, logsDialogOpen]);

  const singleForm = useForm<InsertEmail>({
    resolver: zodResolver(insertEmailSchema),
    defaultValues: {
      to: "",
      fromEmail: "",
      subject: "",
      body: "",
      encoding: "7bit",
      isImportant: true,
      sureInbox: true,
      customHeaders: "",
      messageIdDomain: "",
      heloHostname: "",
      enablePlainText: false,
      plainTextBody: "",
    },
  });

  const bulkForm = useForm<BulkEmailRequest>({
    resolver: zodResolver(bulkEmailSchema),
    defaultValues: {
      emails: "",
      fromEmail: "",
      subject: "",
      body: "",
      encoding: "7bit",
      delaySeconds: 1,
      batchSize: undefined,
      concurrentConnections: 1,
      sendMode: "single",
      bccToEmail: "",
      isImportant: true,
      sureInbox: true,
      customHeaders: "",
      messageIdDomain: "",
      heloHostname: "",
      enablePlainText: false,
      plainTextBody: "",
    },
  });

  // Resolve the {{TYLINKS}} tag into a t.ly short link at send time.
  // Returns the body with the tag replaced, or null if shortening failed.
  const resolveTlyTag = async (body: string, formType: "single" | "bulk"): Promise<string | null> => {
    if (!body.includes("{{TYLINKS}}")) return body;
    const rawUrl = (formType === "single" ? tlylinkUrlSingle : tlylinkUrlBulk).trim();
    if (!rawUrl) {
      toast({ title: "Short link URL missing", description: "Your message uses {{TYLINKS}} but no Short Link URL was provided.", variant: "destructive" });
      return null;
    }
    try {
      const result = await createTlyShortlink.mutateAsync(rawUrl);
      if (result.success && result.shortUrl) {
        return body.replace(/\{\{TYLINKS\}\}/g, result.shortUrl);
      }
      toast({ title: "Failed to create short link", variant: "destructive" });
      return null;
    } catch {
      return null;
    }
  };

  async function onSubmitSingle(data: InsertEmail) {
    const resolvedBody = await resolveTlyTag(data.body || "", "single");
    if (resolvedBody === null) return;
    sendEmail.mutate({ ...data, body: resolvedBody }, {
      onSuccess: () => {
        // Only clear recipient field, keep subject and body
        singleForm.setValue("to", "");
      },
    });
  }

  async function onSubmitBulk(data: BulkEmailRequest) {
    const resolvedBody = await resolveTlyTag(data.body || "", "bulk");
    if (resolvedBody === null) return;
    setLogs([]);
    // Note: successfully sent emails are removed one-by-one via the WebSocket
    // 'sent' handler. We intentionally do NOT clear the whole list here so that
    // failed (not sent) emails stay in the Email Addresses field.
    sendBulkEmails.mutate({ ...data, body: resolvedBody });
  }

  function clearLogs() {
    setLogs([]);
    setSentCount(0);
    setFailedCount(0);
    setTotalCount(0);
  }

  function downloadLogs() {
    const logText = logs.map(log => {
      const time = log.timestamp.toLocaleTimeString();
      switch (log.type) {
        case 'start': return `[${time}] START: Bulk send - ${log.data.total} emails, ${log.data.smtpCount} SMTP server(s)`;
        case 'smtp_switch': return `[${time}] SMTP SWITCH: ${log.data.configName} (batch size: ${log.data.batchSize})`;
        case 'batch_complete': return `[${time}] BATCH COMPLETE: Batch ${log.data.batchNumber + 1} (${log.data.emailsInBatch} emails)`;
        case 'sending': return `[${time}] SENDING: [${log.data.index}/${log.data.total}] [${log.data.smtp}] ${log.data.email}`;
        case 'sent': return `[${time}] SENT: [${log.data.index}] [${log.data.smtpName}] ${log.data.email}`;
        case 'failed': return `[${time}] FAILED: [${log.data.index}] [${log.data.smtpName}] ${log.data.email} - ${log.data.error}`;
        case 'stopping': return `[${time}] STOPPING: ${log.data.message}`;
        case 'stopped': return `[${time}] STOPPED: ${log.data.message} - Sent: ${log.data.sent}, Failed: ${log.data.failed}, Remaining: ${log.data.remaining}`;
        case 'ratelimit_stop': return `[${time}] RATE LIMIT: ${log.data.message} - Email: ${log.data.email}`;
        case 'complete': return `[${time}] COMPLETE: Sent: ${log.data.sent}, Failed: ${log.data.failed}`;
        case 'sure_inbox_test': return `[${time}] SURE INBOX: ${log.data.message}`;
        case 'sure_inbox_success': return `[${time}] SURE INBOX OK: ${log.data.message}`;
        case 'sure_inbox_failed': return `[${time}] SURE INBOX FAIL: ${log.data.message}`;
        default: return `[${time}] ${log.type}: ${JSON.stringify(log.data)}`;
      }
    }).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sending-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadTemplate(template: EmailTemplate, formType: "single" | "bulk") {
    if (formType === "single") {
      singleForm.setValue("subject", template.subject);
      singleForm.setValue("body", template.body);
      if (template.fromEmail) singleForm.setValue("fromEmail", template.fromEmail);
      if (template.customHeaders) singleForm.setValue("customHeaders", template.customHeaders);
      if (template.messageIdDomain) singleForm.setValue("messageIdDomain", template.messageIdDomain);
      if (template.heloHostname) singleForm.setValue("heloHostname", template.heloHostname);
      if (template.encoding) singleForm.setValue("encoding", template.encoding as any);
      setShortlinkUrlSingle(template.shortlinkUrl || "");
      setTlylinkUrlSingle(template.tlylinkUrl || "");
      setCompanyNameSingle(template.companyName || "");
      setLoadedTemplateSingle(template);
    } else {
      bulkForm.setValue("subject", template.subject);
      bulkForm.setValue("body", template.body);
      if (template.fromEmail) bulkForm.setValue("fromEmail", template.fromEmail);
      if (template.customHeaders) bulkForm.setValue("customHeaders", template.customHeaders);
      if (template.messageIdDomain) bulkForm.setValue("messageIdDomain", template.messageIdDomain);
      if (template.heloHostname) bulkForm.setValue("heloHostname", template.heloHostname);
      if (template.encoding) bulkForm.setValue("encoding", template.encoding as any);
      if (template.delaySeconds !== null && template.delaySeconds !== undefined) bulkForm.setValue("delaySeconds", template.delaySeconds);
      if (template.batchSize !== null && template.batchSize !== undefined) bulkForm.setValue("batchSize", template.batchSize);
      if (template.concurrentConnections !== null && template.concurrentConnections !== undefined) bulkForm.setValue("concurrentConnections", template.concurrentConnections);
      setShortlinkUrlBulk(template.shortlinkUrl || "");
      setTlylinkUrlBulk(template.tlylinkUrl || "");
      setCompanyNameBulk(template.companyName || "");
      setLoadedTemplateBulk(template);
    }
    toast({ title: `Template "${template.name}" loaded` });
  }

  function handleUpdateTemplate(formType: "single" | "bulk") {
    const template = formType === "single" ? loadedTemplateSingle : loadedTemplateBulk;
    if (!template) {
      toast({ title: "No template loaded", variant: "destructive" });
      return;
    }
    const form = (formType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
    const subject = form.getValues("subject");
    const body = form.getValues("body");
    if (!subject || !body) {
      toast({ title: "Subject and message body are required", variant: "destructive" });
      return;
    }
    
    const templateData: any = { 
      id: template.id,
      name: template.name, 
      subject, 
      body,
      fromEmail: form.getValues("fromEmail") || null,
      customHeaders: form.getValues("customHeaders") || null,
      messageIdDomain: form.getValues("messageIdDomain") || null,
      heloHostname: form.getValues("heloHostname") || null,
      encoding: form.getValues("encoding") || null,
      shortlinkUrl: (formType === "single" ? shortlinkUrlSingle : shortlinkUrlBulk) || null,
      tlylinkUrl: (formType === "single" ? tlylinkUrlSingle : tlylinkUrlBulk) || null,
      companyName: (formType === "single" ? companyNameSingle : companyNameBulk) || null,
    };
    
    if (formType === "bulk") {
      templateData.delaySeconds = bulkForm.getValues("delaySeconds") ?? null;
      templateData.batchSize = bulkForm.getValues("batchSize") ?? null;
      templateData.concurrentConnections = bulkForm.getValues("concurrentConnections") ?? null;
    }
    
    updateTemplate.mutate(templateData);
  }

  function openSaveDialog(formType: "single" | "bulk") {
    setSaveDialogType(formType);
    setSaveDialogOpen(true);
  }

  function handleSaveTemplate() {
    if (!templateName.trim()) {
      toast({ title: "Please enter a template name", variant: "destructive" });
      return;
    }
    const form = (saveDialogType === "single" ? singleForm : bulkForm) as unknown as SharedComposeForm;
    const subject = form.getValues("subject");
    const body = form.getValues("body");
    if (!subject || !body) {
      toast({ title: "Subject and message body are required", variant: "destructive" });
      return;
    }
    
    const templateData: any = { 
      name: templateName.trim(), 
      subject, 
      body,
      fromEmail: form.getValues("fromEmail") || null,
      customHeaders: form.getValues("customHeaders") || null,
      messageIdDomain: form.getValues("messageIdDomain") || null,
      heloHostname: form.getValues("heloHostname") || null,
      encoding: form.getValues("encoding") || null,
      shortlinkUrl: (saveDialogType === "single" ? shortlinkUrlSingle : shortlinkUrlBulk) || null,
      tlylinkUrl: (saveDialogType === "single" ? tlylinkUrlSingle : tlylinkUrlBulk) || null,
      companyName: (saveDialogType === "single" ? companyNameSingle : companyNameBulk) || null,
    };
    
    // Add bulk-specific fields if saving from bulk form
    if (saveDialogType === "bulk") {
      templateData.delaySeconds = bulkForm.getValues("delaySeconds") || null;
      templateData.batchSize = bulkForm.getValues("batchSize") || null;
      templateData.concurrentConnections = bulkForm.getValues("concurrentConnections") || null;
    }
    
    createTemplate.mutate(templateData);
  }

  if (isLoadingConfig) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!smtpConfigs || activeConfigs.length === 0) {
    return (
      <Layout>
        <PageHeader title="New Message" description="Compose and send your HTML emails." />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Alert variant="destructive" className="border-destructive/20 bg-destructive/5">
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="ml-2 font-bold">Configuration Missing</AlertTitle>
            <AlertDescription className="ml-2 mt-2">
              You need at least one active SMTP server to send emails. Please go to settings to add and activate a mail server.
              <div className="mt-4">
                <Link href="/settings">
                  <Button variant="outline" className="border-destructive/30">
                    Go to Settings
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        </motion.div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader title="New Message" description="Compose and send your HTML emails." />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Active SMTP Servers:</span>
          <Badge variant="secondary" className="text-xs" data-testid="badge-active-smtp-count">
            {activeConfigs.length}
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="single" className="gap-2" data-testid="tab-single">
              <Mail className="h-4 w-4" />
              Single Email
            </TabsTrigger>
            <TabsTrigger value="bulk" className="gap-2" data-testid="tab-bulk">
              <Users className="h-4 w-4" />
              Bulk Send
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <CardHover>
              <Form {...singleForm}>
                <form onSubmit={singleForm.handleSubmit(onSubmitSingle)} className="space-y-6">
                  {templates.length > 0 && (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1">
                        <Select value={templateSelectSingle} onValueChange={(val) => {
                          const t = templates.find(t => t.id.toString() === val);
                          if (t) loadTemplate(t, "single");
                          setTemplateSelectSingle("");
                        }}>
                          <SelectTrigger className="h-10" data-testid="select-template-single">
                            <SelectValue placeholder="Load a saved template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id.toString()}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {loadedTemplateSingle && (
                        <Button 
                          type="button" 
                          variant="default" 
                          size="sm" 
                          onClick={() => handleUpdateTemplate("single")}
                          disabled={updateTemplate.isPending}
                          data-testid="button-update-template-single"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </Button>
                      )}
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => openSaveDialog("single")}
                        data-testid="button-save-template-single"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save as Template
                      </Button>
                    </div>
                  )}
                  {templates.length === 0 && (
                    <div className="flex justify-end">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => openSaveDialog("single")}
                        data-testid="button-save-template-single-empty"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save as Template
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-6 md:grid-cols-2">
                    <FormField
                      control={singleForm.control}
                      name="to"
                      render={({ field }) => (
                        <FormItem className="col-span-2 md:col-span-1">
                          <FormLabel className="text-base font-semibold text-foreground/80">To</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="recipient@example.com" 
                              {...field} 
                              className="h-12 rounded-xl border-border bg-background"
                              data-testid="input-to"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={singleForm.control}
                      name="fromEmail"
                      render={({ field }) => (
                        <FormItem className="col-span-2 md:col-span-1">
                          <FormLabel className="text-base font-semibold text-foreground/80">From Email Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Name <email{{RANDOM}}@domain.com>" 
                              {...field} 
                              className="h-12 rounded-xl border-border bg-background"
                              data-testid="input-from"
                            />
                          </FormControl>
                          <FormDescription>Optional. Use {"{{FROM}}"} for the sending account's email, e.g. Name &lt;{"{{FROM}}"}&gt;. Use {"{{DOMAIN}}"} for the SMTP server's Domain Authentication, e.g. Name &lt;info@{"{{DOMAIN}}"}&gt;. Leave empty to use SMTP default.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={singleForm.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <div className="flex items-center justify-between gap-2">
                            <FormLabel className="text-base font-semibold text-foreground/80">Subject</FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleChangeSubject("single")}
                              disabled={rephraseSubject.isPending}
                              data-testid="button-change-subject-single"
                            >
                              {rephraseSubject.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Change Subject
                            </Button>
                          </div>
                          <FormControl>
                            <Input 
                              placeholder="Important Update" 
                              {...field} 
                              className="h-12 rounded-xl border-border bg-background"
                              data-testid="input-subject"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Inline Images Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Image className="h-5 w-5 text-muted-foreground" />
                        <span className="text-base font-semibold text-foreground/80">Inline Images</span>
                        {attachments.length > 0 && (
                          <Badge variant="secondary">{attachments.length} files</Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputSingleRef.current?.click()}
                        disabled={uploadAttachment.isPending}
                        data-testid="button-upload-image"
                      >
                        {uploadAttachment.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        Upload Images
                      </Button>
                      <input
                        ref={fileInputSingleRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const files = Array.from(e.target.files);
                            uploadAttachment.mutate(files);
                            e.target.value = '';
                          }
                        }}
                        data-testid="input-file-upload"
                      />
                    </div>
                    
                    {attachments.length > 0 && (
                      <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Click on a filename to copy the img tag:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {attachments.map((file) => (
                            <div 
                              key={file.filename}
                              className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg border hover-elevate cursor-pointer"
                              onClick={() => {
                                navigator.clipboard.writeText(`<img src="${file.filename}">`);
                                toast({ title: "Copied!", description: `<img src="${file.filename}">` });
                              }}
                              data-testid={`attachment-${file.filename}`}
                            >
                              <Image className="h-4 w-4 text-muted-foreground" />
                              <code className="text-sm font-mono">{file.filename}</code>
                              <span className="text-xs text-muted-foreground">
                                ({Math.round(file.size / 1024)}KB)
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => deleteAttachment.mutate(file.filename)}
                                disabled={deleteAttachment.isPending}
                                data-testid={`button-delete-attachment-${file.filename}`}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-muted-foreground" />
                      <span className="text-base font-semibold text-foreground/80">Short Link</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="https://domain.com/?{{RANDOM}}"
                        value={shortlinkUrlSingle}
                        onChange={(e) => setShortlinkUrlSingle(e.target.value)}
                        className="flex-1 rounded-xl"
                        data-testid="input-shortlink-url-single"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateShortlink("single")}
                        disabled={createShortlink.isPending}
                        data-testid="button-shortlink-single"
                      >
                        {createShortlink.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4 mr-2" />
                        )}
                        ShortLink
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-muted-foreground" />
                      <span className="text-base font-semibold text-foreground/80">Short Link (T.ly) — {`{{TYLINKS}}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="https://domain.com/?{{RANDOM}}"
                        value={tlylinkUrlSingle}
                        onChange={(e) => setTlylinkUrlSingle(e.target.value)}
                        className="flex-1 rounded-xl"
                        data-testid="input-tlylink-url-single"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCreateTlyShortlink("single")}
                        disabled={createTlyShortlink.isPending}
                        data-testid="button-tlylink-single"
                      >
                        {createTlyShortlink.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Link2 className="h-4 w-4 mr-2" />
                        )}
                        ShortLink
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Use {`{{TYLINKS}}`} in the message body — it gets shortened automatically when you send.
                    </p>
                  </div>

                  <FormField
                    control={singleForm.control}
                    name="body"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold text-foreground/80 flex justify-between items-center flex-wrap gap-2">
                          <span>Message Body</span>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRephraseMessage("single")}
                              disabled={rephraseMessage.isPending}
                              data-testid="button-change-msg-single"
                            >
                              {rephraseMessage.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Change MSG
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleResizeImages("single")}
                              disabled={resizeImages.isPending}
                              data-testid="button-resize-single"
                            >
                              {resizeImages.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Image className="h-4 w-4 mr-2" />
                              )}
                              Resize
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleEncodeMessage("single")}
                              disabled={encodeMessage.isPending}
                              data-testid="button-encode-single"
                            >
                              {encodeMessage.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Lock className="h-4 w-4 mr-2" />
                              )}
                              Encode
                            </Button>
                            <span className="text-xs font-normal text-muted-foreground uppercase tracking-wider">HTML Enabled</span>
                          </div>
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="<h1>Hello World</h1><p>Type your HTML content here...</p>"
                            className="min-h-[300px] font-mono text-sm leading-relaxed rounded-xl border-border bg-muted/20 resize-y p-4"
                            {...field}
                            data-testid="input-body"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground/80" htmlFor="company-name-single">
                      Company Name <span className="text-xs font-normal text-muted-foreground">(optional — protected from changes when using Change MSG)</span>
                    </label>
                    <Input
                      id="company-name-single"
                      placeholder="e.g. Acme Corp"
                      value={companyNameSingle}
                      onChange={(e) => setCompanyNameSingle(e.target.value)}
                      data-testid="input-company-name-single"
                    />
                  </div>

                  <FormField
                    control={singleForm.control}
                    name="enablePlainText"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-plain-text"
                          />
                        </FormControl>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <FormLabel className="font-semibold text-foreground/80 cursor-pointer">
                            Plain Text
                          </FormLabel>
                          <span className="text-xs text-muted-foreground">(multipart/alternative: text/plain + text/html)</span>
                        </div>
                      </FormItem>
                    )}
                  />

                  {singleForm.watch("enablePlainText") && (
                    <FormField
                      control={singleForm.control}
                      name="plainTextBody"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground/80 flex justify-between items-center">
                            <span>Message Plain Text</span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateArticle("single")}
                              disabled={generateArticle.isPending}
                              data-testid="button-generate-article-single"
                            >
                              {generateArticle.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4 mr-2" />
                              )}
                              Generate article
                            </Button>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Type your plain text content here..."
                              className="min-h-[150px] font-mono text-sm leading-relaxed rounded-xl border-border bg-muted/20 resize-y p-4"
                              {...field}
                              data-testid="input-plain-text-body"
                            />
                          </FormControl>
                          <FormDescription>This plain text version will be sent alongside the HTML version</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={singleForm.control}
                    name="encoding"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-foreground/80">Content Encoding</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-10 rounded-lg" data-testid="select-encoding">
                              <SelectValue placeholder="Select encoding" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {encodingOptions.map((enc) => (
                              <SelectItem key={enc} value={enc}>
                                {enc}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Choose how the email content is encoded</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={singleForm.control}
                    name="customHeaders"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-foreground/80">Custom Headers (Header Injection)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field}
                            placeholder="Received: from smtp-server.example.com (example.com [192.168.1.1])&#10;        by mx.google.com with ESMTPS id xyz123&#10;        for <recipient@example.com>"
                            className="min-h-[100px] font-mono text-sm"
                          />
                        </FormControl>
                        <FormDescription>Add custom email headers (each header on a new line). Supports tags like {"{{RANDOM}}"}</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={singleForm.control}
                    name="messageIdDomain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-foreground/80">Message-ID Domain</FormLabel>
                        <FormControl>
                          <Input 
                            {...field}
                            placeholder="mail.gmail.com"
                            className="font-mono text-sm"
                          />
                        </FormControl>
                        <FormDescription>Custom domain for Message-ID header. Leave empty to use from email domain.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={singleForm.control}
                    name="heloHostname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-semibold text-foreground/80">HELO / EHLO Hostname</FormLabel>
                        <FormControl>
                          <Input 
                            {...field}
                            value={field.value ?? ""}
                            placeholder="mail.yourdomain.com"
                            className="font-mono text-sm"
                            data-testid="input-helo-hostname-single"
                          />
                        </FormControl>
                        <FormDescription>Hostname sent in the SMTP HELO/EHLO command. Leave empty to use the SMTP server's Domain Authentication value.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField
                      control={singleForm.control}
                      name="isImportant"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-important"
                            />
                          </FormControl>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                            <FormLabel className="font-semibold text-foreground/80 cursor-pointer">
                              Important (High Priority)
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={singleForm.control}
                      name="sureInbox"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-sure-inbox"
                            />
                          </FormControl>
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-green-500" />
                            <FormLabel className="font-semibold text-foreground/80 cursor-pointer">
                              SURE INBOX
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={sendEmail.isPending}
                      className="rounded-xl px-8"
                      data-testid="button-send"
                    >
                      {sendEmail.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-5 w-5" />
                          Send Email
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardHover>
          </TabsContent>

          <TabsContent value="bulk">
            <div className="grid gap-6 lg:grid-cols-2">
              <CardHover>
                <Form {...bulkForm}>
                  <form onSubmit={bulkForm.handleSubmit(onSubmitBulk)} className="space-y-6">
                    {templates.length > 0 && (
                      <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <Select value={templateSelectBulk} onValueChange={(val) => {
                            const t = templates.find(t => t.id.toString() === val);
                            if (t) loadTemplate(t, "bulk");
                            setTemplateSelectBulk("");
                          }}>
                            <SelectTrigger className="h-10" data-testid="select-template-bulk">
                              <SelectValue placeholder="Load a saved template..." />
                            </SelectTrigger>
                            <SelectContent>
                              {templates.map((t) => (
                                <SelectItem key={t.id} value={t.id.toString()}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {loadedTemplateBulk && (
                          <Button 
                            type="button" 
                            variant="default" 
                            size="sm" 
                            onClick={() => handleUpdateTemplate("bulk")}
                            disabled={updateTemplate.isPending}
                            data-testid="button-update-template-bulk"
                          >
                            <Save className="h-4 w-4 mr-2" />
                            Save
                          </Button>
                        )}
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openSaveDialog("bulk")}
                          data-testid="button-save-template-bulk"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save as Template
                        </Button>
                      </div>
                    )}
                    {templates.length === 0 && (
                      <div className="flex justify-end">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openSaveDialog("bulk")}
                          data-testid="button-save-template-bulk-empty"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          Save as Template
                        </Button>
                      </div>
                    )}
                    <FormField
                      control={bulkForm.control}
                      name="sendMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold text-foreground/80">Sending Mode</FormLabel>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant={field.value !== "bcc" ? "default" : "outline"}
                              className="h-11 rounded-xl"
                              onClick={() => field.onChange("single")}
                              data-testid="button-mode-single"
                            >
                              <Mail className="h-4 w-4 mr-2" />
                              Single (one per recipient)
                            </Button>
                            <Button
                              type="button"
                              variant={field.value === "bcc" ? "default" : "outline"}
                              className="h-11 rounded-xl"
                              onClick={() => field.onChange("bcc")}
                              data-testid="button-mode-bcc"
                            >
                              <Users className="h-4 w-4 mr-2" />
                              BCC (batch)
                            </Button>
                          </div>
                          <FormDescription>
                            {field.value === "bcc"
                              ? "Each message goes to one To address with up to Batch Size recipients hidden in BCC."
                              : "Each recipient gets their own individual message."}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {bulkForm.watch("sendMode") === "bcc" && (
                      <FormField
                        control={bulkForm.control}
                        name="bccToEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold text-foreground/80">To Email (BCC mode)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="visible@example.com"
                                {...field}
                                value={field.value || ""}
                                className="h-12 rounded-xl border-border bg-background"
                                data-testid="input-bcc-to"
                              />
                            </FormControl>
                            <FormDescription>
                              The visible recipient shown in the To header (also receives a copy). Leave empty to hide all recipients ("undisclosed-recipients").
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={bulkForm.control}
                      name="emails"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <FormLabel className="text-base font-semibold text-foreground/80">Email Addresses</FormLabel>
                            {field.value && field.value.trim().length > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const emails = field.value.split(/[\n,]/).map(e => e.trim()).filter(e => e).join("\n");
                                  const blob = new Blob([emails], { type: 'text/plain' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'remaining_emails.txt';
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                }}
                                data-testid="button-download-emails"
                              >
                                <Upload className="h-4 w-4 mr-2 rotate-180" />
                                Download
                              </Button>
                            )}
                          </div>
                          <FormControl>
                            <Textarea
                              placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
                              className="min-h-[120px] font-mono text-sm leading-relaxed rounded-xl border-border bg-muted/20 resize-y p-4"
                              {...field}
                              data-testid="input-bulk-emails"
                            />
                          </FormControl>
                          <FormDescription>
                            Enter one email per line, or separate with commas
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={bulkForm.control}
                      name="fromEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold text-foreground/80">From Email Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Name <email{{RANDOM}}@domain.com>" 
                              {...field} 
                              className="h-12 rounded-xl border-border bg-background"
                              data-testid="input-bulk-from"
                            />
                          </FormControl>
                          <FormDescription>Optional. Use {"{{FROM}}"} for each account's email, e.g. Name &lt;{"{{FROM}}"}&gt;. Use {"{{DOMAIN}}"} for each SMTP server's Domain Authentication, e.g. Name &lt;info@{"{{DOMAIN}}"}&gt;. Also supports {"{{RANDOM}}"}. Leave empty to use SMTP default.</FormDescription>
                          <FormMessage />

                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-lg"
                                onClick={() => {
                                  const input = document.createElement('input');
                                  input.type = 'file';
                                  input.accept = '.txt';
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = (ev) => {
                                      const text = ev.target?.result as string;
                                      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
                                      if (lines.length === 0) {
                                        toast({ title: "Empty file", description: "No from emails found in the file.", variant: "destructive" });
                                        return;
                                      }
                                      bulkForm.setValue("fromEmailList", lines);
                                      toast({ title: "From emails loaded", description: `${lines.length} from email(s) loaded from file. Each will be used once per email.` });
                                    };
                                    reader.readAsText(file);
                                  };
                                  input.click();
                                }}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Browse From Emails File
                              </Button>
                              {bulkForm.watch("fromEmailList") && bulkForm.watch("fromEmailList")!.length > 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => bulkForm.setValue("fromEmailList", undefined)}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Clear
                                </Button>
                              )}
                            </div>
                            {bulkForm.watch("fromEmailList") && bulkForm.watch("fromEmailList")!.length > 0 && (
                              <div className="rounded-lg border border-border bg-muted/30 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {bulkForm.watch("fromEmailList")!.length} from email(s) loaded
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">Each used once per email, rotating sequentially</span>
                                </div>
                                <ScrollArea className="max-h-[120px]">
                                  <div className="space-y-1 font-mono text-xs text-muted-foreground">
                                    {bulkForm.watch("fromEmailList")!.map((line, i) => (
                                      <div key={i} className="truncate">
                                        <span className="text-foreground/50 mr-2">{i + 1}.</span>
                                        {line}
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </div>
                            )}
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={bulkForm.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between gap-2">
                            <FormLabel className="text-base font-semibold text-foreground/80">Subject</FormLabel>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleChangeSubject("bulk")}
                              disabled={rephraseSubject.isPending}
                              data-testid="button-change-subject-bulk"
                            >
                              {rephraseSubject.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Change Subject
                            </Button>
                          </div>
                          <FormControl>
                            <Input 
                              placeholder="Important Update" 
                              {...field} 
                              className="h-12 rounded-xl border-border bg-background"
                              data-testid="input-bulk-subject"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <FormField
                        control={bulkForm.control}
                        name="delaySeconds"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-foreground/80">Delay (seconds)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min={0}
                                max={60}
                                placeholder="1" 
                                {...field}
                                onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                className="h-10 rounded-lg border-border bg-background"
                                data-testid="input-delay"
                              />
                            </FormControl>
                            <FormDescription>0-60 sec between emails</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={bulkForm.control}
                        name="batchSize"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-foreground/80">Batch Size</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min={0}
                                max={1000}
                                placeholder="Leave empty for all" 
                                {...field}
                                value={field.value || ""}
                                onChange={e => {
                                  const val = e.target.value;
                                  field.onChange(val === "" ? undefined : parseInt(val) || 0);
                                }}
                                className="h-10 rounded-lg border-border bg-background"
                                data-testid="input-batch-size"
                              />
                            </FormControl>
                            <FormDescription>
                              {bulkForm.watch("sendMode") === "bcc" ? "BCC recipients per message" : "Emails per connection"}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={bulkForm.control}
                        name="concurrentConnections"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-foreground/80">Connections</FormLabel>
                            <FormControl>
                              <Input 
                                type="number"
                                min={1}
                                max={50}
                                placeholder="1" 
                                {...field}
                                onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                                className="h-10 rounded-lg border-border bg-background"
                                data-testid="input-concurrent-connections"
                              />
                            </FormControl>
                            <FormDescription>Parallel sends (1-50)</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={bulkForm.control}
                        name="encoding"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-foreground/80">Content Encoding</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-10 rounded-lg" data-testid="select-bulk-encoding">
                                  <SelectValue placeholder="Select encoding" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {encodingOptions.map((enc) => (
                                  <SelectItem key={enc} value={enc}>
                                    {enc}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>Email content encoding</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={bulkForm.control}
                      name="customHeaders"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground/80">Custom Headers (Header Injection)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field}
                              placeholder="Received: from smtp-server.example.com (example.com [192.168.1.1])&#10;        by mx.google.com with ESMTPS id xyz123&#10;        for <recipient@example.com>"
                              className="min-h-[100px] font-mono text-sm"
                            />
                          </FormControl>
                          <FormDescription>Add custom email headers (each header on a new line). Supports tags like {"{{RANDOM}}"}</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={bulkForm.control}
                      name="messageIdDomain"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground/80">Message-ID Domain</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              placeholder="mail.gmail.com"
                              className="font-mono text-sm"
                            />
                          </FormControl>
                          <FormDescription>Custom domain for Message-ID header. Leave empty to use from email domain.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={bulkForm.control}
                      name="heloHostname"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-semibold text-foreground/80">HELO / EHLO Hostname</FormLabel>
                          <FormControl>
                            <Input 
                              {...field}
                              value={field.value ?? ""}
                              placeholder="mail.yourdomain.com"
                              className="font-mono text-sm"
                              data-testid="input-helo-hostname-bulk"
                            />
                          </FormControl>
                          <FormDescription>Hostname sent in the SMTP HELO/EHLO command. Leave empty to use the SMTP server's Domain Authentication value.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Inline Images Section for Bulk */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Image className="h-5 w-5 text-muted-foreground" />
                          <span className="text-base font-semibold text-foreground/80">Inline Images</span>
                          {attachments.length > 0 && (
                            <Badge variant="secondary">{attachments.length} files</Badge>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputBulkRef.current?.click()}
                          disabled={uploadAttachment.isPending}
                          data-testid="button-upload-image-bulk"
                        >
                          {uploadAttachment.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-2" />
                          )}
                          Upload Images
                        </Button>
                        <input
                          ref={fileInputBulkRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              const files = Array.from(e.target.files);
                              uploadAttachment.mutate(files);
                              e.target.value = '';
                            }
                          }}
                          data-testid="input-file-upload-bulk"
                        />
                      </div>
                      
                      {attachments.length > 0 && (
                        <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Click on a filename to copy the img tag:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {attachments.map((file) => (
                              <div 
                                key={file.filename}
                                className="flex items-center gap-2 bg-background px-3 py-2 rounded-lg border hover-elevate cursor-pointer"
                                onClick={() => {
                                  navigator.clipboard.writeText(`<img src="${file.filename}">`);
                                  toast({ title: "Copied!", description: `<img src="${file.filename}">` });
                                }}
                                data-testid={`attachment-bulk-${file.filename}`}
                              >
                                <Image className="h-4 w-4 text-muted-foreground" />
                                <code className="text-sm font-mono">{file.filename}</code>
                                <span className="text-xs text-muted-foreground">
                                  ({Math.round(file.size / 1024)}KB)
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => deleteAttachment.mutate(file.filename)}
                                  disabled={deleteAttachment.isPending}
                                  data-testid={`button-delete-attachment-bulk-${file.filename}`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-muted-foreground" />
                        <span className="text-base font-semibold text-foreground/80">Short Link</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="https://domain.com/?{{RANDOM}}"
                          value={shortlinkUrlBulk}
                          onChange={(e) => setShortlinkUrlBulk(e.target.value)}
                          className="flex-1 rounded-xl"
                          data-testid="input-shortlink-url-bulk"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateShortlink("bulk")}
                          disabled={createShortlink.isPending}
                          data-testid="button-shortlink-bulk"
                        >
                          {createShortlink.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4 mr-2" />
                          )}
                          ShortLink
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-muted-foreground" />
                        <span className="text-base font-semibold text-foreground/80">Short Link (T.ly) — {`{{TYLINKS}}`}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="https://domain.com/?{{RANDOM}}"
                          value={tlylinkUrlBulk}
                          onChange={(e) => setTlylinkUrlBulk(e.target.value)}
                          className="flex-1 rounded-xl"
                          data-testid="input-tlylink-url-bulk"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCreateTlyShortlink("bulk")}
                          disabled={createTlyShortlink.isPending}
                          data-testid="button-tlylink-bulk"
                        >
                          {createTlyShortlink.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Link2 className="h-4 w-4 mr-2" />
                          )}
                          ShortLink
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Use {`{{TYLINKS}}`} in the message body — when you press Send to All it is shortened automatically.
                      </p>
                    </div>

                    <FormField
                      control={bulkForm.control}
                      name="body"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-semibold text-foreground/80 flex justify-between items-center flex-wrap gap-2">
                            <span>Message Body</span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleRephraseMessage("bulk")}
                                disabled={rephraseMessage.isPending}
                                data-testid="button-change-msg-bulk"
                              >
                                {rephraseMessage.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                Change MSG
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleResizeImages("bulk")}
                                disabled={resizeImages.isPending}
                                data-testid="button-resize-bulk"
                              >
                                {resizeImages.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Image className="h-4 w-4 mr-2" />
                                )}
                                Resize
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleEncodeMessage("bulk")}
                                disabled={encodeMessage.isPending}
                                data-testid="button-encode-bulk"
                              >
                                {encodeMessage.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Lock className="h-4 w-4 mr-2" />
                                )}
                                Encode
                              </Button>
                              <span className="text-xs font-normal text-muted-foreground uppercase tracking-wider">HTML Enabled</span>
                            </div>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="<h1>Hello World</h1><p>Type your HTML content here...</p>"
                              className="min-h-[180px] font-mono text-sm leading-relaxed rounded-xl border-border bg-muted/20 resize-y p-4"
                              {...field}
                              data-testid="input-bulk-body"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground/80" htmlFor="company-name-bulk">
                        Company Name <span className="text-xs font-normal text-muted-foreground">(optional — protected from changes when using Change MSG)</span>
                      </label>
                      <Input
                        id="company-name-bulk"
                        placeholder="e.g. Acme Corp"
                        value={companyNameBulk}
                        onChange={(e) => setCompanyNameBulk(e.target.value)}
                        data-testid="input-company-name-bulk"
                      />
                    </div>

                    <FormField
                      control={bulkForm.control}
                      name="enablePlainText"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-bulk-plain-text"
                            />
                          </FormControl>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            <FormLabel className="font-semibold text-foreground/80 cursor-pointer">
                              Plain Text
                            </FormLabel>
                            <span className="text-xs text-muted-foreground">(multipart/alternative: text/plain + text/html)</span>
                          </div>
                        </FormItem>
                      )}
                    />

                    {bulkForm.watch("enablePlainText") && (
                      <FormField
                        control={bulkForm.control}
                        name="plainTextBody"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="font-semibold text-foreground/80 flex justify-between items-center">
                              <span>Message Plain Text</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleGenerateArticle("bulk")}
                                disabled={generateArticle.isPending}
                                data-testid="button-generate-article-bulk"
                              >
                                {generateArticle.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <FileText className="h-4 w-4 mr-2" />
                                )}
                                Generate article
                              </Button>
                            </FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Type your plain text content here..."
                                className="min-h-[150px] font-mono text-sm leading-relaxed rounded-xl border-border bg-muted/20 resize-y p-4"
                                {...field}
                                data-testid="input-bulk-plain-text-body"
                              />
                            </FormControl>
                            <FormDescription>This plain text version will be sent alongside the HTML version</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="grid gap-3 md:grid-cols-2">
                      <FormField
                        control={bulkForm.control}
                        name="isImportant"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-bulk-important"
                              />
                            </FormControl>
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                              <FormLabel className="font-semibold text-foreground/80 cursor-pointer">
                                Important (High Priority)
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={bulkForm.control}
                        name="sureInbox"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center gap-3 space-y-0 rounded-lg border border-border p-4">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-bulk-sure-inbox"
                              />
                            </FormControl>
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-4 w-4 text-green-500" />
                              <FormLabel className="font-semibold text-foreground/80 cursor-pointer">
                                SURE INBOX
                              </FormLabel>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      {isSending && (
                        <Button
                          type="button"
                          size="lg"
                          variant="destructive"
                          onClick={() => stopBulkSending.mutate()}
                          disabled={stopBulkSending.isPending}
                          className="rounded-xl px-8"
                          data-testid="button-stop-bulk"
                        >
                          {stopBulkSending.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                              Stopping...
                            </>
                          ) : (
                            <>
                              <StopCircle className="mr-2 h-5 w-5" />
                              Stop
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        type="submit"
                        size="lg"
                        disabled={sendBulkEmails.isPending || isSending}
                        className="rounded-xl px-8"
                        data-testid="button-send-bulk"
                      >
                        {sendBulkEmails.isPending || isSending ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Users className="mr-2 h-5 w-5" />
                            Send to All
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardHover>

              <CardHover className="flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border/50">
                  <h3 className="font-bold text-foreground flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Sending Progress
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setLogsDialogOpen(true)} disabled={logs.length === 0}>
                      <Eye className="h-4 w-4 mr-1" />
                      View Logs
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadLogs} disabled={logs.length === 0}>
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearLogs} disabled={logs.length === 0}>
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-8 py-4">
                  {totalCount > 0 || isSending ? (
                    <>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-3xl font-bold text-foreground">{sentCount + failedCount}</span>
                        <span className="text-xs text-muted-foreground">/ {totalCount} Total</span>
                      </div>
                      <div className="h-12 w-px bg-border" />
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-3xl font-bold text-green-500">{sentCount}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Sent
                        </span>
                      </div>
                      <div className="h-12 w-px bg-border" />
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-3xl font-bold text-red-500">{failedCount}</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <XCircle className="h-3 w-3" /> Failed
                        </span>
                      </div>
                      {isSending && (
                        <>
                          <div className="h-12 w-px bg-border" />
                          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        </>
                      )}
                    </>
                  ) : (
                    <div className="text-muted-foreground text-sm py-2">
                      Email counts will appear here during bulk sending
                    </div>
                  )}
                </div>
              </CardHover>

              <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[80vh]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      Sending Logs
                    </DialogTitle>
                    <DialogDescription>
                      {logs.length} log entries - Sent: {sentCount}, Failed: {failedCount}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Button size="sm" variant="outline" onClick={downloadLogs} disabled={logs.length === 0}>
                      <Download className="h-4 w-4 mr-1" />
                      Download Logs
                    </Button>
                    <Button size="sm" variant="ghost" onClick={clearLogs} disabled={logs.length === 0}>
                      Clear
                    </Button>
                  </div>
                  <div 
                    ref={logsContainerRef}
                    className="h-[500px] overflow-y-auto pr-3 border rounded-md p-3 bg-muted/30"
                  >
                    {logs.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No logs available
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div key={log.id} className="text-sm font-mono">
                            {log.type === 'start' && (
                              <div className="flex items-start gap-2 text-blue-500">
                                <Loader2 className="h-4 w-4 mt-0.5 animate-spin flex-shrink-0" />
                                <span>Starting bulk send: {log.data.total} emails, {log.data.smtpCount} SMTP server(s)</span>
                              </div>
                            )}
                            {log.type === 'smtp_switch' && (
                              <div className="flex items-start gap-2 text-purple-500 font-semibold">
                                <ArrowRightLeft className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>Switching to: {log.data.configName} (batch size: {log.data.batchSize})</span>
                              </div>
                            )}
                            {log.type === 'batch_complete' && (
                              <div className="flex items-start gap-2 text-orange-500">
                                <Server className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>Batch {log.data.batchNumber + 1} complete ({log.data.emailsInBatch} emails), closing connection</span>
                              </div>
                            )}
                            {log.type === 'sending' && (
                              <div className="flex items-start gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 mt-0.5 animate-spin flex-shrink-0" />
                                <span className="truncate">[{log.data.index}/{log.data.total}] [{log.data.smtp}] Sending to {log.data.email}</span>
                              </div>
                            )}
                            {log.type === 'sent' && (
                              <div className="flex items-start gap-2 text-green-500">
                                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span className="truncate">[{log.data.index}] [{log.data.smtpName}] Sent to {log.data.email}</span>
                              </div>
                            )}
                            {log.type === 'failed' && (
                              <div className="flex items-start gap-2 text-red-500">
                                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span className="truncate">[{log.data.index}] [{log.data.smtpName}] Failed: {log.data.email} - {log.data.error}</span>
                              </div>
                            )}
                            {log.type === 'stopping' && (
                              <div className="flex items-start gap-2 text-orange-500 font-semibold">
                                <StopCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{log.data.message}</span>
                              </div>
                            )}
                            {log.type === 'stopped' && (
                              <div className="flex items-start gap-2 text-orange-600 font-semibold">
                                <StopCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{log.data.message} - Sent: {log.data.sent}, Failed: {log.data.failed}, Remaining: {log.data.remaining}</span>
                              </div>
                            )}
                            {log.type === 'ratelimit_stop' && (
                              <div className="flex items-start gap-2 text-red-600 font-bold bg-red-100 dark:bg-red-900/30 p-2 rounded-md">
                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>RATE LIMIT DETECTED! {log.data.message} - Email: {log.data.email}</span>
                              </div>
                            )}
                            {log.type === 'complete' && (
                              <div className="flex items-start gap-2 text-green-600 font-semibold">
                                <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>
                                  {log.data.stoppedByUser 
                                    ? `Stopped by user! Sent: ${log.data.sent}, Failed: ${log.data.failed}` 
                                    : log.data.stoppedBySureInbox 
                                    ? `Stopped by SURE INBOX! Sent: ${log.data.sent}, Failed: ${log.data.failed}` 
                                    : `Complete! Sent: ${log.data.sent}, Failed: ${log.data.failed}`}
                                </span>
                              </div>
                            )}
                            {log.type === 'sure_inbox_test' && (
                              <div className="flex items-start gap-2 text-blue-500">
                                <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>SURE INBOX: {log.data.message}</span>
                              </div>
                            )}
                            {log.type === 'sure_inbox_success' && (
                              <div className="flex items-start gap-2 text-green-500 font-semibold">
                                <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>SURE INBOX: {log.data.message}</span>
                              </div>
                            )}
                            {log.type === 'sure_inbox_failed' && (
                              <div className="flex items-start gap-2 text-red-600 font-semibold">
                                <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>SURE INBOX FAILED: {log.data.message}</span>
                              </div>
                            )}
                          </div>
                        ))}
                        <div ref={logsEndRef} />
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </TabsContent>
        </Tabs>

        {templates.length > 0 && (
          <CardHover className="mt-6">
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-border/50">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Saved Templates ({templates.length})
              </h3>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <div 
                  key={template.id} 
                  className="p-4 rounded-lg border border-border bg-muted/20 hover-elevate"
                  data-testid={`template-card-${template.id}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-foreground truncate">{template.name}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTemplate.mutate(template.id)}
                      disabled={deleteTemplate.isPending}
                      data-testid={`button-delete-template-${template.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mb-1">
                    Subject: {template.subject}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.body.replace(/<[^>]*>/g, '').substring(0, 80)}...
                  </p>
                </div>
              ))}
            </div>
          </CardHover>
        )}
      </motion.div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
            <DialogDescription>
              Save the current subject and message body as a reusable template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Template Name</label>
              <Input
                placeholder="Enter template name..."
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                data-testid="input-template-name"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setSaveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={handleSaveTemplate}
                disabled={createTemplate.isPending}
                data-testid="button-confirm-save-template"
              >
                {createTemplate.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Template
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
