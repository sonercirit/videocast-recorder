import { betterAuth } from "better-auth";
import {
  drizzleAdapter,
  type DrizzleAdapterConfig,
} from "better-auth/adapters/drizzle";

export type AuthDatabase = Parameters<typeof drizzleAdapter>[0];

export type AuthEnv = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGIN?: string;
};

type CreateAuthOptions = {
  db: AuthDatabase;
  secret: string;
  baseURL?: string;
  trustedOrigins?: string[];
  schema?: DrizzleAdapterConfig["schema"];
};

const emailAndPassword = {
  enabled: true,
  requireEmailVerification: false,
} as const;

export function createAuth({
  db,
  secret,
  baseURL,
  trustedOrigins,
  schema,
}: CreateAuthOptions) {
  const filteredTrustedOrigins = trustedOrigins?.filter(
    (origin): origin is string => Boolean(origin),
  );

  return betterAuth({
    secret,
    baseURL,
    trustedOrigins: filteredTrustedOrigins?.length
      ? filteredTrustedOrigins
      : undefined,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      ...(schema ? { schema } : {}),
    }),
    emailAndPassword,
  });
}

export function createAuthFromEnv(
  env: AuthEnv,
  db: AuthDatabase,
  schema: NonNullable<DrizzleAdapterConfig["schema"]>,
) {
  return createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.APP_ORIGIN, env.BETTER_AUTH_URL].filter(
      (origin): origin is string => Boolean(origin),
    ),
    schema,
  });
}
