import type { Page } from "playwright-core";
import type { AjaxResponse, Logger, SessionInfo, VideoActivity } from "./types";

/**
 * Complete a video by sending a single 100% progress call with full mapa.
 */
export async function completeVideo(
  page: Page,
  session: SessionInfo,
  video: VideoActivity,
  log: Logger
): Promise<boolean> {
  const { viewId, duration } = video;
  const mapa = new Array(duration).fill(1);

  const url = `${session.moodleBaseUrl}/lib/ajax/service.php?sesskey=${session.sesskey}`;
  const payload = [
    {
      index: 0,
      methodname: "mod_supervideo_progress_save",
      args: {
        view_id: viewId,
        currenttime: duration,
        duration,
        percent: 100,
        mapa: JSON.stringify(mapa),
      },
    },
  ];

  log.debug(`  Sending 100% progress: viewId=${viewId}, duration=${duration}s`);

  const result: AjaxResponse[] = await page.evaluate(
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

  const response = result?.[0] ?? { error: true };

  if (response.error) {
    const errMsg = response.exception?.message ?? "Unknown error";
    const errCode = response.exception?.errorcode ?? "unknown";
    log.error(`  AJAX error: [${errCode}] ${errMsg}`);
    return false;
  }

  return true;
}
