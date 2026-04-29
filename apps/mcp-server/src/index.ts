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

import express from "express";
import bodyParser from "body-parser";
import { github } from "@taskforge-ai/github-client";
import { jira } from "@taskforge-ai/jira-client";
import { logger } from "@taskforge-ai/shared";

const app = express();
app.use(bodyParser.json());

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

app.post("/tool/jira.getIssue", async (req, res) => {
    try {
        const { issueId } = req.body;
        const data = await jira.getIssue(issueId);

        res.json(data);
    } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
    }
});

app.post("/tool/jira.addComment", async (req, res) => {
    try {
        const { issueId, body } = req.body;
        await jira.addComment(issueId, body);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
    }
});

app.post("/tool/jira.transition", async (req, res) => {
    try {
        const { issueId, transition } = req.body;
        await jira.transition(issueId, transition);

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
    }
});

app.post("/tool/github.createBranch", async (req, res) => {
    try {
        const { repo, branchFrom, newBranch } = req.body;
        const result = await github.createBranch(repo, branchFrom, newBranch);

        res.json(result?.data ?? { ok: true });
    } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
    }
});

app.post("/tool/github.createPR", async (req, res) => {
    try {
        const { repo, title, body, head, base } = req.body;
        const pr = await github.createPR(repo, { title, body, head, base });

        res.json(pr.data);
    } catch (e) {
        res.status(500).json({ error: errorMessage(e) });
    }
});

export function startMcpServer(port = parseInt(process.env.PORT ?? "3001", 10)): void {
    app.listen(port, () => {
        logger.info(`[mcp] Server running on :${port}`);
    });
}

// ESM equivalent of `if (require.main === module)`
import { resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
if (resolve(process.argv[1]) === resolve(__filename)) {
    startMcpServer();
}
