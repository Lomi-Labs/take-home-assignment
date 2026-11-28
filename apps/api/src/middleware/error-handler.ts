import { type ApiErrorBody, ApiErrorBodySchema } from "@app/contracts";
import type { ErrorRequestHandler, RequestHandler } from "express";

function send(res: Parameters<RequestHandler>[1], status: number, body: ApiErrorBody): void {
    res.status(status).json(ApiErrorBodySchema.parse(body));
}

/** body-parser marks a body it can't parse with type 'entity.parse.failed'. */
function isBodyParseError(err: unknown): boolean {
    return typeof err === "object" && err !== null && "type" in err && err.type === "entity.parse.failed";
}

export const notFoundHandler: RequestHandler = (req, res) => {
    send(res, 404, { error: "route_not_found", detail: `No route for ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
    if (isBodyParseError(err)) {
        send(res, 422, { error: "validation_failed", detail: "Request body is not valid JSON" });
        return;
    }
    req.log.error({ err }, "unhandled error");
    send(res, 500, { error: "internal_error", detail: "Something went wrong" });
};
