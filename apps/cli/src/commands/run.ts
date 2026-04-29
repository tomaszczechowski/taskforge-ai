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
import { readFileSync, existsSync } from "fs";

export interface CommandRun {
    config: string;
    path: string;
    debug: string;
    dryRun: boolean;
}

export const run = async (ticketId: string, opts: CommandRun) => {
    if (!existsSync(`${opts.path}/taskforge.config.json`) || !existsSync(`${opts.path}/.env`)) {
        console.error(chalk.red(`Config not found: ${opts.config}`));
        console.error(chalk.dim("Run: taskforge init"));
        process.exit(1);
    }

    const { config: envFile } = await import("dotenv");
    envFile({ path: `${opts.path}/.env` });

    const config = JSON.parse(readFileSync(`${opts.path}/taskforge.config.json`, "utf-8"));

    if (opts.debug) process.env.DEBUG_LEVEL = "DEBUG";

    const spinner = ora(`Fetching ${chalk.bold(ticketId)}...\n`).start();

    try {
        const { jira } = await import("@taskforge-ai/jira-client");
        const issue = await jira.getIssue(ticketId);
        spinner.succeed(`Found: ${chalk.bold(issue.fields.summary)}`);

        if (opts.dryRun) {
            const { generatePlan } = await import("@taskforge-ai/agent-core");
            const planSpinner = ora("Generating plan...").start();
            const plan = await generatePlan(issue, config);

            planSpinner.succeed("Plan generated");

            console.log(chalk.bold("\nSummary:"), plan.summary);
            console.log(chalk.bold("Approach:"), plan.approach);
            console.log(chalk.bold("Files:"), plan.files_to_modify.join(", "));
            console.log(chalk.bold("Steps:"));

            plan.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

            return;
        }

        const { processTicket } = await import("@taskforge-ai/worker");

        await processTicket(issue, config, 0);

        console.log(chalk.green(`\n✓ ${ticketId} processed`));
    } catch (e) {
        spinner.fail(chalk.red(`Failed: ${e instanceof Error ? e.message : String(e)}`));
        process.exit(1);
    }
};
