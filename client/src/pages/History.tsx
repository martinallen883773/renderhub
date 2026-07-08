import { useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useEmails } from "@/hooks/use-emails";
import { CardHover } from "@/components/ui/card-hover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Loader2, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

const EMAILS_PER_PAGE = 20;

export default function History() {
  const { data: emails, isLoading } = useEmails();
  const [currentPage, setCurrentPage] = useState(1);

  const totalEmails = emails?.length || 0;
  const totalPages = Math.ceil(totalEmails / EMAILS_PER_PAGE);
  const startIndex = (currentPage - 1) * EMAILS_PER_PAGE;
  const endIndex = startIndex + EMAILS_PER_PAGE;
  const paginatedEmails = emails?.slice(startIndex, endIndex) || [];

  return (
    <Layout>
      <PageHeader title="Email History" description="View status and details of all sent messages." />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <CardHover className="p-0 overflow-hidden border-0 shadow-lg">
          <div className="bg-white dark:bg-card border border-border/50 rounded-2xl overflow-hidden">
            {isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                <p>Loading history...</p>
              </div>
            ) : !emails || emails.length === 0 ? (
              <div className="p-16 flex flex-col items-center justify-center text-muted-foreground">
                <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Inbox className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No emails sent yet</h3>
                <p className="max-w-xs text-center mt-2">Start by composing a new message in the Compose tab.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent border-b border-border/60">
                      <TableHead className="w-[180px] font-semibold text-foreground/70 pl-6 py-4">Status</TableHead>
                      <TableHead className="font-semibold text-foreground/70 py-4">To</TableHead>
                      <TableHead className="font-semibold text-foreground/70 py-4">Subject</TableHead>
                      <TableHead className="text-right font-semibold text-foreground/70 pr-6 py-4">Sent At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEmails.map((email) => (
                      <TableRow key={email.id} className="hover:bg-muted/20 transition-colors border-b border-border/40 last:border-0">
                        <TableCell className="pl-6 py-4">
                          <div className="flex items-center gap-2">
                            {email.status === 'sent' ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 px-2.5 py-1 rounded-lg gap-1.5 shadow-none">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Sent
                              </Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 px-2.5 py-1 rounded-lg gap-1.5 shadow-none cursor-help">
                                    <XCircle className="h-3.5 w-3.5" />
                                    Failed
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs p-3">
                                  <p className="font-semibold text-xs mb-1">Error Details:</p>
                                  <p className="text-xs">{email.error || "Unknown error occurred"}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-foreground/90 py-4">{email.to}</TableCell>
                        <TableCell className="text-muted-foreground py-4">{email.subject}</TableCell>
                        <TableCell className="text-right text-muted-foreground pr-6 py-4 tabular-nums">
                          {email.sentAt ? format(new Date(email.sentAt), "MMM d, yyyy • h:mm a") : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-border/40 bg-muted/20">
                    <div className="text-sm text-muted-foreground">
                      Showing {startIndex + 1}-{Math.min(endIndex, totalEmails)} of {totalEmails} emails
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className="w-9"
                              data-testid={`button-page-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </CardHover>
      </motion.div>
    </Layout>
  );
}
