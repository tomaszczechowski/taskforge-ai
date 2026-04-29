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

import { getAssignedTickets } from "./jira-loop.js";
import { processTicket } from "./processor.js";
import type { JiraIssue, TaskForgeConfig } from "@taskforge-ai/shared";
import { logger } from "@taskforge-ai/shared";

export * from "./implement.js";
export * from "./jira-loop.js";
export * from "./processor.js";
export * from "./spec.js";

async function loop(config: TaskForgeConfig, agentIndex: number) {
    let round = 0;

    while (true) {
        try {
            const tickets: JiraIssue[] = (await getAssignedTickets(process.env.JIRA_USER_NAME as string)) ?? [];

            logger.info(`[worker] Found ${tickets.length} tickets for user ${process.env.JIRA_USER_NAME}`);

            await Promise.allSettled(
                tickets.map((ticket) =>
                    processTicket(ticket, config, agentIndex).catch((err: unknown) =>
                        logger.error(`[worker] Error processing ticket ${ticket.key}: ${err instanceof Error ? err.message : String(err)}`)
                    )
                )
            );
        } catch (e) {
            logger.error(`[worker] Cannot fetch tickets: ${e instanceof Error ? e.message : String(e)}`);
        }

        const poolingInterval = config.agents.list[agentIndex].poolingInterval;

        logger.info(`[worker] Round ${++round} complete — next poll in ${poolingInterval / 1000}s`);

        await sleep(poolingInterval);
    }
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export default function startWorker(config: TaskForgeConfig, agentIndex: number) {
    loop(config, agentIndex);
}

