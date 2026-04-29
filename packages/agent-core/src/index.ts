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

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { checkoutBranch, commitAndPush, cleanupBranch } from "./git.js";
import { extractText, logger, TaskForgeConfigAgent } from "@taskforge-ai/shared";

export * from "./git.js";

const client = new Anthropic();

const PLAN_SYSTEM_PROMPT = `
    You are an expert software engineer.
    Analyze the given Jira issue and produce a concise implementation plan.

    You will be given the repository file tree and package.json. Use them to identify
    the exact file paths that need to change. Reference existing files where relevant,
    and include new file paths in files_to_modify when the implementation requires creating them.

    Respond with a JSON object only — no markdown fences, no prose outside the JSON:
        {
        "summary": "one-sentence description of what will be implemented",
        "steps": ["step 1", "step 2", "step 3"],
        "files_to_modify": ["path/to/file.ts"],
        "approach": "brief description of the technical approach"
    }`;

const SPEC_DDL_SUMMARY_SYSTEM_PROMPT = `
    You are a senior software engineer reviewing a feature specification from Jira.
    Analyze the issue description and the discussion thread, then write a clear summary of what you understand needs to be implemented.
    Be concrete and specific.
    Don't use markdown syntax or any icons. Your response goes to JIRA comment.
    End your response with exactly this line on its own line: Please reply with APPROVED FOR AGENT to proceed, or add more details and end your reply with WAITING FOR AGENT INPUT to re-analyse.`;

const IMPL_SYSTEM_PROMPT = `
    You are an expert software engineer implementing a feature in an existing codebase.
    Use the available tools to read files, understand the code, and make the necessary changes. Focus only on the requirements, don't refactor the code if it's not requisited.
    Do not run git commands.
`;

/**
 * Wraps the base prompt and repo context into two ephemeral-cached text blocks
 * with a 1-hour TTL so repeated Claude calls reuse the same prefix.
 */
function buildCachedSystemBlocks(
    basePrompt: string,
    repoContext: string,
): Anthropic.TextBlockParam[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oneHour = { type: "ephemeral", ttl: "1h" } as any;
    return [
        { type: "text", text: basePrompt, cache_control: oneHour },
        { type: "text", text: repoContext, cache_control: oneHour },
    ];
}

export interface Plan {
    summary: string;
    steps: string[];
    files_to_modify: string[];
    approach: string;
}

interface ToolInput {
    command?: string;
    path?: string;
    content?: string;
}

const IMPL_TOOLS: Anthropic.Tool[] = [
    {
        name: "bash",
        description: "Run a shell command in the repository root. Avoid git commands.",
        input_schema: {
            type: "object" as const,
            properties: {
                command: { type: "string", description: "Shell command to execute" },
            },
            required: ["command"],
        },
    },
    {
        name: "read_file",
        description: "Read the full contents of a file.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path relative to repo root" },
            },
            required: ["path"],
        },
    },
    {
        name: "write_file",
        description: "Write (or overwrite) a file with the given content.",
        input_schema: {
            type: "object" as const,
            properties: {
                path: { type: "string", description: "Path relative to repo root" },
                content: { type: "string", description: "Full file content" },
            },
            required: ["path", "content"],
        },
    },
];

/**
 * Builds a string snapshot of the repo for use as cached LLM context.
 * Runs `git ls-files` and reads `package.json`; returns a fallback string on failure.
 */
function getRepoContext(repoPath: string): string {
    try {
        const files = execSync("git ls-files", {
            cwd: repoPath,
            encoding: "utf-8",
            timeout: 10_000,
        }).trim();

        const pkg = (() => {
            try {
                return readFileSync(join(repoPath, "package.json"), "utf-8");
            } catch {
                return null;
            }
        })();

        return [
            "=== Repository file tree (git ls-files) ===",
            files,
            pkg ? `\n=== package.json ===\n${pkg}` : "",
        ]
            .filter(Boolean)
            .join("\n");
    } catch {
        return "(could not read repository context)";
    }
}

/**
 * Calls Claude to produce a structured implementation plan for a Jira issue.
 * Uses the repo file tree and package.json as cached context.
 *
 * @param issue - Jira issue with key, summary, and description.
 * @param config - Agent config supplying information about LLM model
 * @returns Parsed {@link Plan} object with steps, files to modify, and approach.
 */
export async function generatePlan(issue: {
    key: string;
    fields: { summary: string; description: unknown };
}, config: TaskForgeConfigAgent): Promise<Plan> {
    const repoPath = process.env.LOCAL_REPO_PATH!;
    const repoContext = getRepoContext(repoPath);

    const stream = client.messages.stream({
        model: config.llmModel.implementation,
        max_tokens: 16000, // should go to config
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinking: { type: "adaptive" } as any,
        system: buildCachedSystemBlocks(PLAN_SYSTEM_PROMPT, repoContext),
        messages: [
            {
                role: "user",
                content: `Issue: ${issue.key}
                    Summary: ${issue.fields.summary}
                    Description: ${extractText(issue.fields.description) || "(no description)"}`,
            },
        ],
    });

    const message = await stream.finalMessage();
    const textBlock = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");

    if (!textBlock) throw new Error(`[${issue.key}] No text in plan response`);

    const raw = textBlock.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
    return JSON.parse(raw) as Plan;
}

/**
 * Asks Claude to summarise the full spec and discussion thread for a Jira issue.
 * The response ends with an explicit approval/re-analyse prompt for the human reviewer.
 *
 * @param params - Issue key, summary, description text, and concatenated comments.
 * @param config - Agent config supplying information about LLM model
 * @returns Plain-text summary written by Claude.
 */
