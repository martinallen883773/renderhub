import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { InsertEmail, BulkEmailRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useEmails() {
  return useQuery({
    queryKey: [api.emails.list.path],
    queryFn: async () => {
      const res = await fetch(api.emails.list.path);
      if (!res.ok) throw new Error("Failed to fetch emails");
      return api.emails.list.responses[200].parse(await res.json());
    },
  });
}

export function useSendEmail() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertEmail) => {
      const res = await fetch(api.emails.send.path, {
        method: api.emails.send.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.message || "Failed to send email");
      }
      
      return api.emails.send.responses[200].parse(json);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.emails.list.path] });
      toast({
        title: "Email Sent",
        description: data.message,
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Send",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSendBulkEmails() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: BulkEmailRequest) => {
      const res = await fetch(api.emails.sendBulk.path, {
        method: api.emails.sendBulk.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      // Large bulk sends can outlive the proxy/gateway timeout, which returns an
      // HTML error page (not JSON) or severs the connection. Parse defensively so
      // we never surface a cryptic "Unexpected token '<'" error. Final progress and
      // the completion toast are delivered reliably over the WebSocket instead.
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        if (json?.message) {
          // Genuine application/validation error (e.g. no active SMTP configs).
          throw new Error(json.message);
        }
        // Proxy timeout / severed connection / HTML body — sending continues on the
        // server and the WebSocket "complete" event will report the result.
        const transportError = new Error("transport");
        (transportError as any).isTransport = true;
        throw transportError;
      }

      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.emails.list.path] });
      // Completion toast is driven by the WebSocket "complete" event so it always
      // appears, even when the HTTP response is lost to a proxy timeout.
    },
    onError: (error) => {
      if ((error as any)?.isTransport) {
        // Suppress: the WebSocket reports the real completion status.
        return;
      }
      toast({
        title: "Failed to Send",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
