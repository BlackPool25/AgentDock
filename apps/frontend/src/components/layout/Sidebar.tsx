import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Workflow, Wifi, WifiOff, LogOut } from "lucide-react";
import { useWsStore } from "../../stores/ws.store.js";

export function Sidebar() {
  const { pathname } = useLocation();
  const connected = useWsStore((s) => s.connected);

  const handleLogout = () => {
    localStorage.removeItem("agentdock_token");
    window.location.reload();
  };

  const links = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/workflows", icon: Workflow, label: "Workflows" },
  ];

  return (
    <aside className="w-14 flex flex-col items-center py-4 gap-4 border-r border-border bg-card">
      <div className="text-primary font-bold text-lg" title="AgentDock">AD</div>
      {links.map(({ to, icon: Icon, label }) => (
        <Link
          key={to}
          to={to}
          title={label}
          className={`p-2 rounded-lg ${pathname === to ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Icon size={20} />
        </Link>
      ))}
      <div className="mt-auto flex flex-col items-center gap-4">
        <button
          onClick={handleLogout}
          title="Sign Out"
          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut size={20} />
        </button>
        <div title={connected ? "Connected" : "Disconnected"}>
          {connected ? <Wifi size={16} className="text-green-500" /> : <WifiOff size={16} className="text-red-500" />}
        </div>
      </div>
    </aside>
  );
}