export async function summarizeSpec(params: {
    key: string;
    summary: string;
    description: string;
    commentsText: string;
}, config: TaskForgeConfigAgent): Promise<string> {
    const response = await client.messages.create({
        model: config.llmModel.discussion,
        max_tokens: 4000, // should go to config
        system: [
            {
                type: "text",
                text: SPEC_DDL_SUMMARY_SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
            },
        ],
        messages: [
            {
                role: "user",
                content: `Jira issue: ${params.key}
                    Summary: ${params.summary}
                    Description: ${params.description || "(none)"}
                    Discussion thread: ${params.commentsText || "(no comments yet)"}`,
            },
        ],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

    if (!textBlock) throw new Error(`[${params.key}] No text in spec summary response`);

    return textBlock.text;
}

/**
 * Pre-loads the contents of every file listed in the plan so Claude sees them
 * in the initial prompt rather than spending turns discovering them.
 * Files that do not yet exist are noted as new.
 */
function readPlanFiles(plan: Plan, repoPath: string): string {
    const sections = plan.files_to_modify.map((filePath) => {
        try {
            const content = readFileSync(join(repoPath, filePath), "utf-8");
            return `=== ${filePath} ===\n${content}`;
        } catch {
            return `=== ${filePath} ===\n(new file — does not exist yet)`;
        }
    });
    return sections.join("\n\n");
}

/**
 * Dispatches a single agent tool call and returns its stdout or an error string.
 * Errors are caught and returned as strings so the agent can self-correct.
 *
 * @param name  - Tool name (`bash` | `read_file` | `write_file`).
 * @param input - Tool arguments supplied by the model.
 * @param cwd   - Working directory for `bash` and base path for file operations.
 */
function runTool(name: string, input: ToolInput, cwd: string): string {
    try {
        if (name === "bash" && input.command) {
            return execSync(input.command, {
                cwd,
                encoding: "utf-8",
                timeout: 60_000,
                stdio: ["pipe", "pipe", "pipe"],
            });
        }

        if (name === "read_file" && input.path) {
            return readFileSync(join(cwd, input.path), "utf-8");
        }

        if (name === "write_file" && input.path && input.content !== undefined) {
            const fullPath = join(cwd, input.path);
            mkdirSync(dirname(fullPath), { recursive: true });
            writeFileSync(fullPath, input.content, "utf-8");
            return `Written: ${input.path}`;
        }

        return `Unknown tool or missing input: ${name}`;
    } catch (e) {
        return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
}

/**
 * Runs the implementation agentic loop: checks out `branch`, feeds the plan to Claude,
 * executes tool calls (bash / read_file / write_file), then commits and pushes.
 * Cleans up the local branch after pushing.
 *
 * @param plan - Implementation plan produced by {@link generatePlan}.
 * @param branch - Git branch name to check out and commit to.
 * @param config - Agent config supplying information about LLM model
 * @returns `true` if changes were committed and pushed; `false` if nothing changed.
 */
export async function applyChanges(plan: Plan, branch: string, config: TaskForgeConfigAgent): Promise<boolean> {
    const repoPath = process.env.LOCAL_REPO_PATH!;

    checkoutBranch(branch);

    logger.info(`[agent] Running implementation agent in ${repoPath}...`);

    const repoContext = getRepoContext(repoPath);
    const fileContents = readPlanFiles(plan, repoPath);
    const cachedSystem = buildCachedSystemBlocks(IMPL_SYSTEM_PROMPT, repoContext);

    const messages: Anthropic.MessageParam[] = [
        {
            role: "user",
            content: `Implement the following feature in the repository at ${repoPath}.
                Summary: ${plan.summary}
                Approach: ${plan.approach}

                Steps:
                    ${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

                Current contents of relevant files (use write_file to apply changes, create new files if needed):
                    ${fileContents}`,
        },
    ];

    for (let turn = 0; turn < 40; turn++) {
        const response = await client.messages.create({
            model: config.llmModel.implementation,
            max_tokens: 8000,
            system: cachedSystem,
            tools: IMPL_TOOLS,
            messages,
        });

        messages.push({ role: "assistant", content: response.content });

        for (const block of response.content) {
            if (block.type === "text" && block.text) process.stdout.write(".");
        }

        if (response.stop_reason === "end_turn") break;

        const toolUses = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );

        if (toolUses.length === 0) break;

        const results: Anthropic.ToolResultBlockParam[] = toolUses.map((t) => ({
            type: "tool_result",
            tool_use_id: t.id,
            content: runTool(t.name, t.input as ToolInput, process.env.LOCAL_REPO_PATH!),
        }));

        messages.push({ role: "user", content: results });
    }

    logger.info("[agent] Done. Committing...");

    const committed = commitAndPush(branch, `feat(${branch}): ${plan.summary}`);

    if (!committed) logger.warn("[agent] No file changes were made.");

    cleanupBranch(branch);

    return committed;
}

/**
 * Runs `npm test` in the local repo and captures the output.
 *
 * @returns `{ success: true, output }` on zero exit, `{ success: false, output }` otherwise.
 */
export async function runTests(): Promise<{ success: boolean; output: string }> {
    try {
        const output = execSync("npm test 2>&1", {
            cwd: process.env.LOCAL_REPO_PATH,
            encoding: "utf-8",
            timeout: 120_000,
        });
        return { success: true, output };
    } catch (e) {
        return { success: false, output: e instanceof Error ? e.message : String(e) };
    }
}
