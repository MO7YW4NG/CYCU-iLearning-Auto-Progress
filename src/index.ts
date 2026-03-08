import { Command } from "commander";
import path from "path";
import { loadConfig, loadConfigInteractive } from "./config";
import { launchAuthenticated } from "./auth";
import { extractSessionInfo } from "./session";
import {
  getEnrolledCourses,
  getSupervideosInCourse,
  getVideoMetadata,
} from "./course";
import { completeVideo } from "./progress";
import { createLogger } from "./logger";
import { waitForExit } from "./prompt";

const program = new Command();

program
  .name("ilearning-auto")
  .description("Automate video progress on CYCU iLearning")
  .option("--course-url <url>", "Process a single course URL")
  .option("--login-only", "Only perform login and save session")
  .option("--dry-run", "Discover activities but do not send progress")
  .option("--headed", "Run browser in headed mode (visible)")
  .option("--verbose", "Enable debug logging")
  .option("--interactive", "Interactive mode (prompt for credentials)")
  .parse();

const opts = program.opts();

// Evaluated once at startup before any credentials are loaded into env.
// Re-evaluating after interactive login would give wrong result.
const IS_INTERACTIVE: boolean =
  opts.interactive ||
  (!opts.courseUrl && !opts.loginOnly && !opts.dryRun && !opts.verbose &&
    (!process.env.CYCU_USERNAME || !process.env.CYCU_PASSWORD));

async function main(): Promise<void> {
  const isInteractive = IS_INTERACTIVE;

  // Load config: interactive prompts or .env
  let config;
  if (isInteractive) {
    const baseDir = path.dirname(Deno.execPath());
    config = await loadConfigInteractive(baseDir);
    // Interactive mode defaults to headed for MFA support
    if (!opts.headed && config.headless) {
      config.headless = false;
    }
  } else {
    config = loadConfig();
  }

  const log = createLogger(opts.verbose);

  if (opts.headed) config.headless = false;
  if (opts.courseUrl) config.courseUrl = opts.courseUrl;

  log.info("啟動瀏覽器...");
  const { browser, context, page } = await launchAuthenticated(config, log);

  try {
    if (opts.loginOnly) {
      log.success("登入完成，已儲存 session。");
      return;
    }

    const session = await extractSessionInfo(page, config, log);

    // Set up verbose network logging
    if (opts.verbose) {
      page.on("request", (req: any) => {
        if (req.url().includes("service.php")) {
          log.debug(`>> ${req.method()} ${req.url()}`);
          const body = req.postData();
          if (body) log.debug(`   Body: ${body}`);
        }
      });
      page.on("response", (res: any) => {
        if (res.url().includes("service.php")) {
          res
            .text()
            .then((body: string) => log.debug(`<< ${res.status()} ${body}`))
            .catch(() => {});
        }
      });
    }

    // Build course list
    let courses: { id: number; name: string }[];

    if (config.courseUrl) {
      const match = config.courseUrl.match(/[?&]id=(\d+)/);
      if (!match) {
        log.error("無法從 URL 取得課程 ID。");
        process.exitCode = 1;
        return;
      }
      courses = [{ id: parseInt(match[1], 10), name: config.courseUrl }];
    } else {
      const enrolled = await getEnrolledCourses(page, session, log);
      courses = enrolled.map((c) => ({ id: c.id, name: c.fullname }));
    }

    let totalCompleted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const course of courses) {
      log.info(`\n========================================`);
      log.info(`課程: ${course.name}`);
      log.info(`========================================`);

      const videos = await getSupervideosInCourse(
        page,
        session,
        course.id,
        log
      );

      if (videos.length === 0) {
        log.info("  所有影片已完成（或無影片）。");
        totalSkipped++;
        continue;
      }

      for (const sv of videos) {
        log.info(`  處理中: ${sv.name}`);

        try {
          const video = await getVideoMetadata(page, sv.url, log);

          if (opts.dryRun) {
            log.info(
              `    [試執行] viewId=${video.viewId}, duration=${video.duration}s`
            );
            continue;
          }

          const success = await completeVideo(page, session, video, log);
          if (success) {
            log.success(`    已完成！`);
            totalCompleted++;
          } else {
            log.error(`    失敗。`);
            totalFailed++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(`    錯誤: ${msg}`);
          totalFailed++;
        }
      }
    }

    // Summary
    log.info("\n===== 執行結果 =====");
    log.info(`掃描課程數: ${courses.length}`);
    log.info(`完成影片數: ${totalCompleted}`);
    log.info(`已完成/跳過: ${totalSkipped}`);
    if (totalFailed > 0) log.warn(`失敗影片數: ${totalFailed}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main()
  .catch((err) => {
    console.error(`\n[錯誤] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await waitForExit();
  });
