import { createApp } from "@/app";
import { getConfig } from "@/config";
import { createContainer } from "@/container";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = getConfig();
const container = createContainer(config);
const { logger } = container;

const server = createApp(container).listen(config.PORT, () => {
    logger.info({ port: config.PORT }, "api listening");
});

function shutdown(signal: NodeJS.Signals): void {
    logger.info({ signal }, "shutting down");
    setTimeout(() => {
        logger.error("shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    server.close((err) => {
        if (err) {
            logger.error({ err }, "error while closing server");
            process.exit(1);
        }
        process.exit(0);
    });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
