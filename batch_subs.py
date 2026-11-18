#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
batch_subs.py — 批量下載 YouTube 字幕（支援頻道 / 播放清單 / 單支影片）

預設輸出結構:
  subtitles/<頻道名稱>/<上傳日期>-<影片標題>.txt
  例：subtitles/Dan Koe Talks/2024-03-12-The Death Of The Influencer.txt
  （txt 預設開啟，已去掉時間戳、空白行並去重；字幕檔預設不保留）

特色:
  * 來源可以是頻道、播放清單或單支影片（可一次給多個來源）
  * -i 指定影片索引範圍，例如 -i 3 10 代表第 3 到第 10 支；-i 5 代表只抓第 5 支
  * -t 多執行緒平行下載
  * 自動抓頻道名與上傳日期、自動轉 txt、自動重試 429 限流、可跳過已存在檔案
  * 預設從本機 Chrome 抓「已登入 YouTube」的 cookie（--cookies-from-browser chrome），
    大幅降低 429 限流；也可用 --cookies 指定 cookies.txt，或 none 關閉

範例:
  # 下載頻道前 10 支影片（輸出 txt 到 subtitles/<頻道>/<日期>-<名稱>.txt）
  python3 batch_subs.py "https://www.youtube.com/@DanKoeTalks/videos" -i 1 10

  # 下載頻道第 3 到第 10 支影片
  python3 batch_subs.py "https://www.youtube.com/@DanKoeTalks/videos" -i 3 10

  # 只下載第 5 支
  python3 batch_subs.py "https://www.youtube.com/@DanKoeTalks/videos" -i 5

  # 單支影片、抓中文字幕
  python3 batch_subs.py "https://www.youtube.com/watch?v=XXXX" -l zh-Hant

  # 多執行緒 (8 條) + 指定 cookie + 自訂輸出根資料夾
  python3 batch_subs.py "URL" -t 8 --cookies .auth/cookies.txt -o subs

  # 除了 txt 之外，也保留字幕檔（srt）
  python3 batch_subs.py "URL" --keep-subs

  # 只要字幕檔、不要 txt
  python3 batch_subs.py "URL" --no-txt

  # 自訂頻道資料夾名稱
  python3 batch_subs.py "URL" -c "MyChannel"

  # 先看看會抓到哪些影片（不下載）
  python3 batch_subs.py "https://www.youtube.com/@DanKoeTalks/videos" -i 1 10 --list
