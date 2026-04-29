#!/usr/bin/env node
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

import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { init } from "./commands/init.js";
import { CommandStart, start } from "./commands/start.js";
import { CommandRun, run } from "./commands/run.js";
import { list } from "./commands/list.js";
import { mcp, CommandMcp } from "./commands/mcp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
const program = new Command();

program.name("taskforge").description("AI agent that implements tickets automatically").version(pkg.version);

program
    .command("init")
    .description("Interactive setup — creates taskforge.config.json")
    .action(async () => await init());

program
    .command("start")
    .description("Start the polling agent worker")
    .option("--path <path>", "local path to repo with taskforge.config.json and .env files", "./")
    .option("--interval <seconds>", "poll interval in seconds", "30")
    .action(async (opts: CommandStart) => await start(opts));

program
    .command("run <ticketId>")
    .description("Process a single ticket immediately")
    .option("--dry-run", "generate plan only, no code changes")
    .option("--path <path>", "local path to repo with taskforge.config.json and .env files", "./")
    .option("--debug", "show more precise logs")
    .action(async (ticketId, opts: CommandRun) => await run(ticketId, opts));

program
    .command("list")
    .description("Show tickets currently assigned to the agent")
    .action(async () => await list());

program
    .command("mcp <action>")
    .description("Control the MCP server. Actions: start / stop")
    .option("--path <path>", "path containing .env file", "./")
    .option("--port <port>", "port to listen on", "3001")
    .action(async (action, opts: CommandMcp) => await mcp(action, opts));

if (process.argv.length <= 2) {
    program.help();
}

program.parse();
