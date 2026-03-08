import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "fs";
import path from "path";

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Read password from stdin with masking (shows * for each character).
 */
async function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(prompt);
    const chars: string[] = [];

    if (!stdin.isTTY) {
      // Fallback for non-TTY (pipe mode) — read line normally
      const rl = createInterface({ input: stdin, output: stdout });
      rl.question("").then((answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (key: string) => {
      if (key === "\r" || key === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(chars.join(""));
      } else if (key === "\u007F" || key === "\b") {
        // Backspace
        if (chars.length > 0) {
          chars.pop();
          stdout.write("\b \b");
        }
      } else if (key === "\u0003") {
        // Ctrl+C
        process.exit(0);
      } else if (key >= " ") {
        chars.push(key);
        stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

/**
 * Prompt user for credentials interactively.
 */
export async function promptCredentials(): Promise<Credentials> {
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log("\n===  CYCU iLearning 自動進度工具  ===\n");

    const username = await rl.question(
      "學號 (例: 11345678): "
    );
    rl.close(); // Close before raw mode password input

    const password = await readPassword("密碼: ");

    return {
      username: username.trim(),
      password,
    };
  } catch {
    rl.close();
    throw new Error("輸入被取消");
  }
}

/**
 * Ask user a yes/no question. Returns true for yes.
 */
export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${question} (Y/n): `);
    return answer.trim().toLowerCase() !== "n";
  } finally {
    rl.close();
  }
}

/**
 * Save credentials to .env file for future runs.
 */
export async function saveCredentials(
  creds: Credentials,
  envPath: string
): Promise<void> {
  const content = [
    `CYCU_USERNAME=${creds.username}`,
    `CYCU_PASSWORD=${creds.password}`,
    `MOODLE_BASE_URL=https://ilearning.cycu.edu.tw`,
    `HEADLESS=true`,
    `SLOW_MO=0`,
    `AUTH_STATE_PATH=.auth/storage-state.json`,
    "",
  ].join("\n");

  const dir = path.dirname(envPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(envPath, content, "utf8");
}

/**
 * Wait for user to press Enter before closing.
 */
export async function waitForExit(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question("\n按 Enter 關閉...");
  rl.close();
}
