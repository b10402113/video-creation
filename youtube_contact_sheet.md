# YouTube 截圖總覽

用 `youtube_contact_sheet.py` 把影片排成五欄截圖，圖下附原影片時間碼。預設取 0:00–4:00（短片會在片尾停），每 2 秒一格，最多 30 格一頁。支援一般 YouTube 網址、短網址、Shorts 和本機影片；網址中的 `t=` 不會改變取樣起點。

在本專案目錄執行。需要 Python 3.10+、Pillow、FFmpeg（含 ffprobe），以及擷取 YouTube 所需的 yt-dlp：

```bash
brew install yt-dlp ffmpeg
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install Pillow
```

每秒一格，輸出前四分鐘：

```bash
python3 youtube_contact_sheet.py 'https://www.youtube.com/watch?v=ZJkfmrbmuFg' \
  --end 4:00 --step 1 -o shots
```

還原範例圖使用的 30 個時間點：

```bash
python3 youtube_contact_sheet.py 'https://www.youtube.com/watch?v=ZJkfmrbmuFg' \
  --times 23,24,25,26,27,28,29,30,31,32,33,34,35,37,42,44,45,46,47,55,56,57,58,64,65,66,67,72,73,74 \
  --cols 5 --rows 6 -o reference-shots
```

`--start 2:00 --end 3:00` 擷取指定區間；`--end full` 掃到片尾。加 `--keep-frames` 同時保留各格 JPG，或用 `--width 480` 增加解析度。輸出包括 `sheet-001.jpg` 等分頁及 `manifest.json`（時間碼、頁碼、列欄）；請為每次擷取指定空目錄。

為保留正確時間軸，工具會暫存從片頭到指定末點的影片畫面，完成後清掉暫存。畫面中原本就有的字幕會一起留下；YouTube 可開關的播放器字幕不會額外疊上。連線須能讀取原影片；私人影片、受限影片或尚無回放的直播可能無法擷取。若 YouTube 取檔失敗，可用已取得的本機影片路徑執行同一指令。
