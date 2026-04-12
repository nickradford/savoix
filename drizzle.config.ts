import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  dialect: "sqlite",
  schema: "./server/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: "./data/app.db",
  },
});
