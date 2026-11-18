// 自动生成，勿手改：node scripts/gen-index.mjs
// 接入的口播成片工程元数据：按本机 kbsrc 链接生成（不进库）
export const KB_LINKED = true;
/** 工程目录名 / 绝对路径（仅本机显示用） */
export const KB_PROJECT = "talkcraft-remake";
export const KB_PROJECT_ROOT = "/Users/andycheng0804/Desktop/Notes/srt-to-video/video-project/projects/stock-volume/talkcraft-remake";
/** 契约模块（kbsrc-stub 每个文件）→ 接入工程是否有同名真实文件；false 的走 stub */
export const KB_MODULES: Record<string, boolean> = {"cards/pencil-sketch-draw":false,"scenes/index":true,"Environment":true,"PromoScenes":false,"MainVideo":false,"Subtitles":true,"longtake":false,"camera":true,"params":true,"timing":true,"shots":true,"theme":true,"Host":false,"Main":true,"sfx":true};
/** 拆解契约（promo 形态：PromoScenes / camera / Host / Environment / timing 全为真实文件） */
export const KB_PROMO = false;
/** 拆解契约（skill 标准形态：shots / scenes/index / Subtitles / sfx / timing / camera 全为真实文件） */
export const KB_SKILL = true;
export const KB_FORM: "promo" | "skill" | "none" = "skill";
/** 任一拆解契约成立 → 素材库「拆解导入」可用 */
export const KB_DECOMPOSABLE = true;
/** skill 标准形态的转场标记（beats.json 的 tr-* 事件；promo 形态为空，看 WIPE_TIMES） */
export const KB_TRANSITIONS: { t: number; label: string }[] = [];
/** 工程主合成模块名（Main.tsx → "Main"，MainVideo.tsx → "MainVideo"，没有则 null） */
export const KB_MAIN: "Main" | "MainVideo" | null = "Main";
/** 主合成源文件的真实绝对路径（kb-main 载入失败后经 /@fs 直连重试用；未链接为 null） */
export const KB_MAIN_FILE: string | null = "/Users/andycheng0804/Desktop/Notes/srt-to-video/video-project/projects/stock-volume/talkcraft-remake/remotion/src/Main.tsx";
/** 合成规格（Root.tsx 字面量；抓不到时 1920×1080@30） */
export const KB_COMP: { id: string; width: number; height: number; fps: number } = {"id":"StockVolume","width":1920,"height":1080,"fps":30};
/** 换幕（shape wipe）峰值时刻（秒）；来源：none */
export const WIPE_TIMES: number[] = [];
export const WIPE_SOURCE: "export" | "inline" | "beats" | "none" = "none";
