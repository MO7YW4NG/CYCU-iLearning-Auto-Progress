import fs from "fs";
import path from "path";
import type { AppConfig } from "./types";
import { promptCredentials, confirm, saveCredentials } from "./prompt";

/**
 * Load config from .env file (original behavior).
 */
export function loadConfig(): AppConfig {
  // Try loading .env from current directory
  const envPath = path.resolve(".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }

  const username = process.env.CYCU_USERNAME;
  const password = process.env.CYCU_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Missing CYCU_USERNAME or CYCU_PASSWORD in .env file. See .env.example."
    );
  }

  return buildConfig(username, password);
}

/**
 * Load config interactively: use .env if exists, otherwise prompt user.
 */
export async function loadConfigInteractive(
  baseDir: string
): Promise<AppConfig> {
  const envPath = path.resolve(baseDir, ".env");

  // Try loading from existing .env
  if (fs.existsSync(envPath)) {
    try {
      // Parse .env manually (no dotenv dependency needed in bundle)
      const envContent = fs.readFileSync(envPath, "utf8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }

      const username = process.env.CYCU_USERNAME;
      const password = process.env.CYCU_PASSWORD;

      if (username && password) {
        console.log(`[INFO]  已載入儲存的帳號: ${username}`);
        const useSaved = await confirm("使用此帳號？");
        if (useSaved) {
          return buildConfig(username, password);
        }
      }
    } catch {
      // .env parse failed — fall through to prompt
    }
  }

  // Interactive prompt
  const creds = await promptCredentials();

  if (!creds.username || !creds.password) {
    throw new Error("帳號或密碼不能為空");
  }

  // Offer to save
  const shouldSave = await confirm("是否儲存帳密供下次使用？");
  if (shouldSave) {
    await saveCredentials(creds, envPath);
    console.log(`[OK]    帳密已儲存至 ${envPath}`);
  }

  return buildConfig(creds.username, creds.password);
}

function buildConfig(
  username: string,
  password: string,
): AppConfig {
  const moodleBaseUrl = (
    process.env.MOODLE_BASE_URL ?? "https://ilearning.cycu.edu.tw"
  ).replace(/\/$/, "");

  return {
    username,
    password,
    courseUrl: "",
    moodleBaseUrl,
    headless: process.env.HEADLESS !== "false",
    slowMo: parseInt(process.env.SLOW_MO ?? "0", 10),
    authStatePath: process.env.AUTH_STATE_PATH ?? ".auth/storage-state.json",
  };
}
