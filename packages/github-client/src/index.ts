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

if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required");

const client = axios.create({
    baseURL: "https://api.github.com",
    headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    },
});

interface GithubErrorData {
    message?: string;
}

client.interceptors.response.use(
    (r) => r,
    (err: AxiosError<GithubErrorData>) => {
        const url = (err.config?.baseURL ?? "") + (err.config?.url ?? "");
        const message = err.response?.data?.message ?? err.message;

        logger.error(`[github] ${err.response?.status ?? "network"} ${url} — ${message}`);

        return Promise.reject(err);
    }
);

export interface CreatePRParams {
    title: string;
    head: string;
    base: string;
    body?: string;
}

/** Splits an `owner/repo` string into its constituent parts. */
function parseRepo(repo: string): { owner: string; repoName: string } {
    const [owner, repoName] = repo.split("/");
    return { owner, repoName };
}

export const github = {
    /**
     * Creates `newBranch` off `base` in the given repo. Idempotent — silently
     * skips creation if the branch already exists.
     *
     * @param repo      - Repository in `owner/repo` format.
     * @param base      - Branch or ref to branch from.
     * @param newBranch - Name of the branch to create.
     */
    async createBranch(repo: string, base: string, newBranch: string) {
        const { owner, repoName } = parseRepo(repo);
        logger.info(`[github] createBranch ${repo}: ${base} → ${newBranch}`);

        // If the branch already exists, skip creation silently
        try {
            await client.get(`/repos/${owner}/${repoName}/git/ref/heads/${newBranch}`);
            logger.info(`[github] branch ${newBranch} already exists — skipping`);
            return;
        } catch (err) {
            if (!axios.isAxiosError(err) || err.response?.status !== 404) throw err;
        }

        const { data: refData } = await client.get(
            `/repos/${owner}/${repoName}/git/ref/heads/${base}`
        );

        return client.post(`/repos/${owner}/${repoName}/git/refs`, {
            ref: `refs/heads/${newBranch}`,
            sha: refData.object.sha,
        });
    },

    /**
     * Opens a pull request. Idempotent — if a 422 is returned (PR already exists),
     * fetches and returns the existing open PR instead of throwing.
     *
     * @param repo - Repository in `owner/repo` format.
     * @param pr   - PR parameters (title, head, base, optional body).
     */
    async createPR(repo: string, pr: CreatePRParams) {
        const { owner, repoName } = parseRepo(repo);
        logger.info(`[github] createPR ${repo}: ${pr.head} → ${pr.base}`);

        try {
            return await client.post(`/repos/${owner}/${repoName}/pulls`, pr);
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 422) {
                const { data } = await client.get(`/repos/${owner}/${repoName}/pulls`, {
                    params: { head: `${owner}:${pr.head}`, state: "open" },
                });

                if (data.length > 0) {
                    logger.info(`[github] PR already exists: ${data[0].html_url}`);
                    return { data: data[0] };
                }
            }
            throw err;
        }
    },
};
