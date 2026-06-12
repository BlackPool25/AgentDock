import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";
import { Login } from "./pages/Login.js";
import { SystemLibrary } from "./pages/SystemLibrary.js";
import { WorkflowEditor } from "./pages/WorkflowEditor.js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("agentdock_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <SystemLibrary />
            </RequireAuth>
          }
        />
        <Route
          path="/systems/:id/edit"
          element={
            <RequireAuth>
              <WorkflowEditor />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    <Toaster richColors position="bottom-right" />
  </QueryClientProvider>
);
