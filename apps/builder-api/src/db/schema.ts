import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const systems = sqliteTable("systems", {
  id:          text("id").primaryKey(),
  name:        text("name").notNull(),
  description: text("description"),
  canvasState: text("canvas_state").notNull(),   // JSON: { nodes, edges }
  metadata:    text("metadata").notNull(),        // JSON: { agentCount, triggerCount }
  createdAt:   integer("created_at").notNull(),
  updatedAt:   integer("updated_at").notNull(),
  version:     integer("version").notNull().default(1),
});

export const systemGenerations = sqliteTable("system_generations", {
  id:          text("id").primaryKey(),
  systemId:    text("system_id").notNull().references(() => systems.id, { onDelete: "cascade" }),
  version:     integer("version").notNull(),
  generatedAt: integer("generated_at").notNull(),
  zipPath:     text("zip_path"),
  notes:       text("notes"),
});

export type System = typeof systems.$inferSelect;
export type NewSystem = typeof systems.$inferInsert;
export type SystemGeneration = typeof systemGenerations.$inferSelect;
export type NewSystemGeneration = typeof systemGenerations.$inferInsert;
