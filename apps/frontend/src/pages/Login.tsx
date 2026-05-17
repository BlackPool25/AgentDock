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
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-8 w-80 space-y-4">
        <h1 className="text-xl font-bold text-center">AgentDock</h1>
        <p className="text-sm text-muted-foreground text-center">Sign in to your workspace</p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full bg-muted rounded px-3 py-2 text-sm outline-none"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-muted rounded px-3 py-2 text-sm outline-none"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-primary-foreground rounded py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
