import type { Logger } from "./types";

export function createLogger(verbose = false): Logger {
  return {
    info: (msg: string) => console.log(`[INFO]  ${msg}`),
    success: (msg: string) => console.log(`[OK]    ${msg}`),
    warn: (msg: string) => console.warn(`[WARN]  ${msg}`),
    error: (msg: string) => console.error(`[ERR]   ${msg}`),
    debug: (msg: string) => {
      if (verbose) console.log(`[DBG]   ${msg}`);
    },
  };
}
