import { type Logger, pino } from "pino";
import type { Config } from "@/config";

/** Never log document text, prompts or secrets; they live in the database, not the logs. */
const REDACT_PATHS = ["req.headers.authorization", "*.apiKey", "*.GEMINI_API_KEY", "*.pdf", "*.parsedText", "*.prompt"];

export function createLogger(config: Config): Logger {
    return pino({
        level: config.LOG_LEVEL,
        redact: { paths: REDACT_PATHS, censor: "[redacted]" },
        ...(config.NODE_ENV === "development" && { transport: { target: "pino-pretty" } }),
    });
}
