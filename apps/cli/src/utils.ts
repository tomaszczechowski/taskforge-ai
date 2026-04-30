import { TaskForgeConfig } from "@taskforge-ai/shared";
import { readFileSync } from "fs";

export const getConfig = (path: string): TaskForgeConfig => {
    return JSON.parse(readFileSync(`${path}/taskforge.config.json`, "utf-8"));
}