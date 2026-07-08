import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertSmtpConfig, SmtpConfig } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useSMTPConfigs() {
  return useQuery<SmtpConfig[]>({
    queryKey: [api.smtp.list.path],
    queryFn: async () => {
      const res = await fetch(api.smtp.list.path);
      if (!res.ok) throw new Error("Failed to fetch SMTP configs");
      return res.json();
    },
    refetchInterval: 3000,
  });
}

export function useCreateSMTPConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertSmtpConfig) => {
      const res = await fetch(api.smtp.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create configuration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.smtp.list.path] });
      toast({
        title: "SMTP Server Added",
        description: "New SMTP server has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateSMTPConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: InsertSmtpConfig }) => {
      const res = await fetch(`/api/smtp/configs/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update configuration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.smtp.list.path] });
      toast({
        title: "SMTP Server Updated",
        description: "SMTP server has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteSMTPConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/smtp/configs/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete configuration");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.smtp.list.path] });
      toast({
        title: "SMTP Server Deleted",
        description: "SMTP server has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSMTPConfig() {
  return useQuery({
    queryKey: [api.smtp.getConfig.path],
    queryFn: async () => {
      const res = await fetch(api.smtp.getConfig.path);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch SMTP config");
      return api.smtp.getConfig.responses[200].parse(await res.json());
    },
  });
}

export function useSaveSMTPConfig() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertSmtpConfig) => {
      const res = await fetch(api.smtp.saveConfig.path, {
        method: api.smtp.saveConfig.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save configuration");
      return api.smtp.saveConfig.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.smtp.getConfig.path] });
      queryClient.invalidateQueries({ queryKey: [api.smtp.list.path] });
      toast({
        title: "Configuration Saved",
        description: "Your SMTP settings have been updated successfully.",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
