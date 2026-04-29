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

import { execSync } from "child_process";
import { existsSync } from "fs";
import { logger } from "@taskforge-ai/shared";

/** Thin wrapper around `execSync` that inherits stdio, streaming output to the terminal. */
function exec(cmd: string, cwd?: string) {
    execSync(cmd, { cwd, stdio: "inherit" });
}

/** Returns the local repository path from the `LOCAL_REPO_PATH` environment variable. */
function repoPath(): string {
    return process.env.LOCAL_REPO_PATH!;
}

/**
 * Clones the repo into `LOCAL_REPO_PATH` if it does not exist yet; fetches all remotes
 * and prunes stale tracking branches if the directory is already present.
 *
 * @param localPath - Unused at runtime (reads `LOCAL_REPO_PATH` env var); kept for call-site clarity.
 * @param repoUrl   - HTTPS URL of the remote repository. `GITHUB_TOKEN` is injected when present.
 */
export function initRepo(localPath: string, repoUrl: string): void {
    const cwd = repoPath();

    if (existsSync(cwd)) {
        logger.info(`[git] Repo exists at ${cwd}, fetching...`);
        exec("git fetch --all --prune", cwd);
        return;
    }

    const token = process.env.GITHUB_TOKEN;
    const authenticatedUrl = token ? repoUrl.replace("https://", `https://${token}@`) : repoUrl;

    logger.info(`[git] Cloning into ${cwd}...`);
    exec(`git clone "${authenticatedUrl}" "${cwd}"`);
}

/**
 * Fetches all remotes and prunes stale tracking branches in the given directory.
 *
 * @param localPath - Absolute path to the local repository.
 */
export function syncRepo(localPath: string): void {
    exec("git fetch --all --prune", localPath);
}

/**
 * Checks out `branch` from `baseBranch`. Creates the branch if it does not exist;
 * if it already exists, merges the latest `baseBranch` into it.
 * Stashes any uncommitted changes before switching.
 *
 * @param branch     - Target branch name.
 * @param baseBranch - Branch to base off / merge from (default: `"main"`).
 */
export function checkoutBranch(branch: string, baseBranch = "main"): void {
    const cwd = repoPath();
    exec("git stash --include-untracked", cwd);
    exec(`git checkout ${baseBranch}`, cwd);
    exec(`git pull --ff-only origin ${baseBranch}`, cwd);

    try {
        exec(`git checkout -b ${branch}`, cwd);
    } catch {
        // branch already exists — check it out and merge latest base into it
        exec(`git checkout ${branch}`, cwd);
        exec(`git merge ${baseBranch} --no-edit`, cwd);
        logger.info(`[git] Merged ${baseBranch} into existing branch ${branch}`);
    }
}

/**
 * Stages all changes (`git add -A`), commits, and pushes to origin.
 * Returns `false` without committing if the working tree is clean.
 *
 * @param branch  - Remote branch to push to.
 * @param message - Commit message.
 * @returns `true` if a commit was created and pushed; `false` if nothing to commit.
 */
export function commitAndPush(branch: string, message: string): boolean {
    const cwd = repoPath();
    exec("git add -A", cwd);

    try {
        execSync("git diff --cached --quiet", { cwd });
        logger.info("[git] Nothing to commit, skipping.");
        return false;
    } catch {
        // non-zero exit = there are staged changes, proceed
    }

    exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, cwd);
    exec(`git push -u origin ${branch}`, cwd);
    return true;
}

/**
 * Switches back to `baseBranch` and force-deletes the local `branch`.
 * Called after a successful push to keep the local checkout tidy.
 *
 * @param branch     - Branch to delete.
 * @param baseBranch - Branch to check out before deletion (default: `"main"`).
 */
export function cleanupBranch(branch: string, baseBranch = "main"): void {
    const cwd = repoPath();
    exec(`git checkout ${baseBranch}`, cwd);
    exec(`git branch -D ${branch}`, cwd);
    logger.info(`[git] Deleted local branch ${branch}`);
}
