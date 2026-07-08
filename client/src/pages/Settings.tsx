import React, { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { insertSmtpConfigSchema, type InsertSmtpConfig, type SmtpConfig, type Tag, type ImageTag } from "@shared/schema";
import { useSMTPConfigs, useCreateSMTPConfig, useUpdateSMTPConfig, useDeleteSMTPConfig } from "@/hooks/use-smtp";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { CardHover } from "@/components/ui/card-hover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Save, Server, Loader2, Globe, Plus, Pencil, Trash2, Power, Tag as TagIcon, RefreshCw, RotateCcw, Download, Upload, CheckCircle, XCircle, Zap, Image as ImageIcon, MailPlus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface TagWithCounts extends Tag {
  total: number;
  remaining: number;
}

interface ServerIPResponse {
  localIPs: string[];
  forwardedFor: string | null;
  realIp: string | null;
  publicIP: string | null;
  outboundIPs?: string[];
  hostname: string;
  note?: string;
}

function SMTPForm({ 
  config, 
  onSubmit, 
  isPending, 
  onCancel 
}: { 
  config?: SmtpConfig | null; 
  onSubmit: (data: InsertSmtpConfig) => void; 
  isPending: boolean;
  onCancel?: () => void;
}) {
  const form = useForm<InsertSmtpConfig>({
    resolver: zodResolver(insertSmtpConfigSchema),
    defaultValues: {
      name: config?.name || "Default",
      host: config?.host || "",
      port: config?.port || 25,
      username: config?.username || "",
      password: config?.password || "",
      fromEmail: config?.fromEmail || "",
      isSecure: config?.isSecure || false,
      domainAuth: config?.domainAuth || "",
      isActive: config?.isActive ?? true,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        name: config.name,
        host: config.host,
        port: config.port,
        username: config.username || "",
        password: config.password || "",
        fromEmail: config.fromEmail,
        isSecure: config.isSecure,
        domainAuth: config.domainAuth || "",
        isActive: config.isActive ?? true,
      });
    }
  }, [config, form]);

  function handleSubmit(data: InsertSmtpConfig) {
    const cleanedData = {
      ...data,
      username: data.username?.trim() || null,
      password: data.password?.trim() || null,
      domainAuth: data.domainAuth?.trim() || null,
    };
    onSubmit(cleanedData);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Server Name</FormLabel>
              <FormControl>
                <Input placeholder="My SMTP Server" {...field} className="h-10 rounded-lg" data-testid="input-smtp-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="host"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Host</FormLabel>
                <FormControl>
                  <Input placeholder="smtp.example.com" {...field} className="h-10 rounded-lg" data-testid="input-smtp-host" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="port"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Port</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="25" 
                    {...field} 
                    onChange={e => field.onChange(parseInt(e.target.value) || 25)}
                    className="h-10 rounded-lg"
                    data-testid="input-smtp-port"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Username <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="Leave empty for no auth" {...field} value={field.value || ""} className="h-10 rounded-lg" data-testid="input-smtp-username" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-semibold">Password <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Leave empty for no auth" {...field} value={field.value || ""} className="h-10 rounded-lg" data-testid="input-smtp-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="fromEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">From Email Address</FormLabel>
              <FormControl>
                <Input placeholder="Sender Name <sender@example.com>" {...field} className="h-10 rounded-lg" data-testid="input-smtp-from" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="domainAuth"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="font-semibold">Domain Authentication <span className="text-muted-foreground font-normal">(Optional)</span></FormLabel>
              <FormControl>
                <Input placeholder="example.domain.com" {...field} value={field.value || ""} className="h-10 rounded-lg" data-testid="input-smtp-domain" />
              </FormControl>
              <FormDescription>HELO/EHLO domain name for SMTP authentication</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-6">
          <FormField
            control={form.control}
            name="isSecure"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value || false} onCheckedChange={field.onChange} data-testid="checkbox-secure" />
                </FormControl>
                <FormLabel className="font-normal">Use SSL/TLS</FormLabel>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value || false} onCheckedChange={field.onChange} data-testid="checkbox-active" />
                </FormControl>
                <FormLabel className="font-normal">Active</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          )}
          <Button type="submit" disabled={isPending} data-testid="button-save-smtp">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {config ? "Update" : "Add"} Server
          </Button>
        </div>
      </form>
    </Form>
  );
}

const SMTP_EXPORT_HEADER = "name\thost\tport\tusername\tpassword\tfromEmail\tisSecure\tdomainAuth\tisActive";

