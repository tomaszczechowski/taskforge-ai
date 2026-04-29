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
import type { AxiosError } from "axios";
import { logger } from "@taskforge-ai/shared";
export * from "./types.js";

if (!process.env.JIRA_URL) throw new Error("JIRA_URL is required");
if (!process.env.JIRA_EMAIL) throw new Error("JIRA_EMAIL is required");
if (!process.env.JIRA_TOKEN) throw new Error("JIRA_TOKEN is required");

const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`).toString("base64");

const client = axios.create({
    baseURL: process.env.JIRA_URL,
    headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
        "Content-Type": "application/json",
    },
});

// Log the full URL + error body on any failed request to ease debugging
client.interceptors.response.use(
    (r) => r,
    (err: AxiosError<any>) => {
        const url = (err.config?.baseURL ?? "") + (err.config?.url ?? "");


        if (process.env.DEBUG_LEVEL === "DEBUG") {
            logger.error(`[jira] ${err.response?.status ?? "network"} ${url}`);

            if (err.response?.data) {
                logger.error(`[jira] response body: ${JSON.stringify(err.response.data, null, 2)}`);
            }
        }

        return Promise.reject(err);
    }
);

export const jira = {
    /** Fetches a single Jira issue with all fields. */
    async getIssue(id: string) {
        return client.get(`/issue/${id}`).then((r) => r.data);
    },

    /** Adds an ADF comment to a Jira issue. */
    async addComment(id: string, body: object) {
        return client.post(`/issue/${id}/comment`, { body });
    },

    /**
     * Moves a Jira issue to the named workflow status.
     * Resolves the transition name to a numeric ID at runtime because Jira's
     * REST API requires an ID, not a name, in the transition payload.
     *
     * @throws If the named transition is not available for the current issue state.
     */
    async transition(id: string, transitionName: string) {
        const { data } = await client.get(`/issue/${id}/transitions`);
        const match = (data.transitions as { id: string; name: string }[]).find(
            (t) => t.name.toUpperCase().replace(/\s+/g, "_") === transitionName.toUpperCase().replace(/\s+/g, "_")
        );

        if (!match) {
            const available = (data.transitions as { name: string }[]).map((t) => t.name).join(", ");
            throw new Error(`Transition "${transitionName}" not found. Available: ${available}`);
        }

        return client.post(`/issue/${id}/transitions`, { transition: { id: match.id } });
    },

    /** Returns up to 20 open issues assigned to `assignee`, ordered by last updated. */
    async getAssignedTickets(assignee: string) {
        const jql = `assignee = "${assignee}" ORDER BY updated DESC`;
        const res = await client.get("/search/jql", {
            params: {
                jql,
                maxResults: 20,
                fields: "summary,description,status,comment,assignee,updated",
            },
        });

        return res.data.issues;
    },
};
