import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Compose from "@/pages/Compose";
import History from "@/pages/History";
import Settings from "@/pages/Settings";
import PasswordProtection from "@/components/PasswordProtection";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Compose} />
      <Route path="/history" component={History} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PasswordProtection>
          <Router />
        </PasswordProtection>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
