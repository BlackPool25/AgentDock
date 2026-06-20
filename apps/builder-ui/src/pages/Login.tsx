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
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, hsl(150 30% 95%), hsl(160 40% 90%))' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl space-y-6"
        style={{
          background: 'white',
          border: '1px solid hsl(150 20% 88%)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)'
        }}>
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, hsl(152 60% 35%), hsl(160 80% 30%))' }}>
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'hsl(150 15% 15%)' }}>AgentDock Builder</h1>
          <p className="text-sm" style={{ color: 'hsl(150 10% 45%)' }}>Design and generate multi-agent systems</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wide" style={{ color: 'hsl(150 10% 45%)' }}>Email Address</label>
            <input
              type="email"
              className="input w-full mt-1 text-xs px-3.5 py-2.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold tracking-wide" style={{ color: 'hsl(150 10% 45%)' }}>Password</label>
            <input
              type="password"
              className="input w-full mt-1 text-xs px-3.5 py-2.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl py-2.5 text-xs font-bold tracking-wide transition-all"
            style={{
              background: 'linear-gradient(135deg, hsl(152 60% 35%), hsl(160 80% 30%))',
              color: 'white',
              boxShadow: '0 4px 12px hsla(152, 60%, 35%, 0.25)'
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
