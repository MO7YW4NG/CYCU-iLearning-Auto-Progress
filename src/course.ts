import type { Page } from "playwright-core";
import type { Logger, SessionInfo, VideoActivity } from "./types";

export interface EnrolledCourse {
  id: number;
  fullname: string;
  shortname: string;
}

export interface SuperVideoModule {
  cmid: string;
  name: string;
  url: string;
  isComplete: boolean;
}

/**
 * Send a Moodle AJAX request and return the result.
 */
async function moodleAjax(
  page: Page,
  session: SessionInfo,
  methodname: string,
  args: Record<string, unknown>
): Promise<any> {
  const url = `${session.moodleBaseUrl}/lib/ajax/service.php?sesskey=${session.sesskey}&info=${methodname}`;
  const payload = [{ index: 0, methodname, args }];

  const result = await page.evaluate(
    async ({ url, payload }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    { url, payload }
  );

  if (result?.[0]?.error) {
    throw new Error(
      `AJAX ${methodname} failed: ${result[0].exception?.message ?? "Unknown error"}`
    );
  }

  return result[0].data;
}

/**
 * Fetch all in-progress enrolled courses via Moodle AJAX API.
 */
export async function getEnrolledCourses(
  page: Page,
  session: SessionInfo,
  log: Logger
): Promise<EnrolledCourse[]> {
  log.info("Fetching enrolled courses...");

  const data = await moodleAjax(
    page,
    session,
    "core_course_get_enrolled_courses_by_timeline_classification",
    {
      offset: 0,
      limit: 0,
      classification: "inprogress",
      sort: "fullname",
      customfieldname: "",
      customfieldvalue: "",
      requiredfields: [
        "id",
        "fullname",
        "shortname",
        "showcoursecategory",
        "showshortname",
        "visible",
        "enddate",
      ],
    }
  );

  const courses: EnrolledCourse[] = (data?.courses ?? []).map((c: any) => ({
    id: c.id,
    fullname: c.fullname,
    shortname: c.shortname,
  }));

  log.info(
    `Found ${courses.length} in-progress course${courses.length === 1 ? "" : "s"}.`
  );
  return courses;
}

/**
 * Get all SuperVideo modules in a course via core_courseformat_get_state.
 * Returns only incomplete ones (isoverallcomplete !== true).
 */
export async function getSupervideosInCourse(
  page: Page,
  session: SessionInfo,
  courseId: number,
  log: Logger
): Promise<SuperVideoModule[]> {
  const data = await moodleAjax(page, session, "core_courseformat_get_state", {
    courseid: courseId,
  });

  // data is a JSON string
  const state = typeof data === "string" ? JSON.parse(data) : data;
  const cms: any[] = state?.cm ?? [];

  const allSupervideos = cms.filter((cm: any) => cm.module === "supervideo");
  const incomplete = allSupervideos.filter(
    (cm: any) => "isoverallcomplete" in cm && !cm.isoverallcomplete
  );

  log.info(
    `  SuperVideo: ${allSupervideos.length} total, ${incomplete.length} incomplete`
  );

  return incomplete.map((cm: any) => ({
    cmid: cm.id,
    name: cm.name,
    url: cm.url,
    isComplete: !!cm.isoverallcomplete,
  }));
}

/**
 * Visit a SuperVideo activity page and extract view_id + duration.
 */
export async function getVideoMetadata(
  page: Page,
  activityUrl: string,
  log: Logger
): Promise<VideoActivity> {
  await page.goto(activityUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

  const name = await page.title();
  const pageSource = await page.content();

  // Extract view_id: amd.resource_*(view_id, ...) from player_create module
  let viewId: number | null = null;
  const viewIdPatterns = [
    /player_create.*?amd\.\w+\((\d+)/, // matches any player_create method
    /view_id['":\s]+(\d+)/,
  ];
  for (const pattern of viewIdPatterns) {
    const match = pageSource.match(pattern);
    if (match) {
      viewId = parseInt(match[1], 10);
      break;
    }
  }

  if (viewId === null) {
    throw new Error(`Could not extract view_id from ${activityUrl}`);
  }

  // Extract duration — try native video element, then page source, then default
  let duration: number | null = null;
  const isYoutube = pageSource.includes("youtube.com") || pageSource.includes("youtu.be");

  if (!isYoutube) {
    try {
      await page.waitForSelector("video", { timeout: 10000 });
      duration = await page.evaluate(() => {
        return new Promise<number | null>((resolve) => {
          const media = document.querySelector("video") as HTMLMediaElement | null;
          if (!media) return resolve(null);
          if (media.duration && isFinite(media.duration)) {
            return resolve(Math.ceil(media.duration));
          }
          media.addEventListener("loadedmetadata", () => {
            resolve(Math.ceil(media.duration));
          });
          setTimeout(() => resolve(null), 8000);
        });
      });
    } catch {
      // no video element
    }
  }

  if (!duration) {
    const durationMatch = pageSource.match(/["']?duration["']?\s*[:=]\s*(\d+)/);
    if (durationMatch) {
      duration = parseInt(durationMatch[1], 10);
    }
  }

  // Default: 600s. For YouTube embeds this is expected since we can't access iframe duration.
  if (!duration) {
    duration = 600;
    log.debug(`    Duration unknown${isYoutube ? " (YouTube)" : ""}, using ${duration}s`);
  }

  log.debug(`    viewId=${viewId}, duration=${duration}s`);

  return {
    name,
    url: activityUrl,
    viewId,
    duration,
    existingPercent: 0,
  };
}
