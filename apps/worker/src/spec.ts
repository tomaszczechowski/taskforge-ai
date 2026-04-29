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

import axios from "axios";
import { JiraIssue, TaskForgeConfigAgent, extractText, logger } from "@taskforge-ai/shared";
import { summarizeSpec } from "@taskforge-ai/agent-core";

const MCP = process.env.MCP_URL || "http://localhost:3001/tool";

/** Builds an ADF document listing the unanswered questions and the approval-keyword reminder. */
function buildQuestionsAdf(questions: string[], config: TaskForgeConfigAgent) {
    return {
        version: 1,
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "🤖 I need clarification before implementation:",
                        marks: [{ type: "strong" }],
                    },
                ],
            },
            {
                type: "orderedList",
                content: questions.map((q) => ({
                    type: "listItem",
                    content: [
                        {
                            type: "paragraph",
                            content: [{ type: "text", text: q }],
                        },
                    ],
                })),
            },
            { type: "rule" },
            {
                type: "paragraph",
                content: [
                    { type: "text", text: "Once clarified, please reply with " },
                    { type: "text", text: `"${config.comments.searchTextFor.approved}"`, marks: [{ type: "strong" }] },
                    { type: "text", text: " to proceed with the implementation." },
                ],
            },
        ],
    };
}

/** Converts Claude's plain-text summary into an ADF document with a bold header. */
function buildSummaryAdf(text: string) {
    // Split on blank lines to get paragraphs; keep the text as-is
    const paragraphs = text.split(/\n{2,}/).filter(Boolean);

    return {
        version: 1,
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: "🤖 Implementation Summary:",
                        marks: [{ type: "strong" }],
                    },
                ],
            },
            ...paragraphs.map((paragraph) => ({
                type: "paragraph",
                content: [
                    {
                        type: "text",
                        text: paragraph
                    }
                ],
            })),
        ],
    };
}

/**
 * Posts an ADF-formatted comment with clarification questions for the missing
 * spec areas, and reminds the human to reply with the approval keyword.
 *
 * @param issue   - Jira issue to comment on.
 * @param missing - List of question strings that have not been answered yet.
 * @param config  - Agent config supplying the approval keyword for the reminder.
 */
export async function askForSpec(issue: JiraIssue, missing: string[], config: TaskForgeConfigAgent) {
    const key = issue.key;
    logger.info(`[${key}] Asking for spec clarification...`);

    await axios.post(`${MCP}/jira.addComment`, {
        issueId: key,
        body: buildQuestionsAdf(missing, config),
    });
}

/**
 * Asks Claude to analyse the full spec + discussion thread, then posts the
 * resulting summary as an ADF comment. The summary ends with an explicit
 * approval/re-analyse prompt so the human knows how to proceed.
 *
 * @param issue - Jira issue whose description and comments form the spec.
 * @param config  - Agent config supplying information about LLM model
 */
export async function askClaudeForSummary(issue: JiraIssue, config: TaskForgeConfigAgent) {
    const key = issue.key;
    logger.info(`[${key}] Asking Claude to summarise spec...`);

    const commentsText = issue.fields.comment.comments
        .map((c, i) => `[${i + 1}] ${extractText(c.body)}`)
        .join("\n\n");

    const summaryText = await summarizeSpec({
        key,
        summary: issue.fields.summary,
        description: extractText(issue.fields.description),
        commentsText,
    }, config);

    await axios.post(`${MCP}/jira.addComment`, {
        issueId: key,
        body: buildSummaryAdf(summaryText),
    });
}
