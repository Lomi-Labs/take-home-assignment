import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@/app";
import { parseConfig } from "@/config";
import { createContainer } from "@/container";

const app = createApp(createContainer(parseConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" })));

describe("GET /health", () => {
    it("returns 200 ok", async () => {
        const res = await request(app).get("/health");

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: "ok" });
    });

    it("echoes the request id it was given", async () => {
        const res = await request(app).get("/health").set("x-request-id", "req-123");

        expect(res.headers["x-request-id"]).toBe("req-123");
    });
});

describe("errors", () => {
    it("returns 404 route_not_found for an unknown route", async () => {
        const res = await request(app).get("/nope");

        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "route_not_found", detail: "No route for GET /nope" });
    });

    it("returns 422 validation_failed for a malformed JSON body", async () => {
        const res = await request(app).post("/health").set("content-type", "application/json").send('{"bad');

        expect(res.status).toBe(422);
        expect(res.body).toEqual({ error: "validation_failed", detail: "Request body is not valid JSON" });
    });
});
