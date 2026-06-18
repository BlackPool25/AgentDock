import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ky from "ky";
import { toast } from "sonner";

export function Login() {
  const [email, setEmail] = useState("admin@agentdock.local");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await ky.post("/api/auth/login", { json: { email, password } }).json<{ token: string }>();
      localStorage.setItem("agentdock_token", res.token);
      navigate("/");
    } catch {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-8 w-full max-w-sm space-y-5 shadow-lg">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">AgentDock</h1>
          <p className="text-xs text-muted-foreground">Sign in to manage your agent workspace</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. admin@agentdock.local"
              className="w-full bg-background rounded-lg border border-border px-3.5 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all font-medium text-foreground"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-background rounded-lg border border-border px-3.5 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/40 transition-all font-medium text-foreground"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity shadow-sm"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
