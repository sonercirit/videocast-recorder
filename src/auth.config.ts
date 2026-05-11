import { createAuth, type AuthDatabase } from "./auth";

const schemaGenerationDb = {} as AuthDatabase;

// Configuration used by the Better Auth CLI to generate the Drizzle schema.
export const auth = createAuth({
  db: schemaGenerationDb,
  secret: "schema-generation-only-secret-value",
  baseURL: "http://localhost:8787",
});
