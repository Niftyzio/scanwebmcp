import { loadEnvFile } from "node:process";

const LOCAL_ENV_URL = new URL("../.env.local", import.meta.url);

/** Load the local operator environment without dynamically assigning properties. */
export function loadLocalEnv() {
  loadEnvFile(LOCAL_ENV_URL);
}
