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

export interface CommandStart {
    path: string;
}

export const start = async (opts: CommandStart) => {
    if (!existsSync(`${opts.path}/taskforge.config.json`) || !existsSync(`${opts.path}/.env`)) {
        console.error(chalk.red(`Config not found in path: ${opts.path}`));
        console.error(chalk.dim("Run: taskforge init or use flag --path"));
        process.exit(1);
    }

    const spinner = ora("Starting agent...").start();

    const { config: envFile } = await import("dotenv");
    envFile({ path: `${opts.path}/.env` });

    const config = JSON.parse(readFileSync(`${opts.path}/taskforge.config.json`, "utf-8"));

    spinner.succeed(chalk.green("Agent started — polling for tickets"));

    const { default: startWorker } = await import("@taskforge-ai/worker");

    await startWorker(config, 0);
};
