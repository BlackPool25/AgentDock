import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "./index.css";
import { Login } from "./pages/Login.js";
import { Dashboard } from "./pages/Dashboard.js";
import { WorkflowEditor } from "./pages/WorkflowEditor.js";
import { AgentDetail } from "./pages/AgentDetail.js";
import { Sidebar } from "./components/layout/Sidebar.js";
import { useWsStore } from "./stores/ws.store.js";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("agentdock_token");
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const connect = useWsStore((s) => s.connect);
  useEffect(() => { connect(); }, [connect]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/workflows/:id" element={<WorkflowEditor />} />
                    <Route path="/agents/:id" element={<AgentDetail />} />
                  </Routes>
                </AppLayout>
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  </StrictMode>
);
