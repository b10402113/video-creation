#!/usr/bin/env python3
"""Locate a Talkcraft project's word timing and narration, and optionally import them."""
import argparse
import filecmp
import json
import subprocess
import sys
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parents[4]
TOOLS = Path(__file__).resolve().parent
AUDIO_EXTENSIONS = {'.mp3', '.wav'}


def locate_project(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = WORKSPACE / (Path('projects') / path if len(path.parts) == 1 else path)
    path = path.resolve()
    if not path.is_dir():
        raise ValueError(f'找不到專案資料夾：{path}')
    return path


def locate_inputs(project):
    # A central audio/ pair takes priority over loose files in the project root.
    words = next((path for path in (project / 'audio/words.json', project / 'words.json') if path.is_file()), None)
    if words is None:
        raise ValueError(f'找不到 {project}/audio/words.json 或 {project}/words.json')
    timing = json.loads(words.read_text(encoding='utf-8'))
    if not isinstance(timing, dict) or not isinstance(timing.get('words'), list) or not timing['words']:
        raise ValueError(f'{words} 缺少字級時間資料（words）')
    declared = timing.get('audio')
    if isinstance(declared, str) and declared.strip():
        hint = Path(declared)
        for candidate in (project / hint, words.parent / hint):
            if (candidate.suffix.lower() in AUDIO_EXTENSIONS and candidate.is_file()
                    and candidate.resolve().is_relative_to(project)):
                return words, candidate.resolve()
    for folder in dict.fromkeys((words.parent, project / 'audio', project)):
        if not folder.is_dir():
            continue
        candidates = sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS)
        if len(candidates) == 1:
            return words, candidates[0].resolve()
        if candidates:
            names = ', '.join(p.name for p in candidates)
            raise ValueError(f'{folder} 有多個音檔（{names}）。請在 {words.name} 的 audio 欄指定旁白檔。')
    raise ValueError(f'找不到 {project} 的 MP3 或 WAV 配音')


def prepare(words, audio, output):
    timestamp_file = output / 'audio/timestamps.json'
    derived = [timestamp_file, output / 'remotion/src/timing.json', output / 'script.json']
    copies = [output / folder / ('full' + audio.suffix.lower()) for folder in ('audio', 'remotion/public')]
    if all(path.is_file() for path in derived + copies):
        raw = json.loads(words.read_text(encoding='utf-8'))
        imported = json.loads(timestamp_file.read_text(encoding='utf-8'))
        # The importer rounds to milliseconds and clamps to the probed audio duration.
        duration = imported['total']
        meaningful = lambda s: any(ch.isalnum() for ch in s)
        input_tokens = [
            (w['text'], round(min(w['startMs'] / 1000, duration), 3), round(min(w['endMs'] / 1000, duration), 3))
            for w in raw['words'] if meaningful(w['text'])
        ]
        output_tokens = [
            (w['text'], w['start'], w['end'])
            for sentence in imported['sentences'] for w in sentence['words'] if meaningful(w['text'])
        ]
        same_audio = all(filecmp.cmp(audio, copy, shallow=False) for copy in copies)
        if input_tokens != output_tokens or not same_audio:
            raise ValueError(f'現有專案 {output} 的匯入資料與目前輸入不同，請指定新的 --out 資料夾。')
        return 'reused'
    if any(path.exists() for path in derived) or (output / 'remotion/src/entry.ts').exists() or (output / 'SHOTBOOK.md').exists():
        raise ValueError(f'{output} 已有影片或部分匯入資料，請修復現有匯入或指定新的 --out 資料夾。')
    command = [sys.executable, str(TOOLS / 'import-words.py'), str(words), str(audio), str(output)]
    subprocess.run(command, check=True, stdout=sys.stderr)
    return 'imported'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project', help='Project name in projects/, or a workspace-relative or absolute path')
    parser.add_argument('--out', type=Path, help='Override the Talkcraft output directory (default: PROJECT/talkcraft-remake)')
    parser.add_argument('--prepare', action='store_true', help='Import narration and timings when the project is new')
    args = parser.parse_args()
    try:
        project = locate_project(args.project)
        words, audio = locate_inputs(project)
        output = (WORKSPACE / args.out).resolve() if args.out else project / 'talkcraft-remake'
        result = {
            'project': str(project), 'audio': str(audio), 'words': str(words), 'out': str(output),
            'status': prepare(words, audio, output) if args.prepare else 'located',
        }
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        parser.exit(2, f'Talkcraft: {error}\n')


if __name__ == '__main__':
    main()
