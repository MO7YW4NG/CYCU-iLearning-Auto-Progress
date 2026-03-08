import type { Page } from "playwright-core";

export interface AppConfig {
  username: string;
  password: string;
  courseUrl: string;
  moodleBaseUrl: string;
  headless: boolean;
  slowMo: number;
  authStatePath: string;
}

export interface SessionInfo {
  sesskey: string;
  moodleBaseUrl: string;
}

export interface VideoActivity {
  name: string;
  url: string;
  viewId: number;
  duration: number;
  existingPercent: number;
}

export interface ProgressPayload {
  view_id: number;
  currenttime: number;
  duration: number;
  percent: number;
  mapa: string;
}

export interface AjaxResponse {
  error: boolean;
  data?: { success?: boolean; exec?: string };
  exception?: { message: string; errorcode: string };
}

export interface Logger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
}
