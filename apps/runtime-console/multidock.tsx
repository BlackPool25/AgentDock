import React, { useState, useEffect, useRef } from 'react';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AgentNode {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  type: 'coordinator' | 'researcher' | 'coder' | 'reviewer' | 'executor';
  x: number;
  y: number;
}

interface Connection {
  from: string;
  to: string;
  active: boolean;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'llm';
  agent: string;
  message: string;
}

// Login Component
const LoginOverlay: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 1000);
  };

  return (
    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
      <div className="w-full max-w-sm px-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Welcome Back</h2>
          <p className="text-gray-500 mt-1">Sign in to access your agents</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
              placeholder="Enter your username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-200 disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
        
        <p className="text-center text-sm text-gray-500 mt-6">
          Don't have an account? <a href="#" className="text-emerald-600 font-medium hover:underline">Get started</a>
        </p>
      </div>
    </div>
  );
};

// Chat Section Component
const ChatSection: React.FC<{ isAuthenticated: boolean; onLogin: () => void }> = ({ isAuthenticated, onLogin }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your multi-agent orchestrator. I can help you coordinate complex tasks across multiple AI agents. What would you like to accomplish today?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I\'ve initiated a workflow with 4 agents to handle your request. You can see the execution in the workflow panel. The Coordinator is delegating tasks to specialized agents.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
    }, 1500);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-xl shadow-gray-100/50 border border-gray-100 overflow-hidden relative">
      {!isAuthenticated && <LoginOverlay onLogin={onLogin} />}
      
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#F0FFF0] to-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-md">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-gray-800">Agent Chat</h2>
            <p className="text-xs text-gray-500">Connected to orchestrator</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span className="text-xs text-gray-500">Online</span>
          </div>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-br-md'
                  : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}
            >
              <p className="text-sm leading-relaxed">{message.content}</p>
              <p className={`text-xs mt-1.5 ${message.role === 'user' ? 'text-emerald-100' : 'text-gray-400'}`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Describe your task..."
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-sm"
            disabled={!isAuthenticated}
          />
          <button
            onClick={sendMessage}
            disabled={!isAuthenticated}
            className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg shadow-emerald-200 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// Workflow Canvas Component
const WorkflowCanvas: React.FC = () => {
  const [agents, setAgents] = useState<AgentNode[]>([
    { id: '1', name: 'Coordinator', type: 'coordinator', status: 'running', x: 200, y: 50 },
    { id: '2', name: 'Researcher', type: 'researcher', status: 'running', x: 80, y: 180 },
    { id: '3', name: 'Coder', type: 'coder', status: 'idle', x: 200, y: 180 },
    { id: '4', name: 'Reviewer', type: 'reviewer', status: 'idle', x: 320, y: 180 },
    { id: '5', name: 'Executor', type: 'executor', status: 'idle', x: 200, y: 310 },
  ]);

  const [connections] = useState<Connection[]>([
    { from: '1', to: '2', active: true },
    { from: '1', to: '3', active: false },
    { from: '1', to: '4', active: false },
    { from: '2', to: '5', active: false },
    { from: '3', to: '5', active: false },
    { from: '4', to: '5', active: false },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAgents(prev => prev.map(agent => {
        if (agent.status === 'running' && Math.random() > 0.7) {
          return { ...agent, status: 'completed' as const };
        }
        if (agent.status === 'idle' && Math.random() > 0.8) {
          return { ...agent, status: 'running' as const };
        }
        return agent;
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const getAgentColor = (type: string, status: string) => {
    if (status === 'error') return 'from-red-400 to-red-500';
    if (status === 'completed') return 'from-emerald-400 to-emerald-500';
    if (status === 'running') return 'from-amber-400 to-orange-500';
    
    const colors: Record<string, string> = {
      coordinator: 'from-violet-400 to-purple-500',
      researcher: 'from-blue-400 to-indigo-500',
      coder: 'from-cyan-400 to-teal-500',
      reviewer: 'from-pink-400 to-rose-500',
      executor: 'from-emerald-400 to-green-500',
    };
    return colors[type] || 'from-gray-400 to-gray-500';
  };

  const getAgentIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      coordinator: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />,
      researcher: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />,
      coder: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />,
      reviewer: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
      executor: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
    };
    return icons[type] || icons.coordinator;
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-2xl shadow-xl shadow-gray-100/50 border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-[#F0FFF0] to-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Workflow Runner</h2>
              <p className="text-xs text-gray-500">Real-time agent orchestration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
              Running
            </span>
          </div>
        </div>
      </div>
      
      {/* Canvas */}
      <div className="flex-1 relative bg-gradient-to-br from-gray-50 to-[#F0FFF0]/30 overflow-hidden">
        {/* Grid Pattern */}
        <svg className="absolute inset-0 w-full h-full" xmlns="[w3.org](http://www.w3.org/2000/svg)">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Connections */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map((conn, idx) => {
            const fromAgent = agents.find(a => a.id === conn.from);
            const toAgent = agents.find(a => a.id === conn.to);
            if (!fromAgent || !toAgent) return null;
            
            const x1 = fromAgent.x + 50;
            const y1 = fromAgent.y + 70;
            const x2 = toAgent.x + 50;
            const y2 = toAgent.y;
            
            return (
              <g key={idx}>
                <path
                  d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={conn.active ? '#10b981' : '#d1d5db'}
                  strokeWidth={conn.active ? 3 : 2}
                  strokeDasharray={conn.active ? '0' : '5,5'}
                  className={conn.active ? 'animate-pulse' : ''}
                />
                {conn.active && (
                  <circle r="4" fill="#10b981">
                    <animateMotion
                      dur="1.5s"
                      repeatCount="indefinite"
                      path={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Agent Nodes */}
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="absolute transition-all duration-300 cursor-pointer group"
            style={{ left: agent.x, top: agent.y }}
          >
            <div className={`w-[100px] bg-white rounded-xl shadow-lg border-2 ${
              agent.status === 'running' ? 'border-amber-400 shadow-amber-100' :
              agent.status === 'completed' ? 'border-emerald-400 shadow-emerald-100' :
              agent.status === 'error' ? 'border-red-400 shadow-red-100' :
              'border-gray-200'
            } overflow-hidden transform group-hover:scale-105 transition-transform`}>
              <div className={`h-1.5 bg-gradient-to-r ${getAgentColor(agent.type, agent.status)}`}></div>
              <div className="p-3 text-center">
                <div className={`w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br ${getAgentColor(agent.type, agent.status)} flex items-center justify-center shadow-md ${agent.status === 'running' ? 'animate-pulse' : ''}`}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {getAgentIcon(agent.type)}
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-700">{agent.name}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] rounded-full font-medium ${
                  agent.status === 'running' ? 'bg-amber-100 text-amber-700' :
                  agent.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                  agent.status === 'error' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {agent.status}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer Stats */}
      <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
            <span className="text-gray-600">Completed: {agents.filter(a => a.status === 'completed').length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
            <span className="text-gray-600">Running: {agents.filter(a => a.status === 'running').length}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-gray-300 rounded-full"></span>
            <span className="text-gray-600">Idle: {agents.filter(a => a.status === 'idle').length}</span>
          </span>
        </div>
        <span className="text-gray-400">5 agents active</span>
      </div>
    </div>
  );
};

// System Logs Component
const SystemLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: '1', timestamp: new Date(), level: 'info', agent: 'System', message: 'Multi-agent orchestration initialized' },
    { id: '2', timestamp: new Date(), level: 'info', agent: 'Coordinator', message: 'Received task delegation request' },
    { id: '3', timestamp: new Date(), level: 'debug', agent: 'Coordinator', message: 'Analyzing task complexity...' },
    { id: '4', timestamp: new Date(), level: 'llm', agent: 'Coordinator', message: 'GPT-4 response: Task requires research, coding, and review phases' },
    { id: '5', timestamp: new Date(), level: 'info', agent: 'Researcher', message: 'Starting web search for relevant documentation' },
  ]);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      const newLogs: LogEntry[] = [
        { id: Date.now().toString(), timestamp: new Date(), level: 'debug', agent: 'Researcher', message: 'Fetching API documentation from source...' },
        { id: Date.now().toString() + '1', timestamp: new Date(), level: 'llm', agent: 'Researcher', message: 'Claude response: Found 3 relevant endpoints for integration' },
        { id: Date.now().toString() + '2', timestamp: new Date(), level: 'info', agent: 'Coder', message: 'Generating implementation code...' },
        { id: Date.now().toString() + '3', timestamp: new Date(), level: 'warn', agent: 'Reviewer', message: 'Potential type mismatch detected in line 42' },
        { id: Date.now().toString() + '4', timestamp: new Date(), level: 'info', agent: 'Executor', message: 'Running test suite...' },
      ];
      
      const randomLog = newLogs[Math.floor(Math.random() * newLogs.length)];
      setLogs(prev => [...prev.slice(-50), { ...randomLog, id: Date.now().toString(), timestamp: new Date() }]);
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const getLevelStyles = (level: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      info: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'INFO' },
      warn: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'WARN' },
      error: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'ERROR' },
      debug: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: 'DEBUG' },
      llm: { bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'LLM' },
    };
    return styles[level] || styles.info;
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 rounded-2xl shadow-xl shadow-gray-900/20 border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 rounded-xl flex items-center justify-center border border-gray-700">
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-gray-100">System Logs</h2>
              <p className="text-xs text-gray-500">Live execution stream</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                autoScroll ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-400'
              }`}
            >
              Auto-scroll {autoScroll ? 'ON' : 'OFF'}
            </button>
            <button
              onClick={() => setLogs([])}
              className="px-3 py-1.5 bg-gray-800 text-gray-400 rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
      
      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm">
        {logs.map((log) => {
          const levelStyle = getLevelStyles(log.level);
          return (
            <div key={log.id} className="flex items-start gap-3 py-1.5 hover:bg-gray-800/50 px-2 rounded group">
              <span className="text-gray-600 text-xs whitespace-nowrap">
                {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${levelStyle.bg} ${levelStyle.text}`}>
                {levelStyle.label}
              </span>
              <span className="text-cyan-400 text-xs whitespace-nowrap">[{log.agent}]</span>
              <span className="text-gray-300 flex-1">{log.message}</span>
            </div>
          );
        })}
        <div ref={logsEndRef} />
      </div>
      
      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-gray-500">{logs.length} entries</span>
          <span className="text-gray-600">|</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
            <span className="text-gray-500">Streaming</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {['info', 'warn', 'llm', 'debug'].map((level) => {
            const style = getLevelStyles(level);
            return (
              <span key={level} className={`${style.text} text-[10px] uppercase`}>{style.label}</span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Main App Component
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F0FFF0] via-white to-gray-50">
      {/* Header */}
      <header className="px-8 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">AgentFlow</h1>
              <p className="text-xs text-gray-500">Multi-Agent Orchestration Platform</p>
            </div>
          </div>
          
          <nav className="flex items-center gap-6">
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Workflows</a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Agents</a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Analytics</a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Settings</a>
          </nav>
          
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <div className="w-9 h-9 bg-gradient-to-br from-violet-400 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-md cursor-pointer">
              {isAuthenticated ? 'JD' : '?'}
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="p-6 max-w-[1800px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          {/* Left Column - Chat */}
          <div className="lg:col-span-3 h-full">
            <ChatSection isAuthenticated={isAuthenticated} onLogin={() => setIsAuthenticated(true)} />
          </div>
          
          {/* Middle Column - Workflow */}
          <div className="lg:col-span-5 h-full">
            <WorkflowCanvas />
          </div>
          
          {/* Right Column - Logs */}
          <div className="lg:col-span-4 h-full">
            <SystemLogs />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
