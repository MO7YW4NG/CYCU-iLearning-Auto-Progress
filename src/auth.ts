import fs from "fs";
import path from "path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { AppConfig, Logger } from "./types";

/**
 * Find a Chromium-based browser executable on Windows.
 * Priority: Edge → Chrome → Brave
 */
function findEdgePath(): string {
  const roots = [
    process.env.PROGRAMFILES,
    process.env["PROGRAMFILES(X86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean) as string[];

  const browsers = [
    { name: "Edge",  suffix: "Microsoft\\Edge\\Application\\msedge.exe" },
    { name: "Chrome", suffix: "Google\\Chrome\\Application\\chrome.exe" },
    { name: "Brave",  suffix: "BraveSoftware\\Brave-Browser\\Application\\brave.exe" },
  ];

  for (const { suffix } of browsers) {
    for (const root of roots) {
      const candidate = path.join(root, suffix);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  throw new Error(
    "找不到可用的瀏覽器（Edge / Chrome / Brave）。請確認已安裝其中一種。"
  );
}

/**
 * Launch a browser and return an authenticated context.
 * Tries to restore a saved session first; falls back to fresh OAuth login.
 */
export async function launchAuthenticated(
  config: AppConfig,
  log: Logger
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const edgePath = findEdgePath();
  log.debug(`Using Edge: ${edgePath}`);

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: config.headless,
    slowMo: config.slowMo,
  });

  // Try restoring a saved session
  const restored = await tryRestoreSession(browser, config, log);
  if (restored) {
    const page = restored.pages()[0] ?? (await restored.newPage());
    return { browser, context: restored, page };
  }

  // Fresh login
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, config, log);
  await saveSession(context, config.authStatePath, log);
  return { browser, context, page };
}

/**
 * Attempt to restore a session from stored state.
 * Returns null if the stored state doesn't exist or the session is expired.
 */
async function tryRestoreSession(
  browser: Browser,
  config: AppConfig,
  log: Logger
): Promise<BrowserContext | null> {
  const statePath = path.resolve(config.authStatePath);
  if (!fs.existsSync(statePath)) {
    log.debug("No saved session found, will perform fresh login.");
    return null;
  }

  log.info("Restoring saved session...");
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();

  try {
    await page.goto(`${config.moodleBaseUrl}/my/`, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });

    // If we got redirected to a login page, the session is expired
    const url = page.url();
    if (url.includes("login") || url.includes("microsoftonline")) {
      log.warn("Saved session expired, will re-authenticate.");
      await context.close();
      return null;
    }

    log.success("Session restored successfully.");
    return context;
  } catch {
    log.warn("Failed to restore session, will re-authenticate.");
    await context.close();
    return null;
  }
}

/**
 * Perform the full Microsoft OAuth SSO login flow.
 */
async function login(page: Page, config: AppConfig, log: Logger): Promise<void> {
  log.info("Starting Microsoft OAuth login...");

  // Navigate to Moodle login page
  await page.goto(`${config.moodleBaseUrl}/login/index.php`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  log.debug("Reached Moodle login page.");

  // Click the "CYCU M365 Login" button (OAuth2 SSO)
  const m365Button = page.locator('a[href*="/auth/oauth2/login.php"]');
  await m365Button.waitFor({ timeout: 10000 });
  await m365Button.click();
  log.debug("Clicked M365 login button.");

  // Wait for Microsoft login page
  await page.waitForURL(/login\.microsoftonline\.com/, { timeout: 30000 });
  log.debug("Reached Microsoft login page.");

  // Enter email
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', config.username + (config.username.includes("@") ? "" : "@o365st.cycu.edu.tw"));
  await page.click('input[type="submit"]');
  log.debug("Email submitted.");

  // Wait for password field (may redirect through university IdP)
  await page.waitForSelector('input[type="password"]:visible', { timeout: 15000 });
  await page.fill('input[type="password"]', config.password);
  await page.click('input[type="submit"]');
  log.debug("Password submitted.");

  // Handle "Stay signed in?" prompt if it appears
  try {
    await page.waitForSelector("#idBtn_Back, #idSIButton9", { timeout: 5000 });
    // Click "Yes" to stay signed in (helps with session persistence)
    const yesButton = page.locator("#idSIButton9");
    if (await yesButton.isVisible()) {
      await yesButton.click();
      log.debug('Clicked "Yes" on Stay signed in prompt.');
    } else {
      await page.click("#idBtn_Back");
      log.debug('Clicked "No" on Stay signed in prompt.');
    }
  } catch {
    // No "Stay signed in?" prompt appeared — that's fine
    log.debug("No Stay signed in prompt detected.");
  }

  // Wait for redirect back to Moodle
  try {
    await page.waitForURL(new RegExp(config.moodleBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      timeout: 30000,
    });
  } catch {
    // Check if we're stuck on an MFA or error page
    const url = page.url();
    if (url.includes("microsoftonline")) {
      const bodyText = await page.textContent("body");
      if (bodyText?.includes("Verify your identity") || bodyText?.includes("More information required")) {
        throw new Error(
          "需要 MFA 驗證。請使用 --headed 模式手動完成驗證，session 會被儲存供日後使用。"
        );
      }
    }
    throw new Error(`登入後未重新導向回 Moodle。目前 URL: ${url}`);
  }

  log.success("Login successful!");
}

/**
 * Save the browser context state for session persistence.
 */
async function saveSession(
  context: BrowserContext,
  statePath: string,
  log: Logger
): Promise<void> {
  const resolved = path.resolve(statePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await context.storageState({ path: resolved });
  log.debug(`Session saved to ${resolved}`);
}
