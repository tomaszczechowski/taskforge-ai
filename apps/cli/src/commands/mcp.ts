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
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync, openSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { spawn } from "child_process";
import { createRequire } from "module";

type CommandMcpActions = "start" | "stop";

const SUPPORTED_ACTIONS: CommandMcpActions[] = ["start", "stop"];
const PID_DIR = join(homedir(), ".taskforge");
const PID_FILE = join(PID_DIR, "mcp.pid");
const LOG_FILE = join(PID_DIR, "mcp.log");

export interface CommandMcp {
    path: string;
    port: string;
}

function writePid(pid: number): void {
    mkdirSync(PID_DIR, { recursive: true });
    writeFileSync(PID_FILE, pid.toString(), "utf-8");
}

function readPid(): number | null {
    if (!existsSync(PID_FILE)) return null;

    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
}

function removePid(): void {
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
}

function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

export const mcp = async (action: CommandMcpActions, opts: CommandMcp) => {
    if (!SUPPORTED_ACTIONS.includes(action)) {
        console.error(chalk.red(`Unknown action: "${action}". Supported: ${SUPPORTED_ACTIONS.join(", ")}`));
        process.exit(1);
    }

    if (action === "stop") {
        const pid = readPid();

        if (!pid) {
            console.log(chalk.yellow("MCP server is not running (no PID file found)."));
            return;
        }

        if (!isRunning(pid)) {
            console.log(chalk.yellow(`MCP server (PID ${pid}) is no longer running — cleaning up.`));
            removePid();
            return;
        }

        process.kill(pid, "SIGTERM");

        removePid();

        console.log(chalk.green(`MCP server stopped (PID ${pid}).`));
        return;
    }

    const existingPid = readPid();

    if (existingPid && isRunning(existingPid)) {
        console.log(chalk.yellow(`MCP server is already running (PID ${existingPid}).`));
        return;
    }

    const { config: envFile } = await import("dotenv");
    envFile({ path: `${opts.path}/.env` });

    const port = parseInt(opts.port, 10);
    const spinner = ora(`Starting MCP server on port ${port}...`).start();

    const require = createRequire(import.meta.url);
    const mcpEntry = require.resolve("@taskforge-ai/mcp-server");

    mkdirSync(PID_DIR, { recursive: true });
    const logFd = openSync(LOG_FILE, "a");

    const child = spawn(process.execPath, [mcpEntry], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, PORT: String(port) },
    });

    child.on("error", (err) => {
        spinner.fail(chalk.red(`Failed to start: ${err.message}`));
        process.exit(1);
    });

    // give it a moment to fail fast (bad port, missing env, etc.)
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!child.pid || !isRunning(child.pid)) {
        spinner.fail(chalk.red(`MCP server failed to start — check logs: ${LOG_FILE}`));
        process.exit(1);
    }

    writePid(child.pid);
    child.unref(); // let CLI exit while server keeps running

    spinner.succeed(
        chalk.green(`MCP server running on :${port}`) +
        chalk.dim(` (PID ${child.pid})`)
    );

    console.log(chalk.dim(`Logs: ${LOG_FILE}`));
    console.log(chalk.dim(`Stop: taskforge mcp stop`));
};
