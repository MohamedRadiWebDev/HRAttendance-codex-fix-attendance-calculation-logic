import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import Attendance from "@/pages/Attendance";
import Import from "@/pages/Import";
import Rules from "@/pages/Rules";
import Templates from "@/pages/Templates";
import Adjustments from "@/pages/Adjustments";
import BulkAdjustmentsImport from "@/pages/BulkAdjustmentsImport";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/employees" component={Employees} />
      <Route path="/attendance" component={Attendance} />
      <Route path="/import" component={Import} />
      <Route path="/rules" component={Rules} />
      <Route path="/templates" component={Templates} />
      <Route path="/adjustments" component={Adjustments} />
      <Route path="/bulk-adjustments" component={BulkAdjustmentsImport} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
