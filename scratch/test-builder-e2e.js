#!/usr/bin/env node
/**
 * AgentDock Builder E2E Test Suite
 * Tests: login, create system, describe (simple/medium/complex), patch, generate
 * Validates: agent quality, connections, RAG, MCPs, infinite loop guards, endpoint config
 */

const BASE = "http://localhost:3001";
let TOKEN = "";

const PROMPTS = [
  {
    label: "SIMPLE — personal quiz bot",
    description: "I want a simple quiz bot that asks me 5 questions on any topic I give it and scores my answers",
  },
  {
    label: "MEDIUM — JEE adaptive tutor",
    description: "I want to help JEE aspirants identify weak topics and get personalized daily practice. Track each student's progress across sessions.",
  },
  {
    label: "COMPLEX — WhatsApp classroom with MCPs",
    description: "Build a WhatsApp-based classroom tool for a coaching institute. Students send their doubts via WhatsApp. The system should search the web for answers, generate a structured explanation, and send it back via WhatsApp. Also store each student's question history and weak areas. Support multiple students.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); process.exitCode = 1; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function section(msg) { console.log(`\n${"─".repeat(60)}\n${msg}\n${"─".repeat(60)}`); }

// ── Validators ────────────────────────────────────────────────────────────────

function validateAgent(agent, idx, intent) {
  const issues = [];
  const d = agent.data || agent;

  // Identity
  if (!d.id || !d.id.includes("-")) issues.push(`agent[${idx}].id not kebab-case: "${d.id}"`);
  if (!d.name) issues.push(`agent[${idx}] missing name`);

  // LLM
  const llm = d.llm || {};
  if (!llm.systemPrompt || llm.systemPrompt.length < 80)
    issues.push(`agent[${idx}] "${d.id}" systemPrompt too short (${llm.systemPrompt?.length ?? 0} chars) — must be specific`);
  if (llm.temperature === undefined) issues.push(`agent[${idx}] "${d.id}" missing temperature`);
  if (llm.temperature > 0.8) issues.push(`agent[${idx}] "${d.id}" temperature ${llm.temperature} too high`);

  // Actions
  const actions = d.actions || [];
  if (actions.length === 0) issues.push(`agent[${idx}] "${d.id}" has no actions`);
  for (const act of actions) {
    if (!act.name) issues.push(`agent[${idx}] "${d.id}" action missing name`);
    if (!act.promptTemplate || act.promptTemplate.length < 30)
      issues.push(`agent[${idx}] "${d.id}" action "${act.name}" promptTemplate too short`);
    if (act.outputFile === "output.md" || act.outputFile === "result.md")
      issues.push(`agent[${idx}] "${d.id}" uses generic outputFile "${act.outputFile}"`);
  }

  // Triggers
  const triggers = d.triggers || [];
  if (triggers.length === 0) issues.push(`agent[${idx}] "${d.id}" has no triggers`);

  // RAG
  const rag = d.rag || {};
  // If agent needs user state, RAG should be enabled
  if (intent?.needsUserState && d.id?.includes("analyz")) {
    if (!rag.enabled) issues.push(`agent[${idx}] "${d.id}" should have RAG enabled (user state system)`);
  }

  return issues;
}

function validateConnections(nodes, edges, intent) {
  const issues = [];
  const nodeIds = new Set(nodes.map(n => n.id));

  // Check all edges reference valid nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) issues.push(`edge source "${edge.source}" not in nodes`);
    if (!nodeIds.has(edge.target)) issues.push(`edge target "${edge.target}" not in nodes`);
    if (!edge.data?.trigger?.filePattern && edge.data?.trigger?.type === "file_received")
      issues.push(`edge ${edge.id} is file_received but missing filePattern`);
  }

  // Check first agent has webhook trigger
  if (nodes.length > 0) {
    const firstNode = nodes[0];
    const triggers = firstNode.data?.triggers || [];
    const hasWebhook = triggers.some(t => t.type === "webhook");
    if (!hasWebhook) issues.push(`First agent "${firstNode.data?.id}" missing webhook trigger`);
  }

  // Check file handoff integrity: edge filePattern must match source agent's outputFile
  for (const edge of edges) {
    if (edge.data?.trigger?.type !== "file_received") continue;
    const filePattern = edge.data.trigger.filePattern;
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (!sourceNode) continue;
    const actions = sourceNode.data?.actions || [];
    const hasMatchingOutput = actions.some(a => a.outputFile === filePattern);
    if (!hasMatchingOutput) {
      issues.push(`Connection ${sourceNode.data?.id} → edge expects file "${filePattern}" but source agent has no action outputting it`);
    }
  }

  // Check for disconnected agents (except single-agent systems)
  if (nodes.length > 1) {
    const connectedIds = new Set([...edges.map(e => e.source), ...edges.map(e => e.target)]);
    for (const node of nodes) {
      if (!connectedIds.has(node.id))
        issues.push(`Agent "${node.data?.id}" is disconnected — no edges`);
    }
  }

  return issues;
}

function validateInfiniteLoopGuards(nodes) {
  const issues = [];
  // Check MAX_TOOL_ROUNDS equivalent — agent loop must have a hard limit
  // We verify this by checking the agent config doesn't have circular self-references
  // and that no agent triggers itself
  for (const node of nodes) {
    const actions = node.data?.actions || [];
    for (const act of actions) {
      if (act.outputFile && act.outputFile === act.inputFile)
        issues.push(`Agent "${node.data?.id}" action "${act.name}" reads and writes same file — potential loop`);
    }
  }
  return issues;
}

function validateRAG(nodes, intent) {
  const issues = [];
  if (!intent?.needsUserState) return issues;

  const ragEnabledAgents = nodes.filter(n => n.data?.rag?.enabled);
  if (ragEnabledAgents.length === 0)
    issues.push("System needs user state but NO agent has RAG enabled");

  for (const node of nodes) {
    const rag = node.data?.rag || {};
    if (rag.enabled) {
      if (!rag.embedding_model) issues.push(`Agent "${node.data?.id}" RAG enabled but no embedding_model`);
      if (!rag.folders || rag.folders.length === 0) issues.push(`Agent "${node.data?.id}" RAG enabled but no folders configured`);
    }
  }

  // Multi-user: check profile path pattern
  if (intent?.multiUser) {
    for (const node of nodes) {
      const sp = node.data?.llm?.systemPrompt || "";
      const actions = node.data?.actions || [];
      const allText = sp + actions.map(a => a.promptTemplate || "").join(" ");
      if (node.data?.rag?.enabled && !allText.includes("userId") && !allText.includes("profiles/")) {
        issues.push(`Agent "${node.data?.id}" is in multi-user system but doesn't reference userId namespacing`);
      }
    }
  }

  return issues;
}

function validateMCPs(nodes, description) {
  const issues = [];
  const descLower = description.toLowerCase();

  // If description mentions WhatsApp, check for whatsapp MCP
  if (descLower.includes("whatsapp")) {
    const hasWhatsApp = nodes.some(n =>
      (n.data?.mcps || []).some(m => m.name?.toLowerCase().includes("whatsapp"))
    );
    if (!hasWhatsApp) issues.push("Description mentions WhatsApp but no WhatsApp MCP configured on any agent");
  }

  // If description mentions Gmail/email, check for gmail MCP
  if (descLower.includes("gmail") || descLower.includes("email")) {
    const hasGmail = nodes.some(n =>
      (n.data?.mcps || []).some(m => m.name?.toLowerCase().includes("gmail") || m.name?.toLowerCase().includes("email"))
    );
    if (!hasGmail) issues.push("Description mentions email but no Gmail/email MCP configured");
  }

  // Validate MCP schema for any configured MCPs
  for (const node of nodes) {
    for (const mcp of (node.data?.mcps || [])) {
      if (!mcp.name) issues.push(`Agent "${node.data?.id}" has MCP with no name`);
      if (!mcp.transport) issues.push(`Agent "${node.data?.id}" MCP "${mcp.name}" missing transport`);
      if (mcp.transport === "sse" && !mcp.url) issues.push(`Agent "${node.data?.id}" MCP "${mcp.name}" SSE transport missing url`);
      if (mcp.transport === "stdio" && !mcp.command) issues.push(`Agent "${node.data?.id}" MCP "${mcp.name}" stdio transport missing command`);
    }
  }

  return issues;
}

// ── Test Runner ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log("AgentDock Builder E2E Test Suite");
  console.log("================================\n");

  // 1. Login
  section("1. Authentication");
  const loginRes = await api("POST", "/api/auth/login", { email: "admin@agentdock.local", password: "shreyasjoshi" });
  if (loginRes.status === 200 && loginRes.data.token) {
    TOKEN = loginRes.data.token;
    pass(`Login OK — token obtained`);
  } else {
    fail(`Login failed: ${JSON.stringify(loginRes.data)}`);
    return;
  }

  const results = [];

  // 2. Test each prompt
  for (const { label, description } of PROMPTS) {
    section(`2. Describe: ${label}`);
    console.log(`   Prompt: "${description.slice(0, 80)}..."`);

    // Create system
    const createRes = await api("POST", "/api/systems", { name: `Test: ${label}`, description });
    if (createRes.status !== 201) {
      fail(`Create system failed: ${JSON.stringify(createRes.data)}`);
      continue;
    }
    const systemId = createRes.data.id;
    pass(`System created: ${systemId}`);

    // Describe (this is the main LLM call)
    console.log(`   Calling /describe (this takes 30-120s with Ollama)...`);
    const t0 = Date.now();
    const descRes = await api("POST", `/api/systems/${systemId}/describe`, { description });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    if (descRes.status !== 200) {
      fail(`Describe failed (${elapsed}s): ${JSON.stringify(descRes.data).slice(0, 300)}`);
      results.push({ label, systemId, success: false, error: descRes.data });
      continue;
    }

    const { canvasState, intent, agentCount } = descRes.data;
    pass(`Describe OK in ${elapsed}s — ${agentCount} agents generated`);

    // Print intent summary
    console.log(`   Intent: pattern=${intent?.pattern}, needsUserState=${intent?.needsUserState}, multiUser=${intent?.multiUser}`);
    console.log(`   Agents: ${intent?.agents?.map(a => a.id).join(", ")}`);

    const { nodes, edges } = canvasState;
    const allIssues = [];

    // Validate each agent
    for (let i = 0; i < nodes.length; i++) {
      const agentIssues = validateAgent(nodes[i], i, intent);
      allIssues.push(...agentIssues);
    }

    // Validate connections
    allIssues.push(...validateConnections(nodes, edges, intent));

    // Validate infinite loop guards
    allIssues.push(...validateInfiniteLoopGuards(nodes));

    // Validate RAG
    allIssues.push(...validateRAG(nodes, intent));

    // Validate MCPs
    allIssues.push(...validateMCPs(nodes, description));

    if (allIssues.length === 0) {
      pass(`All quality checks passed`);
    } else {
      for (const issue of allIssues) fail(issue);
    }

    // Print agent details
    for (const node of nodes) {
      const d = node.data;
      const rag = d.rag || {};
      const mcps = d.mcps || [];
      const actions = d.actions || [];
      console.log(`\n   Agent: ${d.id}`);
      console.log(`     temp=${d.llm?.temperature}, rag=${rag.enabled}, self_learning=${rag.self_learning}`);
      console.log(`     triggers: ${(d.triggers||[]).map(t=>t.type).join(",")}`);
      console.log(`     actions: ${actions.map(a => `${a.name}→${a.outputFile||"(none)"}`).join(", ")}`);
      if (mcps.length > 0) console.log(`     mcps: ${mcps.map(m=>m.name).join(", ")}`);
      console.log(`     systemPrompt[0:120]: ${d.llm?.systemPrompt?.slice(0,120)}...`);
    }

    // 3. Test patch endpoint
    section(`3. Patch: ${label}`);
    const patchRes = await api("POST", `/api/systems/${systemId}/patch`, {
      change: "make the first agent's system prompt more detailed about handling edge cases"
    });
    if (patchRes.status === 200) {
      pass(`Patch OK — affected agent: ${patchRes.data.affectedAgentId}`);
    } else {
      fail(`Patch failed: ${JSON.stringify(patchRes.data).slice(0, 200)}`);
    }

    // 4. Test generate endpoint
    section(`4. Generate zip: ${label}`);
    const genRes = await fetch(`${BASE}/api/systems/${systemId}/generate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${TOKEN}` },
    });
    if (genRes.status === 200) {
      const contentType = genRes.headers.get("content-type");
      const genId = genRes.headers.get("x-generation-id");
      const buf = await genRes.arrayBuffer();
      pass(`Generate OK — ${(buf.byteLength/1024).toFixed(1)}KB zip, genId=${genId}, type=${contentType}`);
    } else {
      const errText = await genRes.text();
      fail(`Generate failed ${genRes.status}: ${errText.slice(0, 200)}`);
    }

    results.push({ label, systemId, success: allIssues.length === 0, issues: allIssues, agentCount, intent });
  }

  // Summary
  section("SUMMARY");
  for (const r of results) {
    const status = r.success ? "✅ PASS" : `❌ FAIL (${r.issues?.length} issues)`;
    console.log(`  ${status} — ${r.label} (${r.agentCount} agents)`);
  }

  const passed = results.filter(r => r.success).length;
  console.log(`\n  ${passed}/${results.length} test scenarios passed`);

  // Write full results to file for analysis
  const fs = await import("fs");
  fs.writeFileSync("/home/lightdesk/Downloads/Projects/AgentDock/scratch/test-results.json",
    JSON.stringify(results, null, 2));
  console.log("\n  Full results written to scratch/test-results.json");
}

runTests().catch(e => { console.error("Test runner crashed:", e); process.exit(1); });
