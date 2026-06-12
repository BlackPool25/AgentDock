import React, { useState, useEffect, useRef } from 'react';

// Types and Configurations
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'agent-output';
  content: string;
  timestamp: Date;
  agentId?: string;
  filename?: string;
  title?: string;
}

interface AgentNode {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  type: string;
  x: number;
  y: number;
  description?: string;
  model?: string;
  currentTask?: string;
}

interface Connection {
  id: string;
  from: string;
  to: string;
  active: boolean;
  filePattern?: string;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'llm';
  agent: string;
  message: string;
}

const BACKEND_URL = 'http://localhost:4000';
const WS_URL = 'ws://localhost:4000';

const AGENT_CONFIGS: Record<string, { name: string; type: string; color: string; desc: string; icon: string }> = {
  'ideation-agent': {
    name: 'Hackathon Strategist',
    type: 'ideation',
    color: 'from-emerald-500 to-teal-600',
    desc: 'Brainstorms event themes, target audiences, and core structures.',
    icon: 'M9.663 17h4.673M12 3v1m6.364 .364l-.707.707M21 12h-1M4 12H3m.337-6.05l.707.707M12 21v-1m7.071-1.071l-.707-.707M5.636 5.636l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z'
  },
  'script-agent': {
    name: 'MC Scriptwriter',
    type: 'script',
    color: 'from-amber-500 to-orange-600',
    desc: 'Generates engaging and professional scripts for event Masters of Ceremonies.',
    icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z'
  },
  'pitch-agent': {
    name: 'Sponsorship Specialist',
    type: 'pitch',
    color: 'from-pink-500 to-rose-600',
    desc: 'Drafts compelling pitch decks and outreach templates for potential event sponsors.',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  'deck-agent': {
    name: 'Presentation Architect',
    type: 'deck',
    color: 'from-blue-500 to-indigo-600',
    desc: 'Structures and writes slide-by-slide content for presentation decks.',
    icon: 'M8 7v12m0 0l-4-4m4 4l4-4m0 6V7m0 0l-4 4m4-4l4 4m5.25-2.25A2.25 2.25 0 0018 10.5v3a2.25 2.25 0 002.25 2.25h3A2.25 2.25 0 0025.5 13.5v-3a2.25 2.25 0 00-2.25-2.25h-3z'
  }
};

// Simplified HTML Markdown Renderer to prevent layout breaks and render agent markdown outputs beautifully
const MarkdownPreview: React.FC<{ content: string }> = ({ content }) => {
  const parseMarkdown = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      let trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith('### ')) {
        return <h4 key={idx} className="text-md font-bold text-jade-200 mt-3 mb-1.5 border-b border-jade-900/30 pb-0.5">{trimmed.slice(4)}</h4>;
      }
      if (trimmed.startsWith('## ')) {
        return <h3 key={idx} className="text-lg font-bold text-jade-100 mt-4 mb-2 border-b border-jade-900/40 pb-1">{trimmed.slice(3)}</h3>;
      }
      if (trimmed.startsWith('# ')) {
        return <h2 key={idx} className="text-xl font-extrabold text-white mt-5 mb-3 text-glow-green">{trimmed.slice(2)}</h2>;
      }
      
      // Unordered lists
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return <li key={idx} className="ml-4 list-disc text-sm text-gray-300 my-0.5">{trimmed.slice(2)}</li>;
      }

      // Ordered lists
      if (/^\d+\.\s/.test(trimmed)) {
        const match = trimmed.match(/^(\d+)\.\s(.*)/);
        return <li key={idx} className="ml-4 list-decimal text-sm text-gray-300 my-0.5">{match ? match[2] : trimmed}</li>;
      }

      // Blockquotes
      if (trimmed.startsWith('> ')) {
        return <blockquote key={idx} className="border-l-4 border-jade-500 bg-jade-950/20 px-3 py-1.5 rounded my-2 text-sm text-gray-300 italic">{trimmed.slice(2)}</blockquote>;
      }

      // Empty line
      if (!trimmed) {
        return <div key={idx} className="h-2" />;
      }

      // Paragraph
      return <p key={idx} className="text-sm text-gray-300 leading-relaxed my-1">{trimmed}</p>;
    });
  };

  return <div className="space-y-1 font-sans text-left max-h-[300px] overflow-y-auto pr-1">{parseMarkdown(content)}</div>;
};

