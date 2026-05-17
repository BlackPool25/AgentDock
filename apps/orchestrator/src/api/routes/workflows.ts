import { Hono } from "hono";
import { loadAllWorkflows, loadWorkflow, saveWorkflow } from "../../workflow/parser.js";
import { WorkflowConfigSchema } from "@agentdock/config-schema";

export const workflowRoutes = new Hono();

workflowRoutes.get("/", (c) => {
  return c.json(loadAllWorkflows());
});

workflowRoutes.get("/:id", (c) => {
  try {
    return c.json(loadWorkflow(c.req.param("id")));
  } catch {
    return c.json({ error: "Workflow not found", code: "NOT_FOUND" }, 404);
  }
});

workflowRoutes.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = WorkflowConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.message, code: "VALIDATION_ERROR" }, 400);
  }
  saveWorkflow(parsed.data);
  return c.json(parsed.data, 201);
});

workflowRoutes.put("/:id", async (c) => {
  const body = await c.req.json();
  const parsed = WorkflowConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.message, code: "VALIDATION_ERROR" }, 400);
  }
  saveWorkflow(parsed.data);
  return c.json(parsed.data);
});
