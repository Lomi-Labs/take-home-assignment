import { HealthResponseSchema } from "@app/contracts";
import { Router } from "express";

export function healthRouter(): Router {
    const router = Router();

    router.get("/health", (_req, res) => {
        res.json(HealthResponseSchema.parse({ status: "ok" }));
    });

    return router;
}