"""

import argparse
import atexit
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

YDL = "yt-dlp"

# ANSI 顏色（非 tty 時自動關閉）
_USE_COLOR = sys.stdout.isatty()


def _c(text, code):
    if not _USE_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def info(msg):
    print(_c(msg, "36"))  # cyan


def ok(msg):
    print(_c(msg, "32"))  # green


def warn(msg):
    print(_c(msg, "33"))  # yellow


def err(msg):
    print(_c(msg, "31"))  # red


# --------------------------------------------------------------------------- #
# 前置檢查
# --------------------------------------------------------------------------- #
def check_tools(sub_format):
    if subprocess.run(["which", YDL], capture_output=True).returncode != 0:
        err(f"找不到 {YDL}，請先安裝：brew install yt-dlp")
        sys.exit(1)
    if sub_format != "vtt":
        if subprocess.run(["which", "ffmpeg"], capture_output=True).returncode != 0:
            warn("找不到 ffmpeg，無法轉檔；將維持 vtt 格式（請 brew install ffmpeg）")


def extract_cookies_from_browser(browser):
    """從瀏覽器萃取 cookies 成暫存 netscape 檔，回傳路徑（失敗回傳 None）。

    只萃取一次，之後所有 yt-dlp 請求共用同一份檔，避免每次重讀瀏覽器資料庫。
    """
    # 用暫存目錄內「尚不存在」的路徑，避免 yt-dlp 把空檔誤判為非法格式
    tmpdir = tempfile.mkdtemp(prefix="ytck_")
    path = os.path.join(tmpdir, "cookies.txt")
    cmd = [YDL, "--cookies-from-browser", browser, "--cookies", path,
           "--skip-download", "--simulate", "https://www.youtube.com/watch?v=jNQXAC9IVRw"]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True)
    except Exception as ex:  # noqa: BLE001
        err(f"  從瀏覽器萃取 cookie 失敗：{ex}")
        return None
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        detail = (p.stderr or "").strip().splitlines()
        err(f"  從瀏覽器萃取 cookie 失敗：{detail[-1] if detail else '未知錯誤'}")
        shutil.rmtree(tmpdir, ignore_errors=True)
        return None
    return path


def find_cookies(explicit, from_browser=None):
    """決定要使用的 cookies 路徑；找不到回傳 None。

    優先序：
      1. 明確指定 --cookies 檔
      2. --cookies-from-browser（預設 chrome，可 'none' 關閉）
      3. 自動偵測 .auth/cookies.txt
    """
    if explicit:
        if not os.path.exists(explicit):
            err(f"指定的 cookie 檔不存在：{explicit}")
            sys.exit(1)
        return explicit

    if from_browser and from_browser.lower() not in ("none", "off", ""):
        info(f"從瀏覽器（{from_browser}）萃取登入 cookie…")
        path = extract_cookies_from_browser(from_browser)
        if path:
            info("  已取得登入 cookie（可降低 429 限流）")
            return path
        warn("  改用其他 cookie 來源")

    # 自動偵測常見位置
    for p in (".auth/cookies.txt", "../.auth/cookies.txt"):
        if os.path.exists(p):
            return p
    return None


# --------------------------------------------------------------------------- #
# 檔名 / 資料夾名稱清理（跨平台安全）
# --------------------------------------------------------------------------- #
_BAD_CHARS = re.compile(r'[\\/:*?"<>|]')


def sanitize_filename(name, max_len=120):
    """移除 Windows/macOS 不允許的檔名字元，並壓縮空白。"""
    name = (name or "").replace("/", "_").replace("\\", "_")
    name = _BAD_CHARS.sub("_", name)
    name = re.sub(r"\s+", " ", name).strip()
    name = name.strip(". ")          # 開頭結尾的點與空白
    if len(name) > max_len:
        name = name[:max_len].rstrip()
    return name or "untitled"


def sanitize_dirname(name, max_len=80):
    return sanitize_filename(name, max_len)


# --------------------------------------------------------------------------- #
# 解析來源 -> 影片清單
# --------------------------------------------------------------------------- #
def _normalize_entry(e, index, channel=None):
    vid = e.get("id")
    url = e.get("webpage_url") or e.get("url")
    if url and "://" not in url:
        url = f"https://www.youtube.com/watch?v={url}"
    if not url and vid:
        url = f"https://www.youtube.com/watch?v={vid}"
    title = e.get("title") or vid or "(unknown)"
    return {
        "index": index,
        "id": vid,
        "title": title,
        "url": url,
        "channel": e.get("channel") or e.get("uploader") or channel,
    }


def resolve_entries(sources, cookies, playlist_end):
    """用 yt-dlp --flat-playlist 取得影片清單（不解析每支影片，速度快）。

    回傳 (entries, channel_name)。channel_name 取自第一個來源的頻道/上傳者名稱。
    """
    entries = []
    channel_name = None
    for src in sources:
        cmd = [YDL, "--flat-playlist", "--dump-single-json", "--no-warnings", "--ignore-errors"]
        if cookies:
            cmd += ["--cookies", cookies]
        if playlist_end:
            cmd += ["--playlist-end", str(playlist_end)]
        cmd.append(src)

        info(f"解析來源：{src}")
        try:
            p = subprocess.run(cmd, capture_output=True, text=True)
        except Exception as ex:  # noqa: BLE001
            err(f"  解析失敗：{ex}")
            continue
        if p.returncode != 0 or not p.stdout.strip():
            err(f"  解析失敗（{p.returncode}）：{p.stderr.strip().splitlines()[-1] if p.stderr.strip() else 'no output'}")
            continue

        try:
            data = json.loads(p.stdout)
        except json.JSONDecodeError:
            err("  無法解析 yt-dlp 的 JSON 輸出")
            continue

        base = len(entries)
        if data.get("_type") == "playlist" or "entries" in data:
            # 頻道 / 播放清單名稱
            src_channel = (data.get("channel") or data.get("uploader")
                           or data.get("playlist_uploader") or data.get("title"))
            if channel_name is None and src_channel:
                channel_name = src_channel
            raw = data.get("entries") or []
            n = 0
            for e in raw:
                if not e:
                    continue
                n += 1
                entries.append(_normalize_entry(e, base + n, channel=src_channel))
            info(f"  找到 {n} 支影片（頻道：{src_channel or '未知'}）")
        else:
            # 單支影片
            src_channel = data.get("channel") or data.get("uploader")
            if channel_name is None and src_channel:
                channel_name = src_channel
            entries.append(_normalize_entry(data, base + 1, channel=src_channel))
            info(f"  單支影片（頻道：{src_channel or '未知'}）")
    return entries, channel_name


def parse_index(vals):
    """-i 3 10 -> (3,10)；-i 5 -> (5,5)；None -> (None,None)"""
    if not vals:
        return None, None
    if len(vals) == 1:
        start = end = vals[0]
    else:
        start, end = vals[0], vals[1]
    if start < 1:
        err("-i 的索引必須 >= 1")
        sys.exit(1)
    if end < start:
        start, end = end, start
    return start, end


# --------------------------------------------------------------------------- #
# 路徑組裝（subtitles/<頻道>/<日期>-<名稱>.txt）
# --------------------------------------------------------------------------- #
def channel_dir(root, channel):
    return os.path.join(root, sanitize_dirname(channel or "unknown-channel"))


def expected_txt_path(root, channel, item):
    """依 <日期>-<名稱>.txt 規則組出預期的 txt 路徑（用於 skip 判斷）。"""
    if not item.get("date"):
        return None  # 日期未知時無法預先判斷，交由下載後處理
    d = channel_dir(root, channel)
    fname = f"{item['date']}-{sanitize_filename(item['title'])}.txt"
    return os.path.join(d, fname)


def txt_exists(root, channel, item):
    p = expected_txt_path(root, channel, item)
    return p if (p and os.path.exists(p)) else None


# --------------------------------------------------------------------------- #
# yt-dlp 輔助：抓 metadata / 下載原始字幕
# --------------------------------------------------------------------------- #
def get_meta(url, cookies):
    """回傳 (channel, upload_date, title)；失敗回傳 (None, None, None)。"""
    cmd = [YDL, "--dump-single-json", "--no-warnings", "--skip-download", url]
    if cookies:
        cmd += ["--cookies", cookies]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode == 0 and p.stdout.strip():
            j = json.loads(p.stdout)
            return (
                j.get("channel") or j.get("uploader"),
                j.get("upload_date"),
                j.get("title"),
            )
    except Exception:  # noqa: BLE001
        pass
    return None, None, None


def output_sub_format(args):
    """txt-only 模式不需要轉檔，直接用 vtt（免 ffmpeg）。"""
    return "vtt" if args.txt and args.txt_only else args.sub_format


def build_sub_cmd(url, raw_dir, args):
    outtmpl = os.path.join(raw_dir, "%(title)s.%(ext)s")
    cmd = [
        YDL, "--skip-download",
        "--write-subs", "--write-auto-subs",
        "--sub-langs", args.langs,
        "--convert-subs", output_sub_format(args),
        "--sleep-requests", str(args.sleep_requests),
        "--no-warnings",
        "-o", outtmpl,
    ]
    if args.keep_vtt:
        cmd.append("-k")
    if args.cookies:
        cmd += ["--cookies", args.cookies]
    cmd.append(url)
    return cmd


def fetch_raw_subs(url, args):
    """下載字幕到暫存資料夾。

    回傳 (sub_path, tmp_dir)；找不到字幕時 sub_path 為 None（tmp_dir 仍需清理）。
    呼叫端負責在最後 shutil.rmtree(tmp_dir)。
    """
    tmp = tempfile.mkdtemp(prefix="bsubs_")
    last_err = ""
    for attempt in range(1, args.retries + 1):
        p = subprocess.run(build_sub_cmd(url, tmp, args), capture_output=True, text=True)
        subs = [os.path.join(tmp, f) for f in os.listdir(tmp)
                if f.lower().endswith("." + output_sub_format(args))]
        if subs:
            return subs[0], tmp
        stderr = p.stderr or ""
        last_err = stderr.strip().splitlines()[-1] if stderr.strip() else f"returncode={p.returncode}"
        if "There are no subtitles" in stderr or "no subtitles" in stderr.lower():
            return None, tmp
        if attempt < args.retries:
            time.sleep(min(2 ** attempt, 30))
    raise RuntimeError(last_err or "下載字幕失敗")


# --------------------------------------------------------------------------- #
# 下載


# --------------------------------------------------------------------------- #
# 字幕 -> 純文字 txt（去掉時間戳與空白行，並處理自動字幕的重複滾動）
# --------------------------------------------------------------------------- #
_TS_LINE = re.compile(r"-->")
_TAG = re.compile(r"<[^>]+>")
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_HTML_ENT = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#39;": "'", "&quot;": '"'}


def _clean_line(line):
    line = _TAG.sub("", line)
    for k, v in _HTML_ENT.items():
        line = line.replace(k, v)
    return line.strip()


def _dedupe_rolling(lines):
    """處理 YouTube 自動字幕的滾動重複：
    - 相鄰完全相同 -> 略過
    - 新行以舊行開頭（句子變長）-> 用新行取代舊行
    - 舊行以新行開頭（句子變短）-> 略過新行
    """
    res = []
    for s in lines:
        if not res:
            res.append(s)
            continue
        prev = res[-1]
        if s == prev:
            continue
        if s.startswith(prev):
            res[-1] = s
            continue
        if prev.startswith(s):
            continue
        res.append(s)
    return res


def sub_to_text(sub_path, sentences_per_para=4):
    """讀取 srt/vtt，回傳乾淨的純文字（無時間戳、無空白行、已去重）。"""
    with open(sub_path, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")

    lines = []
    for ln in raw.split("\n"):
        s = ln.strip()
        if not s:
            continue
        if _TS_LINE.search(s):          # 時間戳
            continue
        if s.isdigit():                 # srt 序號
            continue
        if s.upper() == "WEBVTT":
            continue
        if s.upper().startswith("NOTE"):
            continue
        s = _clean_line(s)
        if s:
            lines.append(s)

    lines = _dedupe_rolling(lines)
    text = re.sub(r"\s+", " ", " ".join(lines)).strip()
    if not text:
        return ""

    # 依句子切成段落，每段數句，方便閱讀
    sentences = [x for x in _SENT_SPLIT.split(text) if x.strip()]
    paras = []
    for i in range(0, len(sentences), max(1, sentences_per_para)):
        paras.append(" ".join(sentences[i:i + sentences_per_para]).strip())
    return "\n\n".join(paras) + "\n"


def convert_to_txt(sub_path, txt_path, sentences_per_para=4):
    text = sub_to_text(sub_path, sentences_per_para)
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(text)
    return len(text)


def download_one(item, args, default_channel):
    idx = item["index"]
    url = item["url"]
    title = item["title"]
    channel = item.get("channel") or default_channel

    # skip 判斷（用預期路徑；日期未知則無法預判）
    if args.skip_existing:
        if args.txt and txt_exists(args.output, channel, item):
            return idx, title, "skip", "txt 已存在"
        if not args.txt:
            p = expected_txt_path(args.output, channel, item)
            sub_p = p[:-4] + "." + args.sub_format if p else None
            if sub_p and os.path.exists(sub_p):
                return idx, title, "skip", "字幕檔已存在"

    # 取得 metadata（頻道 / 日期）
    meta_channel, upload_date, meta_title = get_meta(url, args.cookies)
    # 頻道名優先序：-c 覆寫 > metadata > 來源偵測
    channel = args.channel or meta_channel or channel or default_channel
    if meta_title:
        title = meta_title
    if upload_date and len(upload_date) == 8:
        date_str = f"{upload_date[0:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
    else:
        date_str = upload_date or "0000-00-00"
    item["date"] = date_str

    cdir = channel_dir(args.output, channel)
    os.makedirs(cdir, exist_ok=True)
    base_name = f"{date_str}-{sanitize_filename(title)}"
    txt_path = os.path.join(cdir, base_name + ".txt")
    sub_path_dst = os.path.join(cdir, base_name + "." + args.sub_format)

    # skip（拿到真實日期後再判斷一次）
    if args.skip_existing:
        if args.txt and os.path.exists(txt_path):
            return idx, title, "skip", "txt 已存在"
        if not args.txt and os.path.exists(sub_path_dst):
            return idx, title, "skip", "字幕檔已存在"

    # 下載原始字幕到暫存
    try:
        sub_path, tmp_dir = fetch_raw_subs(url, args)
    except Exception as ex:  # noqa: BLE001
        return idx, title, "fail", str(ex)

    try:
        if not sub_path:
            return idx, title, "nosub", "此影片沒有可用字幕"

        if args.txt:
            try:
                n = convert_to_txt(sub_path, txt_path, args.sentences_per_para)
            except Exception as ex:  # noqa: BLE001
                return idx, title, "fail", f"轉 txt 失敗：{ex}"
            if not args.txt_only:
                shutil.copy2(sub_path, sub_path_dst)
            if n == 0:
                return idx, title, "nosub", "字幕內容為空"
            return idx, title, "ok", os.path.relpath(txt_path, args.output)
        else:
            shutil.copy2(sub_path, sub_path_dst)
            return idx, title, "ok", os.path.relpath(sub_path_dst, args.output)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# --------------------------------------------------------------------------- #
# 主程式
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(
        description="批量下載 YouTube 字幕（頻道 / 播放清單 / 單支影片）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("sources", nargs="+", help="頻道、播放清單或影片網址（可多個）")
    ap.add_argument("-i", "--index", nargs="+", type=int, metavar="N",
                    help="影片索引範圍，例如 -i 3 10（第3到第10支）或 -i 5（只抓第5支）")
    ap.add_argument("-t", "--threads", type=int, default=4, help="平行下載執行緒數（預設 4）")
    ap.add_argument("-l", "--langs", default="en", help="字幕語言，逗號分隔（預設 en）")
    ap.add_argument("-o", "--output", default="subtitles",
                    help="輸出根資料夾（預設 subtitles；實際路徑為 <root>/<頻道>/<日期>-<名稱>.txt）")
    ap.add_argument("-c", "--channel", default=None,
                    help="覆寫頻道資料夾名稱（預設自動偵測頻道名）")
    ap.add_argument("-f", "--sub-format", default="srt", choices=["srt", "vtt", "ass", "best"],
                    help="字幕格式（預設 srt，需 ffmpeg 轉檔）")
    ap.add_argument("--cookies", default=None, help="cookies.txt 路徑（優先使用）")
    ap.add_argument("--cookies-from-browser", default="chrome", metavar="BROWSER",
                    help="從瀏覽器抓登入 cookie 以降低 429（預設 chrome；可 chrome/edge/firefox/safari，"
                         "或 none 關閉）")
    ap.add_argument("--sleep-requests", type=float, default=1.5, help="每次請求間隔秒數（預設 1.5）")
    ap.add_argument("--retries", type=int, default=3, help="每支影片重試次數（預設 3）")
    ap.add_argument("--skip-existing", action="store_true", help="跳過已存在的檔案")
    ap.add_argument("--keep-vtt", action="store_true", help="保留原始 vtt 檔")
    # --- 轉 txt（預設開啟）---
    ap.add_argument("--txt", dest="txt", action="store_true", default=True,
                    help="下載後自動轉成純文字 txt（預設開啟）")
    ap.add_argument("--no-txt", dest="txt", action="store_false",
                    help="關閉 txt，只保留字幕檔")
    ap.add_argument("--txt-only", dest="txt_only", action="store_true", default=True,
                    help="只保留 txt，不保留字幕檔（預設）")
    ap.add_argument("--keep-subs", dest="txt_only", action="store_false",
                    help="除了 txt 也保留字幕檔（預設不保留）")
    ap.add_argument("--sentences-per-para", type=int, default=4, metavar="N",
                    help="txt 每段合併幾句（預設 4；設 0 表示不切段、整篇一段）")
    ap.add_argument("-n", "--list", action="store_true", help="只列出將下載的影片，不下載")
    args = ap.parse_args()

    check_tools(output_sub_format(args))
    tmp_cookies = None
    explicit_cookies = args.cookies
    args.cookies = find_cookies(args.cookies, args.cookies_from_browser)
    if args.cookies:
        info(f"使用 cookies：{args.cookies}")
        # 若這份是從瀏覽器萃取的暫存檔，註冊結束時清理
        if not explicit_cookies and args.cookies.startswith(tempfile.gettempdir()):
            tmp_cookies = args.cookies
            atexit.register(lambda p=tmp_cookies: shutil.rmtree(os.path.dirname(p), ignore_errors=True))

    start, end = parse_index(args.index)
    playlist_end = end  # 用於加速解析（只需抓到 end）

    entries, detected_channel = resolve_entries(args.sources, args.cookies, playlist_end)
    if not entries:
        err("沒有解析到任何影片，請確認網址是否正確。")
        sys.exit(1)

    default_channel = args.channel or detected_channel

    # 依索引範圍過濾（保留原始索引作為檔名前綴）
    if start is not None:
        selected = [e for e in entries if start <= e["index"] <= end]
    else:
        selected = entries

    if not selected:
        err(f"索引範圍 -i {start} {end} 沒有對應的影片（來源共 {len(entries)} 支）。")
        sys.exit(1)

    print()
    if args.txt and args.txt_only:
        extra = "，輸出 txt（不保留字幕檔）"
    elif args.txt:
        extra = "，輸出 txt + 字幕檔"
    else:
        extra = "，僅字幕檔"
    info(f"將下載 {len(selected)} 支影片的字幕（語言：{args.langs}，格式：{args.sub_format}，執行緒：{args.threads}{extra}）")
    info(f"輸出結構：{args.output}/<頻道>/<日期>-<名稱>.{'txt + .' + args.sub_format if args.txt and not args.txt_only else 'txt' if args.txt else args.sub_format}")
    print("-" * 70)
    for e in selected:
        print(f"  {e['index']:>3}. {e['title']}")
    print("-" * 70)

    if args.list:
        info("（--list 模式，未實際下載）")
        return

    os.makedirs(args.output, exist_ok=True)

    results = []
    total = len(selected)
    done = 0
    lock_msg = ""

    def _print_progress(idx, title, status, detail):
        nonlocal done
        done += 1
        short = title if len(title) <= 45 else title[:42] + "..."
        tag = {
            "ok": _c("OK  ", "32"),
            "skip": _c("SKIP", "33"),
            "nosub": _c("NOSUB", "33"),
            "fail": _c("FAIL", "31"),
        }.get(status, status)
        line = f"[{done:>{len(str(total))}}/{total}] {tag} {idx:02d} - {short}"
        if status in ("fail", "nosub") and detail:
            line += f"  ({detail})"
        print(line)

    with ThreadPoolExecutor(max_workers=max(1, args.threads)) as pool:
        futures = {pool.submit(download_one, e, args, default_channel): e for e in selected}
        try:
            for fut in as_completed(futures):
                idx, title, status, detail = fut.result()
                results.append((idx, title, status, detail))
                _print_progress(idx, title, status, detail)
        except KeyboardInterrupt:
            warn("\n使用者中斷，等待進行中的下載結束…")
            pool.shutdown(wait=False, cancel_futures=True)
            raise

    # 統計
    counts = {}
    for _, _, status, _ in results:
        counts[status] = counts.get(status, 0) + 1

    print("\n" + "=" * 70)
    ok(f"完成：成功 {counts.get('ok', 0)}、跳過 {counts.get('skip', 0)}、"
       f"無字幕 {counts.get('nosub', 0)}、失敗 {counts.get('fail', 0)}")
    print(f"輸出資料夾：{os.path.abspath(args.output)}")

    if counts.get("fail"):
        warn("\n以下影片下載失敗：")
        for idx, title, status, detail in sorted(results):
            if status == "fail":
                print(f"  {idx:02d} - {title}  ({detail})")
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
