# Video Talkcraft｜從 MP3 + words.json 開工

這份工作區安裝保留 [Video Talkcraft](https://github.com/Vincentwei1021/video-talkcraft) 的 Remotion、語義標註、卡片選型、SHOTBOOK、工作台與 QA。自訂入口是 [SKILL.md](SKILL.md)，上游完整規格在 [video-talkcraft/WORKFLOW.md](video-talkcraft/WORKFLOW.md)。

## 開新片

把旁白與 `words.json` 放在 `projects/<專案>/audio/` 或專案根目錄。每次執行一個階段，完成後按回覆中的「下一步」在新聊天接手。

| 指令 | 交付或停點 |
| --- | --- |
| `$video-talkcraft test-project prepare` | 匯入音檔與時間戳，等你選風格 |
| `$video-talkcraft test-project assets` | 語義標註、素材與來源紀錄 |
| `$video-talkcraft test-project preview` | 提供分鏡與有聲首鏡，等你核准版本 |
| `$video-talkcraft test-project render` | 取得其餘分鏡程式碼、合併與基本編譯檢查，完成後停下 |
| `$video-talkcraft test-project review` | 接續已合併分鏡，渲染、審片、修正與交付成片 |

只給專案名稱會顯示目前進度與下一個指令。也可用專案路徑，或在支援的用戶端使用 `/talkcraft <project> <stage>`。交接與核准記錄在輸出目錄的 `talkcraft-handoff.md`。

`render` 可加 `--generator cli`，由本機 CLI 用 `.env` 的 `BASE_URL` 和 `VIDEO_MODEL` 平行請求鏡頭程式碼。用 `--generator subagent` 則由 Codex 子代理分組產生鏡頭。兩種模式都由主 agent 合併分鏡並檢查編譯。`render` 完成後停在 review 斷點；全片渲染、抽幀、審片子代理與畫面修正，等你執行 `review` 再進行。詳見 [平行鏡頭生成](stages/shot-generation.md)。

需要 Node 22+、Python 3.11+、FFmpeg；做 YouTube 參考擷取另需 Pillow、yt-dlp。從工作區根目錄執行：

```sh
bash .agents/skills/video-talkcraft/tools/restore-workbench-links.sh     # 只修 GitHub ZIP 的連結；Git checkout 已有連結
bash .agents/skills/video-talkcraft/video-talkcraft/runtime/check-runtime.sh
npm install --no-save --no-package-lock sharp     # 首次，沿用 src/ 的 WebP 壓縮
python3.11 .agents/skills/video-talkcraft/tools/import-words.py path/words.json path/full.mp3 projects/my-video
node .agents/skills/video-talkcraft/tools/select-design.mjs projects/my-video gary-chen
node .agents/skills/video-talkcraft/tools/generate-assets.mjs projects/my-video
```

第四步可加 `--sentences caption-lines.txt`，手動指定字幕斷句、英文空格與標點。這個檔每行一組口播詞，內容須與字級資料一致。第六步前先加入 [assets.json 範例](../../../projects/test-project/talkcraft-remake/assets.json)。設定沿用工作區 `.env` 的 `IMAGE_*`、`EVOLINK_*` 等欄位；工具不用另外建 key。已有圖會跳過，可加 `--force` 生成整批新版；生成明細在 `asset-ledger.json`。

從專案目錄按原流程跑 `semantic_annotate.py --init`、填語義和素材、寫 SHOTBOOK、回填 `--sync-shots`、跑 `card_match.py` 與 `preflight.py`。由專案的 Remotion `theme.ts` 匯入選定的 `design.json`，場景需使用其 token 才能切換外觀。若新 design 的圖片語言也不同，應同步更新 `assets.json` 的風格並生成適用素材。

## 動效和 Design 怎麼累積

打開 [library.html](library.html)，可按名稱、分類、輸入與語義搜尋；每項連到原始碼、配方和可用預覽。新增上游格式的卡時一起加 `references/cards/<slug>.md`、`template/cards/<slug>.tsx`、`demos/<slug>/index.html`，執行 `python3.11 .agents/skills/video-talkcraft/video-talkcraft/scripts/cards_index.py --write` 和 `node .agents/skills/video-talkcraft/video-talkcraft/gallery/build.mjs`。共用模組放 `template/components/` 或 `template/motion-systems/`。新增 Design 則複製一個 `design/<id>/` 的 `design.md` 與 `theme.json`。每次增修後執行：

```sh
node .agents/skills/video-talkcraft/tools/build-library.mjs
```

目前可選 `gary-chen`（Claude 記憶拆解參考片）、`gary-chen-tutorial`（三支教學片的既有風格）、`robo-style`。切換指令會把 token 快照存入影片工程，不會改其他影片的 Design。

## 素材統一管理

後續合併 ZIP、圖片、影片、音效、模型與動畫包，使用 `$merge-video-assets <來源>`。見 [匯入 skill](../merge-video-assets/SKILL.md)，統一紀錄格式、內容雜湊去重與來源授權；不會強制把所有格式轉成 TSX。

所有來源都在 [library.html](library.html) 依用途搜尋：動畫、共用元件、圖片素材、音效、3D 模型、影片素材。RoboNuggets 匯入的 118 筆資料已分入這些分類，沒有按供應者另設分頁。30 張圖片／圖示加入現有圖片庫，以相同 `libraryId` 和 `generate-assets.mjs` 指令複用；原始 SVG／PNG 與授權保留在各項連結。其餘 88 筆動效、版型、模型、音效與影片用 `asset-library/entries/*.json` 維護；`kind` 是 `animation`、`component`、`audio`、`model` 或 `video`，來源寫在 `provenance`。修改後執行原本的 `build-library.mjs`。

來源檔整合在 `video-talkcraft/assets/robonuggets-animate/`，其中原始目錄與預覽只是匯入快照與依賴，日後不另行維護該套件目錄。格式轉接、檔案雜湊與授權見 [來源指南](references/robonuggets-animate.md)。

## 圖片素材庫

打開 [library.html](library.html) 的「圖片素材」分頁，按用途、專案與 Design 篩選，也可以搜尋標籤。點「開啟原圖」可取用 WebP，適用於影片、文章和簡報。為新專案選圖時，將圖片卡上的 ID 放進該專案 `assets.json` 的 `images`：

```json
{"id": "intro-robot", "libraryId": "109de7c3a26e9a47bdce674beca19a36e38fee0db4536ff645176e55a908fcd5"}
```

執行 `node .agents/skills/video-talkcraft/tools/generate-assets.mjs <影片工程>` 時會直接複製該圖，並記錄來源。新圖用 `category` 指定用途（開場意象、概念插畫、介面示意、圖表與流程、場景與背景、其他插畫），用 `tags` 標示主題，自動進入共用庫。可在原專案 `assets.json` 調整分類和標籤，再用同一個同步指令重新整理。共用庫保留 WebP 與來源紀錄，成片工程內也有自己的圖片檔。

```sh
node .agents/skills/video-talkcraft/tools/sync-image-library.mjs projects/test-project/talkcraft-remake
```

## 參考片與全片成果

- [全片 MP4](../../../projects/test-project/talkcraft-remake/remotion/out/Claude-記憶拆解.mp4) 為 18 鏡、1920×1080、30 fps 的完整影片。
- [SHOTBOOK](../../../projects/test-project/talkcraft-remake/SHOTBOOK.md) 記錄 266.96 秒的分鏡、素材和字級錨點。
- [s01 有聲預覽](../../../projects/test-project/talkcraft-remake/remotion/out/preview/s01.mp4) 從原音、字級錨點、GPT 生成插畫、來源截圖與原卡渲染。
- 重新開工作台：先在工作區執行 `bash .agents/skills/video-talkcraft/video-talkcraft/workbench/scripts/link-project.sh projects/test-project/talkcraft-remake`，然後 `npm --prefix .agents/skills/video-talkcraft/video-talkcraft/workbench run dev -- --host 127.0.0.1`，開 `http://127.0.0.1:5199/?tracks`。
- 重渲 s01：從樣板的 `remotion/` 跑 `node ../../../../.agents/skills/video-talkcraft/video-talkcraft/scripts/render_shots.mjs --shots shots.json --only s01 --seg-audio --preview-dir out/preview --parallel 1`。
