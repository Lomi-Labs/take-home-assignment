import type { Logger } from "pino";
import type { Config } from "@/config";
import { createLogger } from "@/logger";

/** Composition root: everything the routes need, built once. Core services get wired in here as they land. */
export interface Container {
    config: Config;
    logger: Logger;
}

export function createContainer(config: Config): Container {
    return {
        config,
        logger: createLogger(config),
    };
}