// Login Component (Single Password configured via .env)
const LoginOverlay: React.FC<{ onLoginSuccess: (token: string) => void }> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        localStorage.setItem('agent_token', data.token);
        onLoginSuccess(data.token);
      } else {
        setError(data.error || 'Authentication failed. Please check password.');
      }
    } catch (err) {
      setError('Cannot connect to backend server at localhost:4000');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-forest-950/95 backdrop-blur-md z-50 flex items-center justify-center">
      <div className="w-full max-w-md p-8 glass-card rounded-3xl glow-green-md border border-jade-500/20 relative overflow-hidden">
        {/* Animated background highlights */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-jade-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl"></div>

        <div className="text-center mb-8 relative z-10">
          <div className="w-20 h-20 bg-gradient-to-br from-jade-500 to-emerald-600 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-jade-500/30">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Runtime Console</h2>
          <p className="text-jade-200/60 mt-2 font-medium">JWT-Protected Orchestration Control Room</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div>
            <label className="block text-sm font-semibold text-jade-100 mb-2">Platform Control Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 bg-forest-950/80 rounded-xl border border-jade-500/20 focus:border-jade-500 focus:ring-2 focus:ring-jade-500/20 outline-none text-white transition-all text-center tracking-widest placeholder:tracking-normal text-sm"
              placeholder="••••••••••••••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-gradient-to-r from-jade-500 to-emerald-600 text-white font-bold rounded-xl hover:from-jade-600 hover:to-emerald-700 transition-all shadow-lg shadow-jade-500/20 disabled:opacity-75 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Verifying credentials...</span>
              </>
            ) : (
              <span>Unlock Platform Control</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

// Main Application Page
const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('agent_token'));
  const [systemState, setSystemState] = useState<'running' | 'partial' | 'stopped' | 'loading'>('loading');
  const [systemId, setSystemId] = useState<string>('Ai02VXmSDh74');

  // Agent states
  const [agents, setAgents] = useState<AgentNode[]>([
    { id: 'ideation-agent', name: 'Hackathon Strategist', status: 'stopped', type: 'ideation', x: 500, y: 50, description: AGENT_CONFIGS['ideation-agent'].desc, model: 'ollama/qwen3:0.6b' },
    { id: 'script-agent', name: 'MC Scriptwriter', status: 'stopped', type: 'script', x: 420, y: 350, description: AGENT_CONFIGS['script-agent'].desc, model: 'ollama/qwen3:0.6b' },
    { id: 'pitch-agent', name: 'Sponsorship Specialist', status: 'stopped', type: 'pitch', x: 190, y: 270, description: AGENT_CONFIGS['pitch-agent'].desc, model: 'ollama/qwen3:0.6b' },
    { id: 'deck-agent', name: 'Presentation Architect', status: 'stopped', type: 'deck', x: 160, y: 50, description: AGENT_CONFIGS['deck-agent'].desc, model: 'ollama/qwen3:0.6b' },
  ]);

  // SVG Connections based on workflow.yaml
  const [connections, setConnections] = useState<Connection[]>([
    { id: 'conn-script', from: 'ideation-agent', to: 'script-agent', active: false, filePattern: 'event_strategy.md' },
    { id: 'conn-pitch', from: 'ideation-agent', to: 'pitch-agent', active: false, filePattern: 'event_strategy.md' },
    { id: 'conn-deck', from: 'ideation-agent', to: 'deck-agent', active: false, filePattern: 'event_strategy.md' },
  ]);

  // Sidebar Agent Inspector
  const [selectedAgent, setSelectedAgent] = useState<AgentNode | null>(null);
  const [agentTasks, setAgentTasks] = useState<any[]>([]);
  const [agentMemoryFiles, setAgentMemoryFiles] = useState<any[]>([]);
  const [agentRagStatus, setAgentRagStatus] = useState<any>(null);
  const [agentConfigYaml, setAgentConfigYaml] = useState<string>('');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'info' | 'tasks' | 'memory' | 'config'>('info');
  const [viewingMemoryFile, setViewingMemoryFile] = useState<{ filename: string; content: string } | null>(null);
  const [isInspectorLoading, setIsInspectorLoading] = useState(false);

  // Chatbox States
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Welcome to your multi-agent orchestrator dashboard. I have configured your event pipeline. Provide an event theme and instruction, and I'll delegate it to our specialist agents.",
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Logs terminal states
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsFilterLevel, setLogsFilterLevel] = useState<string>('all');
  const [logsFilterAgent, setLogsFilterAgent] = useState<string>('all');
  const [autoScrollLogs, setAutoScrollLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Socket reference
  const wsRef = useRef<WebSocket | null>(null);

  // Auto-scroll chats and logs
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (autoScrollLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScrollLogs]);

  // Fetch initial System Status and Agent logs
  const fetchSystemStatus = async (userToken: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/system/status`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (response.status === 401) {
        handleLogout();
        return;
      }
      const data = await response.json();
      if (response.ok) {
        setSystemId(data.systemId);
        setSystemState(data.status);
        
        // Update local agent statuses
        const statuses = data.agents || [];
        setAgents(prev => prev.map(agent => {
          const match = statuses.find((s: any) => s.id === agent.id);
          return {
            ...agent,
            status: match ? match.status : 'stopped'
          };
        }));
      }
    } catch (err) {
      console.error('Failed to load system status', err);
    }
  };

  // Fetch dynamic system topology (positions, agents, connections) once authenticated
  useEffect(() => {
    if (!token) return;
    const loadTopology = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/system/topology`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          let loadedAgents = data.agents || [];
          let loadedConnections = data.connections || [];
          
          if (loadedAgents.length > 0) {
            setAgents(loadedAgents.map((a: any) => ({
              ...a,
              status: 'stopped'
            })));
            fetchInitialLogs(token, loadedAgents);
          } else {
            fetchInitialLogs(token, agents);
          }
          
          if (loadedConnections.length > 0) {
            setConnections(loadedConnections.map((c: any) => ({
              ...c,
              active: false
            })));
          }
        } else {
          fetchInitialLogs(token, agents);
        }
      } catch (err) {
        console.error('Failed to load dynamic workflow topology', err);
        fetchInitialLogs(token, agents);
      }
    };
    loadTopology();
  }, [token]);

  // Poll agent statuses
  useEffect(() => {
    if (!token) return;
    fetchSystemStatus(token);
    const interval = setInterval(() => fetchSystemStatus(token), 8000);
    return () => clearInterval(interval);
  }, [token]);

  // Fetch historical logs from all agents and populate initially
  const fetchInitialLogs = async (userToken: string, currentAgents: AgentNode[]) => {
    try {
      const mergedLogs: LogEntry[] = [];
      const agentIds = currentAgents.map(a => a.id);
      
      await Promise.all(agentIds.map(async (id) => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/agents/${id}/logs?limit=30`, {
            headers: { 'Authorization': `Bearer ${userToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            const rawLogs = data.logs || [];
            const agentObj = currentAgents.find(a => a.id === id);
            const agentName = agentObj?.name || AGENT_CONFIGS[id]?.name || id;
            rawLogs.forEach((l: any, idx: number) => {
              mergedLogs.push({
                id: `${id}-${idx}-${l.timestamp}`,
                timestamp: new Date(l.timestamp || Date.now()),
                level: l.level as any || 'info',
                agent: agentName,
                message: l.message || ''
              });
            });
          }
        } catch {}
      }));

      // Sort chronologically
      mergedLogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setLogs(mergedLogs);
    } catch (err) {
      console.error('Failed fetching agent logs', err);
    }
  };

  // Initialize WebSocket and Logs
  useEffect(() => {
    if (!token) return;

    // Setup WebSockets
    const setupWebSocket = () => {
      const socket = new WebSocket(`${WS_URL}/ws?token=${token}`);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('WS Connection established');
        setLogs(prev => [
          ...prev,
          {
            id: `system-conn-${Date.now()}`,
            timestamp: new Date(),
            level: 'info',
            agent: 'Orchestrator',
            message: 'Real-time WebSocket event connection active.'
          }
        ]);
      };

      socket.onmessage = async (event) => {
        try {
          const wsData = JSON.parse(event.data);
          
          // Capture agent events
          if (wsData.type) {
            const currentAgent = agents.find(a => a.id === wsData.agentId);
            const agentName = currentAgent?.name || AGENT_CONFIGS[wsData.agentId]?.name || wsData.agentId || 'System';
            let message = '';
            let level: 'info' | 'warn' | 'error' | 'llm' = 'info';

            // Determine custom WebSocket actions
            if (wsData.type === 'agent:task:started') {
              message = `Started task: "${wsData.instruction || ''}"`;
              setAgents(prev => prev.map(a => a.id === wsData.agentId ? { ...a, status: 'running', currentTask: wsData.instruction } : a));
              
              // Highlight all connections connected to this active agent
              setConnections(prev => prev.map(c => 
                c.from === wsData.agentId || c.to === wsData.agentId ? { ...c, active: true } : c
              ));
            } else if (wsData.type === 'agent:task:completed') {
              message = `Successfully completed task! Output preview: ${wsData.outputPreview || ''}`;
              level = 'info';
              setAgents(prev => prev.map(a => a.id === wsData.agentId ? { ...a, status: 'completed', currentTask: undefined } : a));
              
              // End path highlights shortly after completion
              setTimeout(() => {
                setConnections(prev => prev.map(c => 
                  c.from === wsData.agentId || c.to === wsData.agentId ? { ...c, active: false } : c
                ));
              }, 4000);
            } else if (wsData.type === 'agent:task:failed') {
              message = `Task execution failed: ${wsData.error || ''}`;
              level = 'error';
              setAgents(prev => prev.map(a => a.id === wsData.agentId ? { ...a, status: 'error', currentTask: undefined } : a));
              
              // Deactivate paths
              setTimeout(() => {
                setConnections(prev => prev.map(c => 
                  c.from === wsData.agentId || c.to === wsData.agentId ? { ...c, active: false } : c
                ));
              }, 4000);
            } else if (wsData.type === 'agent:memory:written') {
              message = `Memory file saved: [${wsData.filename}] ${wsData.contentPreview || ''}`;
              level = 'llm';

              // FETCH THE WRITTEN FILE DIRECTLY & ADD AS RICH CHAT CARD WITH DOWNLOAD BUTTON!
              await fetchMemoryFileAndAppendToChat(wsData.agentId, wsData.filename);
            } else {
              message = JSON.stringify(wsData);
            }

            setLogs(prev => [
              ...prev,
              {
                id: `${wsData.agentId}-${Date.now()}-${Math.random()}`,
                timestamp: new Date(wsData.timestamp || Date.now()),
                level,
                agent: agentName,
                message
              }
            ]);
          } else {
            // General string/json log
            setLogs(prev => [
              ...prev,
              {
                id: `log-${Date.now()}-${Math.random()}`,
                timestamp: new Date(wsData.timestamp || Date.now()),
                level: (wsData.level as any) || 'info',
                agent: wsData.agent || 'System',
                message: wsData.message || JSON.stringify(wsData)
              }
            ]);
          }
        } catch {}
      };

      socket.onclose = () => {
        console.log('WS Connection closed, retrying in 5s...');
        setTimeout(setupWebSocket, 5000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    setupWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token, agents]);

  // Fetch full content of a recently written file and post it in the chat timeline
  const fetchMemoryFileAndAppendToChat = async (agentId: string, filename: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents/${agentId}/memory/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const fileData = await res.json();
        const content = fileData.content || '';
        
        let title = `${AGENT_CONFIGS[agentId]?.name || agentId} generated: ${filename}`;
        
        setMessages(prev => [
          ...prev,
          {
            id: `output-${agentId}-${filename}-${Date.now()}`,
            role: 'agent-output',
            content,
            timestamp: new Date(),
            agentId,
            filename,
            title
          }
        ]);
      }
    } catch (err) {
      console.error('Could not fetch memory file output', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('agent_token');
    setToken(null);
    setSystemState('stopped');
  };

  // Write a default user profile profiles/admin.md before starting the agent tasks
  const seedUserProfile = async (userToken: string, targetAgentId: string) => {
    try {
      const profileContent = `# Admin Profile\n\n- User: agentdock-admin\n- Preferred Theme: General Autonomous AI Systems\n- Platform Level: Advanced Developer Control`;
      
      const res = await fetch(`${BACKEND_URL}/api/agents/${targetAgentId}/memory/profiles/admin.md`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ content: profileContent })
      });
      if (res.ok) {
        console.log(`Default user profile admin.md seeded successfully on agent [${targetAgentId}].`);
      }
    } catch (err) {
      console.error(`Could not seed default profiles/admin.md on agent [${targetAgentId}]`, err);
    }
  };

  // Submit Prompt to public Webhook (trigger pipeline starting with entrypoint agent)
  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !token) return;

    const userQuery = inputMessage;
    setInputMessage('');
    setIsSending(true);

    // Insert user query in chat
    setMessages(prev => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userQuery,
        timestamp: new Date()
      }
    ]);

    try {
      // Find an agent that has no incoming connections (the workflow entrypoint)
      const incomingTo = new Set(connections.map(c => c.to));
      const entryAgent = agents.find(a => !incomingTo.has(a.id)) || agents[0];
      const entryAgentId = entryAgent ? entryAgent.id : 'ideation-agent';
      const entryAgentName = entryAgent ? entryAgent.name : 'Hackathon Strategist';

      // 1. Seed user profile first on the entry agent
      await seedUserProfile(token, entryAgentId);

      // 2. Trigger Entry Agent Webhook API key
      const response = await fetch(`${BACKEND_URL}/webhooks/${entryAgentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: userQuery,
          payload: {
            userId: 'admin'
          }
        })
      });

      const data = await response.json();
      if (response.ok && data.ok) {
        setMessages(prev => [
          ...prev,
          {
            id: `assistant-ack-${Date.now()}`,
            role: 'assistant',
            content: `I've successfully triggered the workflow with your instruction! The "${entryAgentName}" has begun executing. You can trace progress in the central canvas or stream logs in the terminal. Once a strategic report is generated, it will immediately display in this timeline.`,
            timestamp: new Date()
          }
        ]);
        
        // Optimistically set running
        setAgents(prev => prev.map(a => a.id === entryAgentId ? { ...a, status: 'running' } : a));
        setConnections(prev => prev.map(c => c.from === entryAgentId || c.to === entryAgentId ? { ...c, active: true } : c));
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `assistant-err-${Date.now()}`,
            role: 'system',
            content: `Webhook submission failed: ${data.error || 'Agent unreachable. Ensure Docker orchestration backend is running.'}`,
            timestamp: new Date()
          }
        ]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: `assistant-fail-${Date.now()}`,
          role: 'system',
          content: 'Failed to communicate with orchestrator. Connection refused on localhost:4000.',
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Sidebar Inspector Fetchers
  const inspectAgent = async (agent: AgentNode) => {
    setSelectedAgent(agent);
    setActiveInspectorTab('info');
    setViewingMemoryFile(null);
    setIsInspectorLoading(true);

    if (!token) return;

    try {
      // 1. Fetch Agent tasks
      try {
        const resTasks = await fetch(`${BACKEND_URL}/api/agents/${agent.id}/tasks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resTasks.ok) {
          const dataTasks = await resTasks.json();
          setAgentTasks(dataTasks.tasks || []);
        }
      } catch {}

      // 2. Fetch Agent Memory files
      try {
        const resMem = await fetch(`${BACKEND_URL}/api/agents/${agent.id}/memory`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resMem.ok) {
          const dataMem = await resMem.json();
          setAgentMemoryFiles(dataMem.files || []);
        }
      } catch {}

      // 3. Fetch RAG Status if supported by agent
      try {
        const resRag = await fetch(`${BACKEND_URL}/api/agents/${agent.id}/rag/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resRag.ok) {
          const dataRag = await resRag.json();
          setAgentRagStatus(dataRag);
        } else {
          setAgentRagStatus(null);
        }
      } catch {
        setAgentRagStatus(null);
      }

      // 4. Fetch Agent Configuration Yaml
      try {
        const resConfig = await fetch(`${BACKEND_URL}/api/agents/${agent.id}/config`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resConfig.ok) {
          const dataConfig = await resConfig.json();
          setAgentConfigYaml(JSON.stringify(dataConfig, null, 2));
        }
      } catch {}

    } catch (err) {
      console.error('Failed inspecting agent details', err);
    } finally {
      setIsInspectorLoading(false);
    }
  };

  // Read memory file raw text
  const fetchMemoryFileContent = async (agentId: string, filename: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents/${agentId}/memory/${filename}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setViewingMemoryFile({ filename, content: data.content || '' });
      }
    } catch {}
  };

  // Reload Agent Hot Configuration
  const handleReloadAgent = async (agentId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents/${agentId}/reload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert(`Successfully reloaded configuration for agent [${agentId}]!`);
        if (selectedAgent) inspectAgent(selectedAgent);
      } else {
        alert('Failed to reload agent. Verify config schema is valid.');
      }
    } catch {
      alert('Error connecting to backend reload endpoint.');
    }
  };

  // Trigger RAG force reindexing
  const handleForceReindex = async (agentId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/agents/${agentId}/rag/reindex`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Reindexed agent memory database. Indexed ${data.chunks_indexed || 0} chunks successfully.`);
        if (selectedAgent) inspectAgent(selectedAgent);
      }
    } catch {
      alert('Failed trigger database index update.');
    }
  };

  // Download Output files locally
  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reload entire Orchestrator workflow schema
  const handleReloadSystem = async () => {
    if (!token) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/system/status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        fetchSystemStatus(token);
        alert('System topology and orchestration status updated.');
      }
    } catch {
      alert('Platform communication error.');
    }
  };

  // Filters for logs
  const getFilteredLogs = () => {
    return logs.filter(log => {
      const matchesLevel = logsFilterLevel === 'all' || log.level === logsFilterLevel;
      const matchesAgent = logsFilterAgent === 'all' || log.agent.toLowerCase().includes(logsFilterAgent.toLowerCase());
      return matchesLevel && matchesAgent;
    });
  };

  const getLogBadgeStyle = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'warn': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'llm': return 'bg-emerald-500/10 text-jade-300 border border-jade-500/20';
      case 'debug': return 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
      default: return 'bg-jade-500/10 text-jade-400 border border-jade-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-forest-950 text-gray-200 flex flex-col antialiased">
      {!token && <LoginOverlay onLoginSuccess={(userToken) => setToken(userToken)} />}

      {/* Modern Dashboard Header */}
      <header className="px-6 py-4 border-b border-jade-900/30 bg-forest-900/90 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-jade-500 to-emerald-600 rounded-xl flex items-center justify-center glow-green-sm shadow-md">
            <svg className="w-5.5 h-5.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight leading-none">Runtime Console</h1>
              <span className="text-[10px] bg-jade-900/50 text-jade-400 border border-jade-800/40 px-2 py-0.5 rounded-full font-mono uppercase">ID: {systemId}</span>
            </div>
            <p className="text-xs text-jade-200/50 mt-1">Multi-Agent Planning & Orchestration Command</p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-forest-950/80 px-3.5 py-1.5 rounded-xl border border-jade-900/30 text-xs">
            <span className={`w-2 h-2 rounded-full ${systemState === 'running' ? 'bg-jade-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-jade-200/80 font-medium capitalize">Platform: {systemState}</span>
          </div>

          <button 
            onClick={handleReloadSystem}
            title="Reload topology & fetch agent updates"
            className="p-2 text-jade-400 hover:text-white bg-forest-900 border border-jade-900/50 rounded-xl hover:bg-jade-900/20 hover:border-jade-500/30 transition-all cursor-pointer shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18" />
            </svg>
          </button>

          {token && (
            <button 
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-bold text-red-400 hover:text-white border border-red-500/20 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* Main Control Panel Dashboard */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* LEFT COLUMN: Agent Orchestrator Chat */}
        <section className="lg:col-span-3 flex flex-col h-[calc(100vh-140px)] glass-card rounded-3xl border border-jade-900/20 relative overflow-hidden">
          <div className="px-5 py-4 border-b border-jade-900/30 bg-forest-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-jade-500 rounded-full animate-pulse glow-green-sm" />
              <h2 className="text-sm font-bold text-white tracking-tight">Workflow Dispatch</h2>
            </div>
            <span className="text-[10px] text-jade-300 bg-jade-950/60 border border-jade-900/50 px-2 py-0.5 rounded-full font-medium">Auto-Execute</span>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex flex-col ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                
                {/* Agent output files */}
                {message.role === 'agent-output' ? (
                  <div className="w-full bg-jade-950/20 border border-jade-500/20 rounded-2xl p-4 shadow-sm relative group overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-jade-500 to-emerald-600"></div>
                    
                    <div className="flex items-center justify-between mb-3 pl-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-jade-400"></span>
                        <span className="text-xs font-bold text-jade-200 tracking-tight">{message.title}</span>
                      </div>
                      <button
                        onClick={() => downloadFile(message.filename || 'report.md', message.content)}
                        className="text-[10px] font-bold bg-jade-500 text-white hover:bg-jade-600 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-sm shadow-jade-500/10"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Download Markdown</span>
                      </button>
                    </div>

                    <div className="bg-forest-950/60 border border-jade-950/30 rounded-xl p-3.5 text-xs overflow-x-auto text-gray-300">
                      <MarkdownPreview content={message.content} />
                    </div>
                  </div>
                ) : (
                  // General text message bubble
                  <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-jade-600 to-emerald-700 text-white rounded-br-none shadow-md shadow-jade-950/20'
                      : 'bg-forest-900 border border-jade-900/20 text-gray-200 rounded-bl-none shadow-sm'
                  }`}>
                    <p className="whitespace-pre-line">{message.content}</p>
                    <div className="flex items-center justify-end gap-1.5 mt-1.5">
                      <span className={`text-[9px] ${message.role === 'user' ? 'text-jade-200/60' : 'text-jade-400/50'} font-mono`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <div className="p-4 border-t border-jade-900/30 bg-forest-900/20">
            <div className="relative flex items-center">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isSending && handleSendMessage()}
                placeholder="Submit task to orchestrator pipeline..."
                disabled={isSending || !token}
                className="w-full pl-4 pr-12 py-3 bg-forest-950 rounded-xl border border-jade-900/30 focus:border-jade-500 focus:ring-2 focus:ring-jade-500/10 outline-none text-white text-xs transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={isSending || !inputMessage.trim() || !token}
                className="absolute right-2 p-2 bg-gradient-to-r from-jade-500 to-emerald-600 hover:from-jade-600 hover:to-emerald-700 text-white rounded-lg transition-all disabled:opacity-50 cursor-pointer shadow-md"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-jade-300/40 mt-2 text-center">Connected starting point: Hackathon Strategist</p>
          </div>
        </section>

        {/* CENTER COLUMN: Interactive Workflow Topology Canvas */}
        <section className="lg:col-span-5 flex flex-col h-[calc(100vh-140px)] glass-card rounded-3xl border border-jade-900/20 relative overflow-hidden">
          <div className="px-5 py-4 border-b border-jade-900/30 bg-forest-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-jade-500 rounded-full animate-pulse glow-green-sm" />
              <h2 className="text-sm font-bold text-white tracking-tight">Active Pipeline Topology</h2>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-jade-300">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-jade-500 rounded-full" />
                <span>Running</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                <span>Stopped</span>
              </span>
            </div>
          </div>

          <div className="flex-1 relative bg-forest-950/40 overflow-hidden">
            {/* Mesh Grid Background */}
            <div className="absolute inset-0 grid-bg-pulse pointer-events-none" style={{
              backgroundImage: 'radial-gradient(rgba(29, 185, 84, 0.08) 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }} />

            {/* Connecting lines drawn via SVG */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <linearGradient id="active-flow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1db954" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              {connections.map((conn) => {
                const fromNode = agents.find(a => a.id === conn.from);
                const toNode = agents.find(a => a.id === conn.to);
                if (!fromNode || !toNode) return null;

                // Adjust line handles centered to boxes
                const x1 = fromNode.x + 85;
                const y1 = fromNode.y + 60;
                const x2 = toNode.x + 85;
                const y2 = toNode.y;

                // Render beautiful bezier path
                const pathD = `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;

                return (
                  <g key={conn.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={conn.active ? 'url(#active-flow)' : '#11351e'}
                      strokeWidth={conn.active ? 3 : 2}
                      className={conn.active ? 'animate-flow-dash' : ''}
                    />
                    {conn.active && (
                      <circle r="4" fill="#34d399" className="glow-green-sm">
                        <animateMotion dur="2s" repeatCount="indefinite" path={pathD} />
                      </circle>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Interactive Agent Nodes */}
            {agents.map((agent) => {
              const theme = AGENT_CONFIGS[agent.id] || { color: 'from-gray-500 to-gray-600', icon: '' };
              const isRunning = agent.status === 'running';
              const isSelected = selectedAgent?.id === agent.id;

              return (
                <div
                  key={agent.id}
                  onClick={() => inspectAgent(agent)}
                  style={{ left: `${agent.x}px`, top: `${agent.y}px` }}
                  className={`absolute w-44 rounded-2xl glass-card border transition-all duration-300 cursor-pointer z-10 select-none group transform hover:-translate-y-1 ${
                    isRunning ? 'running-agent-node border-jade-400' : 
                    isSelected ? 'border-jade-500 glow-green-sm bg-forest-900/80' : 'border-jade-900/40 hover:border-jade-600'
                  }`}
                >
                  <div className={`h-1.5 rounded-t-2xl bg-gradient-to-r ${theme.color}`}></div>
                  <div className="p-3 text-center">
                    <div className={`w-9 h-9 mx-auto mb-2 rounded-lg bg-gradient-to-br ${theme.color} flex items-center justify-center shadow-md text-white transition-transform group-hover:scale-110 ${isRunning ? 'animate-pulse' : ''}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={theme.icon} />
                      </svg>
                    </div>
                    <h3 className="text-xs font-bold text-white tracking-tight">{agent.name}</h3>
                    <p className="text-[9px] text-jade-300/40 font-mono mt-0.5">{agent.model}</p>
                    
                    <div className="mt-2.5 flex items-center justify-center">
                      <span className={`px-2.5 py-0.5 text-[8.5px] font-bold rounded-full uppercase ${
                        agent.status === 'running' ? 'bg-jade-500/10 text-jade-400 border border-jade-500/20' :
                        agent.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        agent.status === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-forest-950 text-gray-500 border border-jade-950'
                      }`}>
                        {agent.status}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Central Inspector Drawer */}
            {selectedAgent && (
              <div className="absolute inset-x-0 bottom-0 max-h-[70%] bg-forest-900/95 backdrop-blur-md border-t border-jade-900/40 rounded-t-3xl shadow-2xl z-20 flex flex-col transition-all duration-300">
                <div className="px-5 py-3 border-b border-jade-900/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 bg-gradient-to-br ${AGENT_CONFIGS[selectedAgent.id]?.color} rounded flex items-center justify-center text-white text-[10px]`}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={AGENT_CONFIGS[selectedAgent.id]?.icon} />
                      </svg>
                    </div>
                    <span className="text-xs font-extrabold text-white">{selectedAgent.name} Inspector</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleReloadAgent(selectedAgent.id)}
                      className="px-2.5 py-1 text-[10px] bg-jade-500 hover:bg-jade-600 text-white font-bold rounded transition-all cursor-pointer shadow-sm"
                    >
                      Reload Configuration
                    </button>
                    <button 
                      onClick={() => setSelectedAgent(null)}
                      className="text-gray-400 hover:text-white p-1"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-jade-900/20 px-4">
                  {(['info', 'tasks', 'memory', 'config'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveInspectorTab(tab);
                        setViewingMemoryFile(null);
                      }}
                      className={`px-4 py-2.5 text-xs font-bold capitalize transition-all border-b-2 cursor-pointer ${
                        activeInspectorTab === tab 
                          ? 'text-jade-400 border-jade-500' 
                          : 'text-gray-400 border-transparent hover:text-white'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Tab content viewer */}
                <div className="flex-1 overflow-y-auto p-5 text-xs">
                  {isInspectorLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <svg className="animate-spin h-6 w-6 text-jade-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-gray-400">Loading Agent workspace metadata...</span>
                    </div>
                  ) : (
                    <>
                      {/* TAB 1: General Info */}
                      {activeInspectorTab === 'info' && (
                        <div className="space-y-4">
                          <div>
                            <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold">Description</span>
                            <p className="text-jade-100 mt-1 leading-relaxed">{selectedAgent.description}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold">Runtime Image</span>
                              <p className="text-jade-300 font-mono mt-1">agentdock/agent-base:latest</p>
                            </div>
                            <div>
                              <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold">LLM Model Configuration</span>
                              <p className="text-jade-300 font-mono mt-1">{selectedAgent.model} (temp: 0.3)</p>
                            </div>
                          </div>
                          {agentRagStatus && (
                            <div className="bg-forest-950/60 border border-jade-900/20 rounded-xl p-4">
                              <div className="flex items-center justify-between mb-3">
                                <span className="font-bold text-white">Semantic Memory RAG Database</span>
                                <button 
                                  onClick={() => handleForceReindex(selectedAgent.id)}
                                  className="text-[9px] font-bold bg-jade-500/10 text-jade-300 border border-jade-500/30 hover:bg-jade-500/20 px-2.5 py-1 rounded transition-all cursor-pointer"
                                >
                                  Force Reindex Memory
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                                <span className="text-gray-400">Chunks Indexed:</span>
                                <span className="text-jade-400">{agentRagStatus.chunk_count} chunks</span>
                                <span className="text-gray-400">Embedding model:</span>
                                <span className="text-jade-400">{agentRagStatus.embedding_model}</span>
                                <span className="text-gray-400">Indexed Folders:</span>
                                <span className="text-jade-400">{agentRagStatus.folders?.join(', ') || '/memory'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB 2: Agent Task Queue */}
                      {activeInspectorTab === 'tasks' && (
                        <div className="space-y-3">
                          <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold">Recent Tasks</span>
                          {agentTasks.length === 0 ? (
                            <p className="text-gray-500 italic mt-1">No tasks submitted to this agent's queue.</p>
                          ) : (
                            <div className="space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                              {agentTasks.map((task: any, index: number) => (
                                <div key={index} className="bg-forest-950/60 border border-jade-950 rounded-xl p-3 flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between font-mono text-[10px]">
                                    <span className="text-jade-400 font-bold">TASK ID: {task.taskId || 'webhook'}</span>
                                    <span className={`px-2 py-0.5 rounded font-bold uppercase ${
                                      task.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                                      task.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                                    }`}>{task.status || 'unknown'}</span>
                                  </div>
                                  <p className="text-jade-100">{task.instruction}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB 3: Agent Memory File Manager */}
                      {activeInspectorTab === 'memory' && (
                        <div className="space-y-4">
                          {viewingMemoryFile ? (
                            <div className="flex flex-col h-[280px]">
                              <div className="flex items-center justify-between border-b border-jade-900/30 pb-2 mb-2">
                                <button 
                                  onClick={() => setViewingMemoryFile(null)}
                                  className="text-[10px] font-bold bg-forest-950 border border-jade-900/30 text-jade-300 hover:text-white px-2.5 py-1 rounded cursor-pointer"
                                >
                                  &larr; Back to File List
                                </button>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-jade-400">{viewingMemoryFile.filename}</span>
                                  <button
                                    onClick={() => downloadFile(viewingMemoryFile.filename, viewingMemoryFile.content)}
                                    className="text-[9px] font-bold bg-jade-500 text-white px-2 py-1 rounded cursor-pointer hover:bg-jade-600 transition-all"
                                  >
                                    Download File
                                  </button>
                                </div>
                              </div>
                              <div className="flex-1 bg-forest-950/60 border border-jade-950 rounded-xl p-4 overflow-y-auto font-mono text-[11px] leading-relaxed text-gray-300">
                                <MarkdownPreview content={viewingMemoryFile.content} />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold block mb-3">Agent Memory Volume Files</span>
                              {agentMemoryFiles.length === 0 ? (
                                <p className="text-gray-500 italic">Memory volume is empty. Run event pipelines to write files.</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                                  {agentMemoryFiles.map((file: any, index: number) => (
                                    <div 
                                      key={index}
                                      onClick={() => fetchMemoryFileContent(selectedAgent.id, file.filename)}
                                      className="bg-forest-950/50 border border-jade-900/20 hover:border-jade-500/50 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all hover:bg-forest-900/60"
                                    >
                                      <div className="flex items-center gap-2 overflow-hidden">
                                        <svg className="w-5 h-5 text-jade-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="font-mono text-jade-200 truncate">{file.filename}</span>
                                      </div>
                                      <span className="text-[10px] text-jade-300/40 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB 4: Configuration YAML file */}
                      {activeInspectorTab === 'config' && (
                        <div className="space-y-3 h-[250px] flex flex-col">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400 uppercase tracking-wider text-[10px] font-bold">Agent Configuration Specification</span>
                            <span className="text-[10px] text-gray-500">Read-Only View</span>
                          </div>
                          <textarea
                            value={agentConfigYaml}
                            readOnly
                            className="flex-1 w-full bg-forest-950/80 border border-jade-950 rounded-xl p-3.5 font-mono text-[10.5px] leading-relaxed text-jade-300 outline-none resize-none"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Live System Logs Terminal */}
        <section className="lg:col-span-4 flex flex-col h-[calc(100vh-140px)] glass-card rounded-3xl border border-jade-900/20 relative overflow-hidden">
          <div className="px-5 py-4 border-b border-jade-900/30 bg-forest-900/40 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-forest-950 border border-jade-900/50 rounded-lg flex items-center justify-center text-jade-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-white tracking-tight">System Events Stream</h2>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => setAutoScrollLogs(!autoScrollLogs)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all border cursor-pointer ${
                  autoScrollLogs ? 'bg-jade-500/10 text-jade-400 border-jade-500/20' : 'bg-forest-950 text-gray-500 border-jade-950'
                }`}
              >
                Scroll: {autoScrollLogs ? 'ON' : 'OFF'}
              </button>
              <button 
                onClick={() => setLogs([])}
                className="px-2.5 py-1 bg-forest-950 hover:bg-forest-900 text-gray-400 hover:text-white border border-jade-900/30 rounded text-[10px] font-bold transition-all cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Logs Filters */}
          <div className="px-4 py-2 border-b border-jade-900/20 bg-forest-900/20 grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] uppercase tracking-wider text-jade-400/50 font-bold block mb-1">Filter Level</label>
              <select
                value={logsFilterLevel}
                onChange={(e) => setLogsFilterLevel(e.target.value)}
                className="w-full bg-forest-950 border border-jade-900/30 rounded px-2.5 py-1.5 text-[10px] font-bold text-jade-300 outline-none"
              >
                <option value="all">All Levels</option>
                <option value="info">INFO</option>
                <option value="warn">WARN</option>
                <option value="error">ERROR</option>
                <option value="llm">LLM / WEBSOCKET</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wider text-jade-400/50 font-bold block mb-1">Filter Agent</label>
              <select
                value={logsFilterAgent}
                onChange={(e) => setLogsFilterAgent(e.target.value)}
                className="w-full bg-forest-950 border border-jade-900/30 rounded px-2.5 py-1.5 text-[10px] font-bold text-jade-300 outline-none"
              >
                <option value="all">All Agents</option>
                <option value="Orchestrator">Orchestrator</option>
                <option value="ideation">Strategist</option>
                <option value="script">Scriptwriter</option>
                <option value="pitch">Sponsorship</option>
                <option value="deck">Presentation</option>
              </select>
            </div>
          </div>

          {/* Logs scroll container */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-1.5">
            {getFilteredLogs().length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-600 italic">No logs recorded matching current filters.</div>
            ) : (
              getFilteredLogs().map((log) => (
                <div key={log.id} className="py-1 border-b border-jade-950/30 flex items-start gap-2 hover:bg-jade-900/5 px-1.5 rounded transition-all group">
                  <span className="text-[9.5px] text-jade-400/30 shrink-0 font-medium select-none">
                    {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={`px-1 rounded text-[8.5px] font-extrabold shrink-0 tracking-wide select-none ${getLogBadgeStyle(log.level)}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-jade-300 font-bold shrink-0">[{log.agent}]:</span>
                  <span className="text-gray-300 flex-1 break-words">{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>

          {/* Log footer count */}
          <div className="px-5 py-2.5 border-t border-jade-900/30 bg-forest-900/30 flex items-center justify-between text-[10px] text-jade-300/40">
            <span>Logged {logs.length} entries (capped: 500)</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-jade-500 rounded-full animate-ping" />
              <span>Streaming Event Pipeline Logs</span>
            </span>
          </div>
        </section>

      </main>
    </div>
  );
};

export default App;
