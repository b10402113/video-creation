# video-creation

Video Talkcraft 工作區：從旁白與字級時間戳，準備素材、分鏡、Remotion 場景與影片交付。倉庫根目錄對應原本的 `video-project/`。

## 入口

- [Video Talkcraft](.agents/skills/video-talkcraft/SKILL.md)：`prepare → assets → preview → render → review`，每次一個階段。
- [素材匯入](.agents/skills/merge-video-assets/SKILL.md)：將圖片、影片、音效、模型與動畫包合併到共用庫。
- 素材索引資料保留；共用素材庫媒體與生成預覽頁依使用者要求不上傳。
- [工作區使用說明](.agents/skills/video-talkcraft/README.md)。

```text
$video-talkcraft <project> prepare
$video-talkcraft <project> assets
$video-talkcraft <project> preview
$video-talkcraft <project> render --generator cli
$video-talkcraft <project> review
```

`render` 完成場景整合後停止；`review` 才進行完整渲染、審片與交付。首鏡需使用者核准。

## 安裝與設定

需要 Node.js 22+、Python 3.11+ 與 FFmpeg。從倉庫根目錄安裝圖片處理依賴，並按使用的供應者填寫設定：

```sh
cp .env.example .env
npm install --no-save --no-package-lock sharp
bash .agents/skills/video-talkcraft/video-talkcraft/runtime/check-runtime.sh
```

Python 配音、逐字稿與 YouTube 工具的依賴，見各自 skill 與 `screen_youtube/README.md`。`.env` 不進 Git。

工作台接入指定影片工程：

```sh
bash .agents/skills/video-talkcraft/video-talkcraft/workbench/scripts/link-project.sh projects/stock-volume/talkcraft-remake
```

原工作區的機器絕對路徑軟連結不納入倉庫；依賴與工作台連結由安裝／接入腳本重建。

## 保存範圍

此版本只保存可重用的程式碼、skills、設定、Design HTML/CSS、素材索引／來源紀錄與工具文件。

整個 `projects/` 不納入倉庫。所有音檔、影片、圖片、字型、模型、原始素材包、渲染產物、預覽、QA 圖片與共用 library 實體素材也留在本機。

`.env`、金鑰、依賴、本機快取、模型請求稽核／草稿快取與機器絕對路徑軟連結不納入。文件中的專案路徑只是使用範例；實際使用時建立自己的本機專案，並自行放回所需素材。

## 授權

原版 Video Talkcraft、RoboNuggets 與第三方媒體保留其原始授權與聲明。各套件 LICENSE、THIRD-PARTY-NOTICES 與素材 provenance 隨來源保存；本倉庫不將第三方內容重新統一授權。
