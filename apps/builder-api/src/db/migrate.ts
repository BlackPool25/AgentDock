import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

const dbPath = process.env.DATABASE_PATH ?? "./data/builder.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

const db = drizzle(sqlite);
migrate(db, { migrationsFolder: join(import.meta.dir, "migrations") });
console.log("Migrations applied");
sqlite.close();
