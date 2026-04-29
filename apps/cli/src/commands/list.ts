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

import chalk from "chalk";
import ora from "ora";
import { existsSync } from "fs";
import { Ticket } from "@taskforge-ai/jira-client";

export interface CommandList {
    path: string;
}

export const list = async () => {
    if (existsSync(".env")) {
        const { config } = await import("dotenv");
        config();
    }

    const spinner = ora("Fetching tickets...").start();

    try {
        const { getAssignedTickets } = await import("@taskforge-ai/worker");
        const tickets = await getAssignedTickets(process.env.JIRA_USER_NAME as string);

        spinner.stop();

        if (!tickets?.length) {
            console.log(chalk.dim("No tickets assigned to agent."));
            return;
        }

        tickets.forEach(({ fields, key }: Ticket) => {
            const status = fields?.status?.name?.padEnd(10);
            const assignee = fields?.assignee?.displayName.padEnd(18);

            console.log(`${chalk.cyan(key?.padEnd(8))} ${chalk.yellow(status)} ${chalk.blue(assignee)} ${fields.summary}`);
        });
    } catch (e) {
        spinner.fail(chalk.red(`Failed: ${e instanceof Error ? e.message : String(e)}`));
        process.exit(1);
    }
};
