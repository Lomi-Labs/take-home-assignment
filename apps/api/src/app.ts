import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Container } from "@/container";
import { errorHandler, notFoundHandler } from "@/middleware/error-handler";
import { healthRouter } from "@/routes/health.router";

const REQUEST_ID_HEADER = "x-request-id";

export function createApp(container: Container): Express {
    const app = express();

    app.disable("x-powered-by");
    app.use(helmet());
    app.use(
        pinoHttp({
            logger: container.logger,
            genReqId: (req, res) => {
                const id = req.headers[REQUEST_ID_HEADER]?.toString() ?? randomUUID();
                res.setHeader(REQUEST_ID_HEADER, id);
                return id;
            },
        }),
    );
    app.use(express.json());

    app.use(healthRouter());

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}
