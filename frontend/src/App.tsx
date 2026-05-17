import "./styles/global.css";
import "./styles/side-panel.css";

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isApiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SharedWorkflow from "./pages/SharedWorkflow";
import WorkflowsPage from "./pages/WorkflowsPage";
import AssetsPage from "./pages/AssetsPage";
import ElementStudioPage from "./pages/ElementStudioPage";
import { OfflineBanner } from "@/components/OfflineBanner";

// Catch unhandled promise rejections for observability
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    logger.error("[Unhandled Promise Rejection]", {
      reason: event.reason,
      message: event.reason?.message || String(event.reason),
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Don't retry non-retryable errors (401, 403, 404, 400)
        if (isApiError(error) && !error.retryable) return false;
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex, 15000),
    },
    mutations: {
      retry: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <OfflineBanner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/share/:token" element={<SharedWorkflow />} />
              <Route path="/workflows" element={<WorkflowsPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/elements/:type" element={<ElementStudioPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById("root")!).render(<App />);
