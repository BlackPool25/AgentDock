import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { systemsApi } from "@/api/systems.api.js";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@agentdock.local");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { token } = await systemsApi.login(email, password);
      localStorage.setItem("agentdock_token", token);
      navigate("/");
    } catch {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm p-8 rounded-xl border border-border bg-card shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">AgentDock Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">Design and generate multi-agent systems</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              type="password"
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
