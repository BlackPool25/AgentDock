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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm p-8 rounded-xl border border-border bg-card shadow-lg space-y-6">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">AgentDock Builder</h1>
          <p className="text-xs text-muted-foreground">Design and generate multi-agent systems</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Email Address</label>
            <input
              type="email"
              className="input w-full mt-1 text-xs px-3.5 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Password</label>
            <input
              type="password"
              className="input w-full mt-1 text-xs px-3.5 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-primary text-primary-foreground rounded-lg py-2.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity shadow-sm"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
