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
import { generatePlan, applyChanges, runTests } from "@taskforge-ai/agent-core";
import { JiraIssue, JiraTransition, logger, TaskForgeConfigAgent, toAdf, toAdfWithCode } from "@taskforge-ai/shared";

const MCP = process.env.MCP_URL || "http://localhost:3001/tool";

/**
 * Runs the full implementation pipeline for an approved Jira issue:
 * transitions to In Progress → creates GitHub branch → generates plan →
 * applies code changes → creates PR → transitions to In Review.
 *
 * No-ops if the agent made no file changes (nothing to commit).
 *
 * @param issue  - The approved Jira issue to implement.
 * @param config - Agent config supplying information about LLM model
 */
export async function implement(issue: JiraIssue, config: TaskForgeConfigAgent) {
    const key = issue.key;
    const branchName = `feature/${key.toLowerCase()}`;

    logger.info(`[${key}] Starting implementation flow...`);

    await axios.post(`${MCP}/jira.transition`, {
        issueId: key,
        transition: JiraTransition.InProgress,
    });

    await axios.post(`${MCP}/github.createBranch`, {
        repo: process.env.GITHUB_REPO,
        branchFrom: process.env.GITHUB_REPO_MAIN_BRANCH,
        newBranch: branchName,
    });

    const plan = await generatePlan(issue, config);
    logger.info(`[${key}] Plan created`);

    const committed = await applyChanges(plan, branchName, config);
    logger.info(`[${key}] Code applied`);

    if (!committed) {
        logger.warn(`[${key}] Agent made no changes — skipping PR creation`);
        return;
    }

    // to be implemented ....
    // const testResult = await runTests();

    // if (!testResult.success) {
    //     await axios.post(`${MCP}/jira.addComment`, {
    //         issueId: key,
    //         body: toAdfWithCode("❌ Tests failed:", testResult.output),
    //     });
    //     throw new Error("Tests failed");
    // }

    const pr = await axios.post(`${MCP}/github.createPR`, {
        repo: process.env.GITHUB_REPO,
        title: `[${key}] ${issue.fields.summary}`,
        body: `## Summary\n${issue.fields.summary}\n\n## Implementation\n${plan.summary}\n\n## Fixes: ${key}`,
        head: branchName,
        base: process.env.GITHUB_REPO_MAIN_BRANCH || "main",
    });

    logger.info(`[${key}] PR created:`, pr.data.html_url);

    await Promise.all([
        axios.post(`${MCP}/jira.addComment`, {
            issueId: key,
            body: toAdf(`🚀 PR created: ${pr.data.html_url}`),
        }),
        axios.post(`${MCP}/jira.transition`, {
            issueId: key,
            transition: JiraTransition.Review,
        }),
    ]);

    logger.info(`[${key}] Moved to REVIEW`);
}
