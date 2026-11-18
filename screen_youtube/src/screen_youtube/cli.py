#!/usr/bin/env python3
"""Capture timestamped frames from a YouTube or local video into contact sheets."""

from __future__ import annotations

import argparse
from bisect import bisect_left
from importlib.util import find_spec
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

MAX_FRAMES = 2500


def parse_time(value: str) -> float:
    parts = value.strip().split(":")
    try:
        if not 1 <= len(parts) <= 3 or not all(re.fullmatch(r"\d+", x) for x in parts[:-1]):
            raise ValueError
        seconds = float(parts[-1])
        if not math.isfinite(seconds) or seconds < 0 or (len(parts) > 1 and seconds >= 60):
            raise ValueError
        if len(parts) == 3 and int(parts[1]) >= 60:
            raise ValueError
        return seconds + sum(int(x) * 60**i for i, x in enumerate(reversed(parts[:-1]), 1))
    except ValueError:
        raise argparse.ArgumentTypeError(f"無效時間：{value!r}（用秒、MM:SS 或 HH:MM:SS）") from None


def label(seconds: float) -> str:
    total_ms = round(seconds * 1000)
    minute, sec = divmod(total_ms // 1000, 60)
    head = f"{minute}:{sec:02d}"
    if minute >= 60:
        head = f"{minute // 60}:{minute % 60:02d}:{sec:02d}"
    return head + (f".{total_ms % 1000:03d}".rstrip("0") if total_ms % 1000 else "")


def run(args: list[str], *, stderr: bool = False) -> str:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        lines = [s for s in result.stderr.splitlines() if "https://" not in s and s.strip()]
        detail = lines[-1] if lines else "未取得詳細錯誤"
        raise RuntimeError(f"{args[0]} 執行失敗：{detail}")
    return (result.stderr if stderr else result.stdout).strip()


def duration(video: Path) -> float:
    raw = run(["ffprobe", "-v", "error", "-select_streams", "v:0",
               "-show_entries", "stream=duration:format=duration",
               "-of", "default=noprint_wrappers=1:nokey=1", str(video)])
    raw = next((line for line in raw.splitlines() if line != "N/A"), "nan")
    result = float(raw)
    if not math.isfinite(result) or result <= 0:
        raise RuntimeError("無法取得有限的影片長度（直播請等回放可用）")
    return result


def fetch(url: str, folder: Path, until: float | None) -> Path:
    downloader = [sys.executable, "-m", "yt_dlp"] if find_spec("yt_dlp") else ["yt-dlp"]
    cmd = [*downloader, "--ignore-config", "--no-playlist", "--no-progress",
           "--quiet", "--no-warnings", "--socket-timeout", "25",
           "-f", "bv*[height<=720]/b", "--output", str(folder / "source.%(ext)s")]
    # Fetch from zero so all captures still use the original player clock.
    # Only the video stream is needed. The analysis copy is temporary.
    if until is not None:
        cmd += ["--download-sections", f"*0-{until:.3f}"]
    run(cmd + ["--", url])
    found = [p for p in folder.glob("source.*") if p.suffix not in {".part", ".ytdl"}]
    if len(found) != 1:
        raise RuntimeError("無法辨認 yt-dlp 下載的影片檔")
    return found[0]


def extract(video: Path, times: list[float], frame_dir: Path, width: int,
            step: float | None) -> list[Path]:
    base = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error"]
    scale = f"scale={width}:-2"
    if step is not None:
        # Decode once; choose the first decoded frame at or after each requested
        # time. Avoid an fps filter, which can shift the sampled source frame.
        expression = f"gte(t,{times[0]:.9f}+selected_n*{step:.9f}-0.0000001)"
        log = run(base + ["-v", "info", "-i", str(video), "-map", "0:v:0", "-an",
                          "-vf", f"select='{expression}',{scale},showinfo", "-fps_mode", "passthrough",
                          "-q:v", "3", "-frames:v", str(len(times)), str(frame_dir / "%05d.jpg")],
                  stderr=True)
        timestamps = [float(s) for s in re.findall(r"\bn:\s*\d+\s+pts:\s*\S+\s+pts_time:\s*([\d.eE+-]+)", log)]
        files = sorted(frame_dir.glob("*.jpg"))
        timestamps = timestamps[:len(files)]
        if len(timestamps) != len(files):
            raise RuntimeError("影格數與時間戳記不一致")
        # A low-FPS source can satisfy several requested times with one frame.
        # Reuse it for those slots so later labels never drift.
        indices = [bisect_left(timestamps, t - 1e-6) for t in times]
        if indices[-1] < len(files):
            return [files[i] for i in indices]
        raise RuntimeError("有取樣點落在最後一幀之後；請略微縮短範圍")
    else:
        for i, seconds in enumerate(times, 1):
            run(base + ["-ss", f"{seconds:.9f}", "-i", str(video), "-map", "0:v:0",
                        "-an", "-vf", scale, "-frames:v", "1", "-q:v", "3",
                        str(frame_dir / f"{i:05d}.jpg")])
    frames = sorted(frame_dir.glob("*.jpg"))
    if len(frames) != len(times):
        raise RuntimeError(f"預定 {len(times)} 個取樣點，實際取得 {len(frames)} 幀；請縮短範圍或加大間隔")
    return frames


def make_sheets(frames: list[Path], times: list[float], output: Path, *,
                source: str, cols: int, rows: int, width: int, keep_frames: bool) -> None:
    from PIL import Image, ImageDraw, ImageFont

    height = round(width * 9 / 16)
    strip = max(20, round(width * .08))
    per_page = cols * rows
    font_size = max(12, round(strip * .64))
    for candidate in ("/System/Library/Fonts/Monaco.dfont", "DejaVuSans.ttf"):
        try:
            font = ImageFont.truetype(candidate, font_size)
            break
        except OSError:
            continue
    else:
        font = ImageFont.load_default()
    entries = []
    sheets = []
    output.mkdir(parents=True, exist_ok=True)
    if keep_frames:
        (output / "frames").mkdir()
    for start in range(0, len(frames), per_page):
        end = min(start + per_page, len(frames))
        name = f"sheet-{len(sheets) + 1:03d}.jpg"
        actual_rows = math.ceil((end - start) / cols)
        canvas = Image.new("RGB", (width * cols, (height + strip) * actual_rows), "#161616")
        draw = ImageDraw.Draw(canvas)
        for i in range(start, end):
            row, col = divmod(i - start, cols)
            x, y = col * width, row * (height + strip)
            with Image.open(frames[i]) as raw:
                raw.thumbnail((width, height), Image.Resampling.LANCZOS)
                canvas.paste(raw, (x + (width - raw.width) // 2, y + (height - raw.height) // 2))
            timecode = label(times[i])
            draw.text((x + 8, y + height + strip // 2), timecode, font=font, fill="white", anchor="lm")
            entry = {"seconds": round(times[i], 6), "timecode": timecode, "sheet": name,
                     "row": row + 1, "column": col + 1}
            if keep_frames:
                name_frame = f"frames/{i + 1:05d}.jpg"
                shutil.copyfile(frames[i], output / name_frame)
                entry["frame"] = name_frame
            entries.append(entry)
        canvas.save(output / name, quality=92, optimize=True)
        sheets.append(name)
    manifest = {"source": source, "sampling": "first source frame at or after requested time",
                "columns": cols, "rows_per_page": rows, "sheets": sheets, "frames": entries}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                         encoding="utf-8")
    print(f"已輸出 {len(sheets)} 張截圖總覽、{len(frames)} 個取樣點：{output.resolve()}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", help="YouTube 網址或本機影片路徑")
    parser.add_argument("-o", "--output", type=Path, default=Path("youtube-sheets"),
                        help="輸出目錄（須為空，預設 youtube-sheets）")
    parser.add_argument("--start", type=parse_time, default=0, help="區間起點，含（預設 0:00）")
    parser.add_argument("--end", default="4:00", help="區間終點，不含；用 full 可取至片尾（預設 4:00）")
    parser.add_argument("--step", type=parse_time, default=2, help="截圖間隔（秒，預設 2）")
    parser.add_argument("--times", help="指定個別截點，逗號分隔；使用時取代區間設定")
    parser.add_argument("--cols", type=int, default=5, help="每頁欄數（預設 5）")
    parser.add_argument("--rows", type=int, default=6, help="每頁最多列數（預設 6）")
    parser.add_argument("--width", type=int, default=300, help="每格寬度（預設 300 像素）")
    parser.add_argument("--keep-frames", action="store_true", help="同時保留單張 JPG")
    opts = parser.parse_args()

    try:
        from PIL import Image  # Verify before making network requests.
        del Image
        if not 1 <= opts.cols <= 12 or not 1 <= opts.rows <= 15 or not 100 <= opts.width <= 960:
            raise ValueError("欄數須為 1–12、列數為 1–15、格寬為 100–960")
        if opts.cols * opts.rows * opts.width**2 > 100_000_000:
            raise ValueError("單頁過大，請減少欄列或格寬")
        if opts.step <= 0:
            raise ValueError("--step 必須大於 0")
        if opts.output.exists() and (not opts.output.is_dir() or any(opts.output.iterdir())):
            raise ValueError("輸出目錄須為空；請用 -o 指定新目錄")
        url = urlsplit(opts.source)
        remote = url.scheme in ("https", "http")
        if remote and (url.hostname or "") not in {
            "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "music.youtube.com",
        }:
            raise ValueError("請提供 youtube.com 或 youtu.be 的影片網址")
        local = Path(opts.source).expanduser().resolve()
        if not remote and not local.is_file():
            raise ValueError("找不到本機影片")
        for tool in ("ffmpeg", "ffprobe"):
            if not shutil.which(tool):
                raise RuntimeError(f"找不到 {tool}，請先安裝 FFmpeg")
        if remote and not find_spec("yt_dlp") and not shutil.which("yt-dlp"):
            raise RuntimeError("找不到 yt-dlp，請安裝 screen_youtube 或 yt-dlp")
        explicit = sorted(set(map(parse_time, opts.times.split(",")))) if opts.times else None
        end = None if opts.end.lower() == "full" else parse_time(opts.end)
        if not explicit and end is not None and end <= opts.start:
            raise ValueError("--end 必須晚於 --start")
        if (explicit and len(explicit) > MAX_FRAMES) or (
            not explicit and end is not None and (end - opts.start) / opts.step > MAX_FRAMES
        ):
            raise ValueError(f"最多擷取 {MAX_FRAMES} 張，請加大間隔或縮短範圍")

        with tempfile.TemporaryDirectory(prefix="youtube-sheet-") as temp:
            folder = Path(temp)
            # Fetch a little beyond the final target so nearby frame rounding
            # never excludes a valid requested frame.
            until = explicit[-1] + 1 if explicit else end + 1 if end is not None else None
            video = fetch(opts.source, folder, until) if remote else local
            length = duration(video)
            if explicit:
                if explicit[-1] >= length:
                    raise ValueError(f"指定時間超過片長 {label(length)}")
                times = explicit
            else:
                stop = min(end, length) if end is not None else length
                count = max(0, math.ceil((stop - opts.start) / opts.step - 1e-9))
                if not 1 <= count <= MAX_FRAMES:
                    raise ValueError(f"請指定有內容的區間，共 1–{MAX_FRAMES} 個截點")
                times = [opts.start + i * opts.step for i in range(count)]
            frame_dir = folder / "frames"
            frame_dir.mkdir()
            frames = extract(video, times, frame_dir, opts.width, None if explicit else opts.step)
            make_sheets(frames, times, opts.output, source=opts.source, cols=opts.cols,
                        rows=opts.rows, width=opts.width, keep_frames=opts.keep_frames)
    except ImportError:
        parser.exit(1, "需要 Pillow：python3 -m pip install Pillow\n")
    except (ValueError, RuntimeError, OSError, argparse.ArgumentTypeError) as err:
        parser.exit(1, f"錯誤：{err}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
