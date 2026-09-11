import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 30 });
const file = path.join(root, "supabase", "full_setup.sql");
const text = fs.readFileSync(file, "utf8");
await sql.unsafe(text);
await sql.end({ timeout: 5 });
console.log("Schema applied from supabase/full_setup.sql");