function isFullFormatLines(lines: string[]): boolean {
  if (!lines || lines.length === 0) return false;
  return lines[0].trim().toLowerCase().startsWith("name\thost\tport");
}

export default function Settings() {
  const { data: configs, isLoading } = useSMTPConfigs();
  const createConfig = useCreateSMTPConfig();
  const updateConfig = useUpdateSMTPConfig();
  const deleteConfig = useDeleteSMTPConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [ipData, setIpData] = useState<ServerIPResponse | null>(null);
  const [isLoadingIP, setIsLoadingIP] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SmtpConfig | null>(null);
  
  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importHost, setImportHost] = useState("");
  const [importPort, setImportPort] = useState(25);
  const [importUsername, setImportUsername] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [importIsSecure, setImportIsSecure] = useState(false);
  const [importIsActive, setImportIsActive] = useState(true);
  const [importFileContent, setImportFileContent] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  // Webmail import dialog state
  const [webmailDialogOpen, setWebmailDialogOpen] = useState(false);
  const [webmailText, setWebmailText] = useState("");
  const [webmailVerify, setWebmailVerify] = useState(true);
  const [isImportingWebmails, setIsImportingWebmails] = useState(false);
  const [webmailResults, setWebmailResults] = useState<{
    summary: { total: number; processed: number; created: number; inactive: number; failed: number; skipped: number; truncated: boolean };
    results: { email: string; success: boolean; verified: boolean; host: string | null; port: number | null; message: string }[];
  } | null>(null);
  
  // Multi-select state
  const [selectedServers, setSelectedServers] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  // SMTP test state
  const [testingConfigId, setTestingConfigId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; logs: string[] } | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedTag, setSelectedTag] = useState<TagWithCounts | null>(null);
  const [tagValuesText, setTagValuesText] = useState("");

  const { data: tagsData, isLoading: isLoadingTags } = useQuery<TagWithCounts[]>({
    queryKey: ['/api/tags'],
    refetchInterval: 3000,
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to create tag');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      setTagDialogOpen(false);
      setNewTagName("");
      toast({ title: "Tag Created", description: "New tag has been created successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete tag');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      setSelectedTag(null);
      toast({ title: "Tag Deleted", description: "Tag has been deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addValuesMutation = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      const res = await fetch(`/api/tags/${id}/values`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('Failed to add values');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      setTagValuesText("");
      toast({ title: "Values Added", description: `Added ${data.added} values to the tag.` });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tags/${id}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset tag');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({ title: "Tag Reset", description: "All values are available again." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Image Tags state
  const [imageTagDialogOpen, setImageTagDialogOpen] = useState(false);
  const [newImageTagName, setNewImageTagName] = useState("");
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const imageFileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: imageTagsData, isLoading: isLoadingImageTags } = useQuery<ImageTag[]>({
    queryKey: ['/api/image-tags'],
    refetchInterval: 3000,
  });

  const createImageTagMutation = useMutation({
    mutationFn: async ({ name, file }: { name: string; file: File }) => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('file', file);
      const res = await fetch('/api/image-tags', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to create image tag');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/image-tags'] });
      setImageTagDialogOpen(false);
      setNewImageTagName("");
      setSelectedImageFile(null);
      toast({ title: "Image Tag Created", description: "New image tag has been created successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteImageTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/image-tags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete image tag');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/image-tags'] });
      toast({ title: "Image Tag Deleted", description: "Image tag has been deleted." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const [isRestarting, setIsRestarting] = useState(false);

  async function checkIP() {
    setIsLoadingIP(true);
    try {
      const res = await fetch('/api/server-ip');
      if (res.ok) {
        const data = await res.json();
        setIpData(data);
      }
    } catch (error) {
      console.error('Failed to get IP:', error);
    } finally {
      setIsLoadingIP(false);
    }
  }

  async function restartServer() {
    setIsRestarting(true);
    try {
      const res = await fetch('/api/restart-server', { method: 'POST' });
      if (res.ok) {
        toast({ title: "Restarting Server", description: "The server will restart in 2 seconds. Page will refresh automatically." });
        setTimeout(() => {
          window.location.reload();
        }, 5000);
      }
    } catch (error) {
      console.error('Failed to restart server:', error);
      toast({ title: "Error", description: "Failed to restart server", variant: "destructive" });
      setIsRestarting(false);
    }
  }

  function handleCreate(data: InsertSmtpConfig) {
    createConfig.mutate(data, {
      onSuccess: () => setAddDialogOpen(false),
    });
  }

  function handleUpdate(data: InsertSmtpConfig) {
    if (editingConfig) {
      updateConfig.mutate({ id: editingConfig.id, data }, {
        onSuccess: () => setEditingConfig(null),
      });
    }
  }

  function handleDelete(id: number) {
    deleteConfig.mutate(id);
  }

  function handleServerSelect(configId: number, index: number, event: React.MouseEvent) {
    if (!configs) return;
    
    if (event.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const newSelected = new Set(selectedServers);
      
      for (let i = start; i <= end; i++) {
        newSelected.add(configs[i].id);
      }
      
      setSelectedServers(newSelected);
    } else {
      const newSelected = new Set(selectedServers);
      if (newSelected.has(configId)) {
        newSelected.delete(configId);
      } else {
        newSelected.add(configId);
      }
      setSelectedServers(newSelected);
      setLastClickedIndex(index);
    }
  }

  function handleSelectAll() {
    if (!configs) return;
    if (selectedServers.size === configs.length) {
      setSelectedServers(new Set());
    } else {
      setSelectedServers(new Set(configs.map(c => c.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedServers.size === 0) return;
    
    setIsBulkDeleting(true);
    const idsToDelete = Array.from(selectedServers);
    
    for (const id of idsToDelete) {
      await new Promise<void>((resolve) => {
        deleteConfig.mutate(id, {
          onSuccess: () => resolve(),
          onError: () => resolve(),
        });
      });
    }
    
    setSelectedServers(new Set());
    setLastClickedIndex(null);
    setIsBulkDeleting(false);
    
    toast({
      title: "Deleted",
      description: `${idsToDelete.length} server(s) deleted successfully.`,
    });
  }

  function handleSelectNotSend() {
    if (!configs) return;
    const notSent = configs.filter(c => (c.sentCount ?? 0) === 0);
    if (notSent.length === 0) {
      toast({
        title: "No servers to select",
        description: "All SMTP servers already have a sent count.",
      });
      return;
    }
    setSelectedServers(new Set(notSent.map(c => c.id)));
    setLastClickedIndex(null);
    toast({
      title: "Selected",
      description: `${notSent.length} server(s) with no sent emails selected.`,
    });
  }

  function handleExportSelected() {
    if (!configs || selectedServers.size === 0) return;
    const selected = configs.filter(c => selectedServers.has(c.id));
    // Full tab-separated export including host/port/credentials so the file can
    // be re-imported on its own without re-entering any connection details.
    // First line is a header that the importer uses to auto-detect this format.
    const rows = selected.map(c => [
      (c.name ?? "").trim(),
      (c.host ?? "").trim(),
      String(c.port ?? ""),
      (c.username ?? "").trim(),
      (c.password ?? "").trim(),
      (c.fromEmail ?? "").trim(),
      c.isSecure ? "true" : "false",
      (c.domainAuth ?? "").trim(),
      c.isActive ? "true" : "false",
    ].join("\t"));
    const content = [SMTP_EXPORT_HEADER, ...rows].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.download = `smtp-servers-${selected.length}-${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Exported",
      description: `${selected.length} server(s) exported to a text file.`,
    });
  }

  async function handleResetSentCounts() {
    try {
      const res = await fetch('/api/smtp/reset-sent-counts', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reset sent counts');
      queryClient.invalidateQueries({ queryKey: ['/api/smtp/configs'] });
      toast({
        title: "Sent Counts Reset",
        description: "All SMTP server sent counts have been reset to 0.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  async function handleTestSMTP(configId: number) {
    setTestingConfigId(configId);
    setTestResult(null);
    setTestDialogOpen(true);
    
    try {
      const res = await fetch(`/api/smtp/configs/${configId}/test`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult(data);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: `Request failed: ${error.message}`,
        logs: [`[${new Date().toISOString()}] ERROR: ${error.message}`]
      });
    } finally {
      setTestingConfigId(null);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      setImportFileContent(lines);
    };
    reader.readAsText(file);
  }

  async function handleImportServers() {
    if (importFileContent.length === 0) {
      toast({ title: "Error", description: "Please select a file to import.", variant: "destructive" });
      return;
    }

    const fullFormat = isFullFormatLines(importFileContent);

    if (!fullFormat && !importHost) {
      toast({ title: "Error", description: "Please fill in Host, or upload a full-format export file (with host/port included).", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    // For full-format files the first line is a header — skip it.
    const dataLines = fullFormat ? importFileContent.slice(1) : importFileContent;

    for (const line of dataLines) {
      if (!line.trim()) continue;
      const parts = line.split('\t');

      let serverData: InsertSmtpConfig;

      if (fullFormat) {
        const name = (parts[0] ?? "").trim();
        const host = (parts[1] ?? "").trim();
        const port = parseInt((parts[2] ?? "").trim(), 10) || 25;
        const username = (parts[3] ?? "").trim();
        const password = (parts[4] ?? "").trim();
        const fromEmail = (parts[5] ?? "").trim();
        const isSecure = (parts[6] ?? "").trim().toLowerCase() === "true";
        const domainAuth = (parts[7] ?? "").trim();
        const isActive = (parts[8] ?? "").trim().toLowerCase() !== "false";

        if (!host || !fromEmail) continue;

        serverData = {
          name: name || "Imported",
          host,
          port,
          username: username || null,
          password: password || null,
          fromEmail,
          isSecure,
          domainAuth: domainAuth || null,
          isActive,
        };
      } else {
        if (parts.length < 2) continue;

        const serverName = parts[0].trim();
        const fromEmail = parts[1].trim();
        const domainAuth = parts.length > 2 ? parts[2].trim() : "";

        serverData = {
          name: serverName,
          host: importHost,
          port: importPort,
          username: importUsername || null,
          password: importPassword || null,
          fromEmail: fromEmail,
          isSecure: importIsSecure,
          domainAuth: domainAuth || null,
          isActive: importIsActive,
        };
      }

      try {
        await new Promise<void>((resolve, reject) => {
          createConfig.mutate(serverData, {
            onSuccess: () => {
              successCount++;
              resolve();
            },
            onError: (error) => {
              errorCount++;
              reject(error);
            },
          });
        });
      } catch {
        // Error already counted
      }
    }

    setIsImporting(false);
    setImportDialogOpen(false);
    setImportFileContent([]);
    
    toast({ 
      title: "Import Complete", 
      description: `Successfully imported ${successCount} servers${errorCount > 0 ? `, ${errorCount} failed` : ''}.` 
    });
  }

  function handleWebmailFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setWebmailText(prev => (prev.trim() ? prev.trim() + "\n" : "") + text.trim());
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function countWebmailLines() {
    return webmailText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.includes('@') && /[:,;\t|]/.test(l)).length;
  }

  async function handleImportWebmails() {
    const lineCount = countWebmailLines();
    if (lineCount === 0) {
      toast({ title: "Error", description: "Add at least one email:password line.", variant: "destructive" });
      return;
    }

    setIsImportingWebmails(true);
    setWebmailResults(null);
    try {
      const res = await fetch('/api/smtp/import-webmails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: webmailText, verify: webmailVerify }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Import failed');
      }
      setWebmailResults(data);
      queryClient.invalidateQueries({ queryKey: ['/api/smtp/configs'] });
      toast({
        title: "Webmail Import Complete",
        description: `Added ${data.summary.created} server(s)${data.summary.inactive > 0 ? ` (${data.summary.inactive} inactive)` : ''}${data.summary.failed > 0 ? `, ${data.summary.failed} failed` : ''}${data.summary.skipped > 0 ? `, ${data.summary.skipped} skipped` : ''}.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsImportingWebmails(false);
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader title="SMTP Configuration" description="Manage your SMTP servers. Emails will be sent in round-robin across active servers." />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-4xl space-y-6"
      >
        <CardHover>
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border/50">
            <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-foreground">Server IP Address</h3>
              <p className="text-sm text-muted-foreground">Check the IP address for SMTP whitelisting.</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={checkIP} disabled={isLoadingIP} variant="outline" className="w-fit" data-testid="button-check-ip">
                {isLoadingIP ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</> : <><Globe className="mr-2 h-4 w-4" /> Check IP Address</>}
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    className="w-fit" 
                    disabled={isRestarting}
                    data-testid="button-restart-server"
                  >
                    {isRestarting ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restarting...</>
                    ) : (
                      <><RotateCcw className="mr-2 h-4 w-4" /> Restart Server</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restart Server?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restart the server and may change the IP address. The app will be temporarily unavailable for a few seconds. A new IP is not guaranteed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={restartServer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Yes, Restart Server
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {ipData && (
              <div className="bg-muted/30 rounded-xl p-4 space-y-3 font-mono text-sm">
                {ipData.outboundIPs && ipData.outboundIPs.length > 0 && (
                  <div className="pb-3 mb-2 border-b border-border/50">
                    <div className="text-muted-foreground mb-2">Outbound IPs (add ALL to SMTP whitelist):</div>
                    <div className="flex flex-wrap gap-2">
                      {ipData.outboundIPs.map((ip, idx) => (
                        <span key={idx} className="bg-primary/10 text-primary font-bold text-base px-3 py-1 rounded-md">{ip}</span>
                      ))}
                    </div>
                  </div>
                )}
                {ipData.localIPs.length > 0 && (
                  <div><span className="text-muted-foreground">Local IPs: </span><span className="text-foreground font-semibold">{ipData.localIPs.join(', ')}</span></div>
                )}
                {ipData.forwardedFor && (
                  <div><span className="text-muted-foreground">Forwarded For: </span><span className="text-foreground font-semibold">{ipData.forwardedFor}</span></div>
                )}
                {ipData.note && (
                  <div className="mt-3 pt-3 border-t border-border/50 text-xs text-amber-600 dark:text-amber-400">
                    {ipData.note}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHover>

        <CardHover>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Server className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">SMTP Servers</h3>
                <p className="text-sm text-muted-foreground">
                  {configs?.length || 0} server{(configs?.length || 0) !== 1 ? 's' : ''} configured
                  {selectedServers.size > 0 && ` (${selectedServers.size} selected)`}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {configs && configs.some(c => (c.sentCount ?? 0) > 0) && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleResetSentCounts}
                  data-testid="button-reset-sent-counts"
                >
                  <RotateCcw className="mr-2 h-4 w-4" /> Reset Counts
                </Button>
              )}
              
              {configs && configs.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSelectNotSend}
                  data-testid="button-select-not-send"
                >
                  <CheckCircle className="mr-2 h-4 w-4" /> Select Not Send
                </Button>
              )}

              {configs && configs.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  {selectedServers.size === configs.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}

              {selectedServers.size > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportSelected}
                  data-testid="button-export-selected"
                >
                  <Download className="mr-2 h-4 w-4" /> Export {selectedServers.size}
                </Button>
              )}
              
              {selectedServers.size > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={isBulkDeleting} data-testid="button-bulk-delete">
                      {isBulkDeleting ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</>
                      ) : (
                        <><Trash2 className="mr-2 h-4 w-4" /> Delete {selectedServers.size}</>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedServers.size} Server(s)</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete {selectedServers.size} selected server(s)? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete}>Delete All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-smtp">
                    <Plus className="mr-2 h-4 w-4" /> Add Server
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add SMTP Server</DialogTitle>
                  </DialogHeader>
                  <SMTPForm onSubmit={handleCreate} isPending={createConfig.isPending} onCancel={() => setAddDialogOpen(false)} />
                </DialogContent>
              </Dialog>

              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-smtp">
                    <Upload className="mr-2 h-4 w-4" /> Import
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import SMTP Servers</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {isFullFormatLines(importFileContent) ? (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground" data-testid="text-full-format-detected">
                        <span className="font-semibold">Full-format file detected.</span> Host, port, credentials and all settings will be imported directly from the file — no need to fill in anything below.
                      </div>
                    ) : (
                    <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Host</label>
                        <Input 
                          placeholder="smtp.example.com" 
                          value={importHost} 
                          onChange={(e) => setImportHost(e.target.value)}
                          className="h-10 rounded-lg"
                          data-testid="input-import-host"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Port</label>
                        <Input 
                          type="number" 
                          placeholder="25" 
                          value={importPort} 
                          onChange={(e) => setImportPort(parseInt(e.target.value) || 25)}
                          className="h-10 rounded-lg"
                          data-testid="input-import-port"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Username (Optional)</label>
                        <Input 
                          placeholder="username" 
                          value={importUsername} 
                          onChange={(e) => setImportUsername(e.target.value)}
                          className="h-10 rounded-lg"
                          data-testid="input-import-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold">Password (Optional)</label>
                        <Input 
                          type="password" 
                          placeholder="password" 
                          value={importPassword} 
                          onChange={(e) => setImportPassword(e.target.value)}
                          className="h-10 rounded-lg"
                          data-testid="input-import-password"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="import-ssl" 
                          checked={importIsSecure} 
                          onCheckedChange={(checked) => setImportIsSecure(checked === true)}
                          data-testid="checkbox-import-ssl"
                        />
                        <label htmlFor="import-ssl" className="text-sm font-normal">Use SSL/TLS</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="import-active" 
                          checked={importIsActive} 
                          onCheckedChange={(checked) => setImportIsActive(checked === true)}
                          data-testid="checkbox-import-active"
                        />
                        <label htmlFor="import-active" className="text-sm font-normal">Active</label>
                      </div>
                    </div>
                    </>
                    )}

                    <div className="space-y-2 pt-4 border-t border-border/50">
                      <label className="text-sm font-semibold">Import File</label>
                      <p className="text-xs text-muted-foreground">
                        Just select a text file. Files exported from this app include all details (name, host, port, credentials, etc.) and import automatically. Older files (Server Name, From Email, Domain Auth) use the Host/Port above.
                      </p>
                      <Input 
                        type="file" 
                        accept=".txt,.csv"
                        onChange={handleFileUpload}
                        className="h-10 rounded-lg"
                        data-testid="input-import-file"
                      />
                      {importFileContent.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {isFullFormatLines(importFileContent) ? Math.max(0, importFileContent.length - 1) : importFileContent.length} server(s) ready to import
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleImportServers} 
                        disabled={isImporting || importFileContent.length === 0 || (!isFullFormatLines(importFileContent) && !importHost)}
                        data-testid="button-start-import"
                      >
                        {isImporting ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing...</>
                        ) : (
                          <><Upload className="mr-2 h-4 w-4" /> Import {isFullFormatLines(importFileContent) ? Math.max(0, importFileContent.length - 1) : importFileContent.length} Server(s)</>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={webmailDialogOpen} onOpenChange={(open) => { setWebmailDialogOpen(open); if (!open) setWebmailResults(null); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-webmails">
                    <MailPlus className="mr-2 h-4 w-4" /> Import Webmails
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Import Webmails</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Paste accounts as <code className="px-1 rounded bg-muted">email:password</code> (one per line), or upload a .txt file.
                      The SMTP server for each email's domain is detected automatically and added to your servers list.
                    </p>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Accounts (email:password)</label>
                      <Textarea
                        placeholder={"info@nyhc.com:password\ndaphne@prodayspa.com:password\ndina@earthlink.net:password"}
                        value={webmailText}
                        onChange={(e) => setWebmailText(e.target.value)}
                        className="min-h-[160px] font-mono text-sm rounded-lg"
                        data-testid="textarea-webmails"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold">Or upload a .txt file</label>
                      <Input
                        type="file"
                        accept=".txt,.csv"
                        onChange={handleWebmailFileUpload}
                        className="h-10 rounded-lg"
                        data-testid="input-webmail-file"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="webmail-verify"
                        checked={webmailVerify}
                        onCheckedChange={(checked) => setWebmailVerify(checked === true)}
                        data-testid="checkbox-webmail-verify"
                      />
                      <label htmlFor="webmail-verify" className="text-sm font-normal">
                        Verify login before adding (recommended — only working accounts become Active)
                      </label>
                    </div>

                    {webmailResults && (
                      <div className="space-y-2 pt-2 border-t border-border/50" data-testid="webmail-results">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">Added: {webmailResults.summary.created}</Badge>
                          {webmailResults.summary.inactive > 0 && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">Inactive: {webmailResults.summary.inactive}</Badge>
                          )}
                          {webmailResults.summary.failed > 0 && (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30">Failed: {webmailResults.summary.failed}</Badge>
                          )}
                          {webmailResults.summary.skipped > 0 && (
                            <Badge variant="secondary">Skipped: {webmailResults.summary.skipped}</Badge>
                          )}
                        </div>
                        <ScrollArea className="h-48 rounded-lg border border-border/50 p-2">
                          <div className="space-y-1">
                            {webmailResults.results.map((r, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs" data-testid={`webmail-result-${i}`}>
                                {r.success ? (
                                  <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-green-500" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-500" />
                                )}
                                <div className="min-w-0">
                                  <span className="font-medium text-foreground">{r.email}</span>
                                  <span className="text-muted-foreground">
                                    {r.host ? ` — ${r.host}:${r.port}` : ''} — {r.message}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={() => setWebmailDialogOpen(false)}>
                        Close
                      </Button>
                      <Button
                        onClick={handleImportWebmails}
                        disabled={isImportingWebmails || countWebmailLines() === 0}
                        data-testid="button-start-webmail-import"
                      >
                        {isImportingWebmails ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Detecting & Importing...</>
                        ) : (
                          <><MailPlus className="mr-2 h-4 w-4" /> Import {countWebmailLines()} Webmail(s)</>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {configs && configs.length > 0 ? (
            <div className="space-y-3">
              {configs.map((config, index) => (
                <div 
                  key={config.id} 
                  className={`flex items-center justify-between gap-4 p-4 rounded-xl border cursor-pointer select-none ${selectedServers.has(config.id) ? 'bg-primary/10 border-primary/50' : config.isActive ? 'bg-muted/20 border-border' : 'bg-muted/10 border-border/50 opacity-60'}`}
                  data-testid={`smtp-config-${config.id}`}
                  onClick={(e) => handleServerSelect(config.id, index, e)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox 
                      checked={selectedServers.has(config.id)} 
                      onCheckedChange={() => {
                        const newSelected = new Set(selectedServers);
                        if (newSelected.has(config.id)) {
                          newSelected.delete(config.id);
                        } else {
                          newSelected.add(config.id);
                        }
                        setSelectedServers(newSelected);
                        setLastClickedIndex(index);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`checkbox-select-smtp-${config.id}`}
                    />
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${config.isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{config.name}</span>
                        {config.isActive ? (
                          <Badge variant="default" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        {(config.sentCount ?? 0) > 0 && (
                          <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                            Sent: {config.sentCount}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {config.host}:{config.port}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => handleTestSMTP(config.id)}
                      disabled={testingConfigId === config.id}
                      data-testid={`button-check-smtp-${config.id}`}
                    >
                      {testingConfigId === config.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4" />
                      )}
                    </Button>
                    <Dialog open={editingConfig?.id === config.id} onOpenChange={(open) => !open && setEditingConfig(null)}>
                      <DialogTrigger asChild>
                        <Button size="icon" variant="ghost" onClick={() => setEditingConfig(config)} data-testid={`button-edit-smtp-${config.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit SMTP Server</DialogTitle>
                        </DialogHeader>
                        <SMTPForm config={editingConfig} onSubmit={handleUpdate} isPending={updateConfig.isPending} onCancel={() => setEditingConfig(null)} />
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive" data-testid={`button-delete-smtp-${config.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete SMTP Server</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{config.name}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(config.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No SMTP servers configured yet.</p>
              <p className="text-sm">Click "Add Server" to get started.</p>
            </div>
          )}

          <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {testResult?.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : testResult ? (
                    <XCircle className="h-5 w-5 text-destructive" />
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                  SMTP Connection Test
                </DialogTitle>
              </DialogHeader>
              
              <div className="space-y-4">
                {testResult ? (
                  <>
                    <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-destructive/10 text-destructive'}`}>
                      {testResult.message}
                    </div>
                    
                    <div>
                      <h4 className="font-semibold mb-2">Connection Log:</h4>
                      <ScrollArea className="h-[300px] rounded-lg border bg-muted/30 p-3">
                        <pre className="font-mono text-xs whitespace-pre-wrap">
                          {testResult.logs.join('\n')}
                        </pre>
                      </ScrollArea>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                      <p className="text-muted-foreground">Testing connection...</p>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHover>

        <CardHover>
          <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <TagIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">Email Tags</h3>
                <p className="text-sm text-muted-foreground">Create tags like {"{{TAG}}"} to use in emails. Each value is used once and removed.</p>
              </div>
            </div>
            <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default" data-testid="button-add-tag">
                  <Plus className="mr-2 h-4 w-4" /> Add Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Tag</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Tag Name</label>
                    <p className="text-xs text-muted-foreground mb-2">Enter tag name without brackets. Example: NAME will create {"{{NAME}}"}</p>
                    <Input 
                      placeholder="TAG_NAME" 
                      value={newTagName} 
                      onChange={(e) => setNewTagName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                      data-testid="input-tag-name"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setTagDialogOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={() => newTagName && createTagMutation.mutate(`{{${newTagName}}}`)} 
                      disabled={!newTagName || createTagMutation.isPending}
                      data-testid="button-create-tag"
                    >
                      {createTagMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create Tag
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoadingTags ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : tagsData && tagsData.length > 0 ? (
            <div className="space-y-3">
              {tagsData.map((tag) => (
                <div key={tag.id} className="bg-muted/30 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <code className="bg-background px-2 py-1 rounded text-sm font-mono font-bold text-primary">{tag.name}</code>
                      <div className="flex gap-2 flex-wrap items-center">
                        <Badge variant="outline">{tag.remaining} / {tag.total} remaining</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            window.open(`/api/tags/${tag.id}/download`, '_blank');
                          }}
                          disabled={tag.remaining === 0}
                          title="Download remaining values"
                          data-testid={`button-download-tag-${tag.id}`}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => resetTagMutation.mutate(tag.id)} 
                        disabled={resetTagMutation.isPending}
                        title="Reset all values"
                        data-testid={`button-reset-tag-${tag.id}`}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="text-destructive" data-testid={`button-delete-tag-${tag.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{tag.name}"? All values will be lost.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteTagMutation.mutate(tag.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Textarea 
                      placeholder="Paste values here (one per line)..." 
                      className="min-h-[80px] font-mono text-sm"
                      value={selectedTag?.id === tag.id ? tagValuesText : ""}
                      onFocus={() => setSelectedTag(tag)}
                      onChange={(e) => {
                        setSelectedTag(tag);
                        setTagValuesText(e.target.value);
                      }}
                      data-testid={`textarea-tag-values-${tag.id}`}
                    />
                    {selectedTag?.id === tag.id && tagValuesText.trim() && (
                      <Button 
                        size="sm"
                        onClick={() => addValuesMutation.mutate({ id: tag.id, text: tagValuesText })}
                        disabled={addValuesMutation.isPending}
                        data-testid={`button-add-values-${tag.id}`}
                      >
                        {addValuesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Add Values
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <TagIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No tags created yet.</p>
              <p className="text-sm">Click "Add Tag" to create your first tag.</p>
            </div>
          )}
        </CardHover>

        <CardHover>
          <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-border/50 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-600">
                <ImageIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-foreground">Image Tags</h3>
                <p className="text-sm text-muted-foreground">Upload images and create tags like {"{{IMG1}}"}. Each send generates unique image variants.</p>
              </div>
            </div>
            <Dialog open={imageTagDialogOpen} onOpenChange={setImageTagDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="default" data-testid="button-add-image-tag">
                  <Plus className="mr-2 h-4 w-4" /> Add Image Tag
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Image Tag</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Tag Name</label>
                    <p className="text-xs text-muted-foreground mb-2">Enter tag name without brackets. Example: IMG1 will create {"{{IMG1}}"}</p>
                    <Input 
                      placeholder="IMG1" 
                      value={newImageTagName} 
                      onChange={(e) => setNewImageTagName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                      data-testid="input-image-tag-name"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Image File</label>
                    <p className="text-xs text-muted-foreground mb-2">Upload an image (JPG, PNG, GIF, WebP)</p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setSelectedImageFile(e.target.files?.[0] || null)}
                      className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                      ref={imageFileInputRef}
                    />
                    {selectedImageFile && (
                      <p className="text-xs text-muted-foreground mt-2">Selected: {selectedImageFile.name}</p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setImageTagDialogOpen(false);
                      setNewImageTagName("");
                      setSelectedImageFile(null);
                    }}>Cancel</Button>
                    <Button 
                      onClick={() => {
                        if (newImageTagName && selectedImageFile) {
                          createImageTagMutation.mutate({ name: newImageTagName, file: selectedImageFile });
                        }
                      }} 
                      disabled={!newImageTagName || !selectedImageFile || createImageTagMutation.isPending}
                      data-testid="button-create-image-tag"
                    >
                      {createImageTagMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create Image Tag
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoadingImageTags ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : imageTagsData && imageTagsData.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {imageTagsData.map((imageTag) => (
                <div key={imageTag.id} className="bg-muted/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <code className="bg-background px-2 py-1 rounded text-sm font-mono font-bold text-green-600">{imageTag.name}</code>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="text-destructive" data-testid={`button-delete-image-tag-${imageTag.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Image Tag</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{imageTag.name}"? The image file will also be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteImageTagMutation.mutate(imageTag.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="aspect-video bg-background rounded-lg overflow-hidden flex items-center justify-center">
                    <img 
                      src={`/api/image-tags/${imageTag.id}/preview`}
                      alt={imageTag.name}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{imageTag.originalFilename}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No image tags created yet.</p>
              <p className="text-sm">Click "Add Image Tag" to upload your first image.</p>
            </div>
          )}
        </CardHover>
      </motion.div>
    </Layout>
  );
}
