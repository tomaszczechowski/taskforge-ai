/**
 * Copyright 2026 Tomasz Czechowski <tomasz@czechowski.pl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createLogger, format, transports } from "winston";

/**
 * Shared application logger. Level is controlled by the `LOG_LEVEL` environment
 * variable (default: `"info"`). In non-production environments the output is
 * colourised for readability.
 *
 * Usage:
 * ```ts
 * import { logger } from "@taskforge-ai/shared";
 * logger.info("[ticket] processing started");
 * logger.warn("[git] nothing to commit");
 * logger.error("[jira] transition failed", { error });
 * ```
 */
export const logger = createLogger({
    level: process.env.LOG_LEVEL ?? "info",
    format: format.combine(
        format.timestamp({ format: "HH:mm:ss" }),
        format.colorize(),
        format.printf(({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`),
    ),
    transports: [new transports.Console()],
});
