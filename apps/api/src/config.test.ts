import { describe, expect, it } from "vitest";
import { parseConfig } from "@/config";

describe("parseConfig", () => {
    it("defaults every key to the local docker compose setup", () => {
        expect(parseConfig({})).toEqual({
            NODE_ENV: "development",
            PORT: 4000,
            LOG_LEVEL: "info",
            DATABASE_URL: "postgresql://postgres:postgres@localhost:5433/lomi-pdf-extractor",
            REDIS_URL: "redis://localhost:6379",
        });
    });

    it("rejects a database url that is not postgres", () => {
        expect(() => parseConfig({ DATABASE_URL: "mysql://localhost/db" })).toThrow(/DATABASE_URL/);
    });

    it("rejects a non-numeric port", () => {
        expect(() => parseConfig({ PORT: "abc" })).toThrow(/PORT/);
    });
});
