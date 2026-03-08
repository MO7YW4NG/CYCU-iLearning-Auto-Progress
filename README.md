<h1><img src="assets/logo.svg" height="32" width="32"/> 中原大學 iLearning 影片自動完成工具 Auto Progress</h1>

## 介紹

自動完成中原大學 iLearning (Moodle) 平台上所有 SuperVideo 影片進度。

透過 Microsoft SSO 登入後，自動掃描所有進行中的課程，將未完成的影片標記為 100% 已觀看。

![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/MO7YW4NG/CYCU-iLearning-Auto-Progress/total)
## 快速使用（執行檔）

從 [Releases](../../releases) 下載最新的 `main.exe`，執行即可。

> 目標機器只需安裝 [Microsoft Edge](https://www.microsoft.com/edge)、[Google Chrome](https://www.google.com/chrome/) 或 [Brave](https://brave.com/) 其中一種，無需安裝其他環境。

**首次執行流程：**

1. 執行 `main.exe`
2. 輸入學號（例：`12345678`）
3. 輸入密碼
4. 瀏覽器視窗開啟，完成 Microsoft MFA 驗證
5. Session 自動儲存，之後執行無需再次登入

## 開發模式

1. 安裝 [Deno](https://deno.com/) 及 Edge / Chrome / Brave 其中一種

2. 安裝依賴

```bash
deno install
```

3. 複製 `.env.example` 為 `.env`，填入中原學號與密碼

```
CYCU_USERNAME=12345678
CYCU_PASSWORD=your_password
```

4. 首次使用請以視窗模式登入（以完成 MFA 驗證）

```bash
deno task login
```

5. 執行自動完成

```bash
deno task dev
```

## CLI 參數

| 參數 | 說明 |
|------|------|
| `--headed` | 顯示瀏覽器視窗（首次 MFA 驗證時需要） |
| `--login-only` | 僅執行登入並儲存 Session |
| `--dry-run` | 僅掃描影片，不送出進度 |
| `--course-url <url>` | 指定單一課程 URL |
| `--verbose` | 顯示 AJAX 請求/回應紀錄 |
| `--interactive` | 互動模式 |

## 打包為執行檔

需安裝 [Deno](https://deno.com/)，執行後產生單一 `.exe`（約 137MB），目標機器只需有 Edge 即可執行。

```bash
deno task compile
```

## 運作方式

1. 透過 Playwright 啟動 Edge，還原已儲存的 Session（或執行 Microsoft OAuth 登入）
2. 透過 `core_course_get_enrolled_courses_by_timeline_classification` 取得所有進行中課程
3. 透過 `core_courseformat_get_state` 取得各課程模組狀態，篩選未完成的 SuperVideo 活動
4. 造訪各活動頁面擷取 `view_id` 及影片長度
5. 送出單次 `mod_supervideo_progress_save` AJAX 請求，以 100% 進度及完整 `mapa` 陣列完成影片

Session 會儲存至 `.auth/storage-state.json`，後續執行可跳過登入流程。

## 版權

此專案之版權規範採用 **MIT License** - 至 [LICENSE](LICENSE) 查看更多相關聲明
