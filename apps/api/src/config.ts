import { z } from "zod";

const ConfigSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    DATABASE_URL: z
        .url({ protocol: /^postgres(ql)?$/ })
        .default("postgresql://postgres:postgres@localhost:5433/lomi-pdf-extractor"),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }).default("redis://localhost:6379"),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Parses an environment. Throws with every invalid key listed so a bad deploy fails at boot. */
export function parseConfig(env: NodeJS.ProcessEnv): Config {
    const parsed = ConfigSchema.safeParse(env);
    if (!parsed.success) {
        throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    return parsed.data;
}

let cached: Config | undefined;

/** The process config, parsed once. */
export function getConfig(): Config {
    cached ??= parseConfig(process.env);
    return cached;
}
