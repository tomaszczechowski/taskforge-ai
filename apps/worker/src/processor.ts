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

import { JiraIssue, JiraComment, extractText, logger, TaskForgeConfig, TaskForgeConfigAgentSpecAreas, TaskForgeConfigAgent } from "@taskforge-ai/shared";
import { askForSpec, askClaudeForSummary } from "./spec.js";
import { implement } from "./implement.js";
import { initRepo, syncRepo } from "@taskforge-ai/agent-core";

/** Returns `true` if the comment body contains the configured agent marker (e.g. 🤖). */
function isAgentComment(c: JiraComment, config: TaskForgeConfig): boolean {
    return extractText(c.body).includes(config.agents.agentMarker);
}

/** Returns `true` if the comment body contains the "waiting for agent input" keyword. */
function isWaitingForAgentComment(c: JiraComment, config: TaskForgeConfigAgent): boolean {
    const body = extractText(c.body);

    if (typeof body === "string") {
        return body.indexOf(config.comments.searchTextFor.waitingForAgentInput) !== -1;
    }

    return (body as any).includes(config.comments.searchTextFor.waitingForAgentInput);
}

/** Returns `true` when the agent posted the last comment and no human has replied since. */
function isWaitingForUserResponse(comments: JiraComment[], config: TaskForgeConfig): boolean {
    let lastAgentIdx = -1;

    for (let i = comments.length - 1; i >= 0; i--) {
        if (isAgentComment(comments[i], config)) {
            lastAgentIdx = i;
            break;
        }
    }

    if (lastAgentIdx === -1) return false;

    const hasUserReply = comments.slice(lastAgentIdx + 1).some((c) => !isAgentComment(c, config));

    return !hasUserReply;
}

/** Returns `true` when a "waiting for agent input" comment exists with no agent reply on top of it. */
function isWaitingForAgentResponse(comments: JiraComment[], config: TaskForgeConfigAgent): boolean {
    let lastWaitingForAgentIdx = -1;

    for (let i = comments.length - 1; i >= 0; i--) {
        if (isWaitingForAgentComment(comments[i], config)) {
            lastWaitingForAgentIdx = i;
            break;
        }
    }

    const commentsSliced = comments.length > 1 ? comments.slice(lastWaitingForAgentIdx + 1) : comments;
    // no comments on top of it so the agent needs to repond.
    const hasUserRequestedAgentReply = commentsSliced.some((c) => !isWaitingForAgentComment(c, config));

    return !hasUserRequestedAgentReply;
}

/**
 * Scans the issue description and all comments for configured spec-area keywords.
 * @returns The question strings for areas whose keyword is not yet mentioned.
 */
function getMissingSpecAreas(issue: JiraIssue, agentSpecAreas: TaskForgeConfigAgentSpecAreas): string[] {
    const allText = [extractText(issue.fields.description), ...issue.fields.comment.comments.map((c) => extractText(c.body))]
        .join(" ")
        .toLowerCase();

    return Object.entries(agentSpecAreas)
        .filter(([keyword]) => !allText.includes(keyword))
        .map(([, question]) => question);
}

/**
 * FSM-style ticket processor. Runs one cycle for a single Jira issue:
 *
 * 1. Skips if already waiting for a human reply.
 * 2. Starts implementation if the last comment contains the approval string.
 * 3. Posts spec-clarification questions if required spec areas are missing.
 * 4. Posts a Claude-generated spec summary when all areas are covered and
 *    the human has requested agent input.
 *
 * @param ticket     - Jira issue to process.
 * @param config     - Loaded `taskforge.config.json`.
 * @param agentIndex - Index into `config.agents.list` selecting the active agent.
 */
export async function processTicket(ticket: JiraIssue, config: TaskForgeConfig, agentIndex: number) {
    const agentConfig = config.agents.list[agentIndex];
    const comments = ticket.fields.comment.comments;
    const key = ticket.key;

    // 1. If we're waiting for the user to respond — do nothing this cycle
    if (isWaitingForUserResponse(comments, config)) {
        logger.info(`[${key}] Waiting for user response — skipping`);
        return;
    }

    // 2. "APPROVED FOR AGENT" in the last comment - start implementation
    const lastComment = comments[comments?.length - 1];
    const body = extractText(lastComment?.body) ?? "";
    const searchForApprovedString = agentConfig.comments.searchTextFor.approved.toLowerCase();
    const approved =
        !!lastComment &&
        (body.toLowerCase().includes(searchForApprovedString) || body.toLowerCase().indexOf(searchForApprovedString) !== -1);

    if (approved) {
        logger.info(`[${key}] Specification is Approved — starting implementation`);

        // Clone the repository on first run (no-op if already present)
        const LOCAL_REPO_PATH = process.env.LOCAL_REPO_PATH;
        const GITHUB_REPO_URL = process.env.GITHUB_REPO_URL;

        if (LOCAL_REPO_PATH && GITHUB_REPO_URL) {
            initRepo(LOCAL_REPO_PATH, GITHUB_REPO_URL);
        } else {
            throw new Error("LOCAL_REPO_PATH and GITHUB_REPO_URL is required");
        }

        // Keep the local checkout fresh before processing tickets
        syncRepo(LOCAL_REPO_PATH);

        await implement(ticket, agentConfig);

        return;
    }

    if (isWaitingForAgentResponse(comments, agentConfig)) {
        // 3. Agent input
        const missing = getMissingSpecAreas(ticket, agentConfig.specAreas);

        if (missing.length > 0) {
            logger.info(`[${key}] Missing spec areas: ${missing.join(", ")}`);
            await askForSpec(ticket, missing, agentConfig);
        } else {
            logger.info(`[${key}] Spec complete — asking Claude for summary`);
            await askClaudeForSummary(ticket, agentConfig);
        }
    } else {
        logger.info(`[${key}] No action for processing.`);
    }

    return;
}
