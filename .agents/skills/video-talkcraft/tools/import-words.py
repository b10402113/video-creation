#!/usr/bin/env python3
"""Import existing millisecond timings without touching the source audio or rerunning ASR."""
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'video-talkcraft/scripts'))
from make_timing import make_timing_data, normalized_text

def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def split_auto(tokens, max_chars=24):
    chunks, current = [], []
    for i, w in enumerate(tokens):
        current.append(w)
        text = w['text']
        nxt = tokens[i + 1] if i + 1 < len(tokens) else None
        size = sum(len(x['text']) for x in current)
        boundary = bool(re.search(r'[。！？；，、：!?;]$', text))
        if nxt:
            boundary |= nxt['start'] - w['end'] >= .35
            latin_word = bool(re.search(r'[A-Za-z0-9]$', text) and re.match(r'[A-Za-z0-9]', nxt['text']) and nxt['start'] - w['end'] < .08)
            boundary |= size >= max_chars and not latin_word
        if boundary or not nxt:
            chunks.append((''.join(x['text'] for x in current), current))
            current = []
    return chunks

def split_script(tokens, script):
    lines = [x.strip() for x in script.splitlines() if normalized_text(x)]
    if ''.join(map(normalized_text, lines)) != ''.join(normalized_text(x['text']) for x in tokens):
        raise ValueError('Sentence file does not match timed text after punctuation, width and case normalization')
    cursor = 0
    chunks = []
    for line in lines:
        remaining = len(normalized_text(line))
        start = cursor
        while remaining > 0:
            remaining -= len(normalized_text(tokens[cursor]['text']))
            cursor += 1
        if remaining < 0:
            raise ValueError(f'Sentence line splits one timed token: {line}')
        while cursor < len(tokens) and not normalized_text(tokens[cursor]['text']):
            cursor += 1
        chunks.append((line, tokens[start:cursor]))
    return chunks

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('words', type=Path)
    p.add_argument('audio', type=Path)
    p.add_argument('out', type=Path)
    p.add_argument('--sentences', type=Path, help='Optional verbatim text, one caption/semantic unit per line')
    p.add_argument('--tail-tolerance-ms', type=float, default=150)
    args = p.parse_args()
    raw = json.loads(args.words.read_text(encoding='utf-8'))
    if args.audio.suffix.lower() not in ('.mp3', '.wav'):
        p.error('audio must be MP3 or WAV')
    probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','a:0','-show_entries',
        'stream=sample_rate:format=duration','-of','json',str(args.audio)], text=True))
    actual = float(probe['format']['duration'])
    if not math.isfinite(actual) or actual <= 0 or not math.isfinite(args.tail_tolerance_ms) or args.tail_tolerance_ms < 0:
        p.error('invalid audio duration or tolerance')
    source_duration = raw.get('durationMs')
    if source_duration is not None and (not isinstance(source_duration, (int, float)) or
        not math.isfinite(source_duration) or abs(source_duration - actual * 1000) > args.tail_tolerance_ms):
        p.error(f'timing duration {source_duration}ms does not match the actual audio {actual * 1000:.1f}ms')
    total = round(actual, 3)
    tokens = []
    previous = -1
    for i, w in enumerate(raw['words']):
        text = w.get('text')
        a, b = (w.get(k) for k in ('startMs','endMs'))
        if (not isinstance(text, str) or not text.strip() or not all(isinstance(v, (float,int)) and not isinstance(v,bool)
            and math.isfinite(v) for v in (a,b)) or not 0 <= a <= b <= actual * 1000 + args.tail_tolerance_ms or a < previous):
            p.error(f'invalid or unordered timing at words[{i}]')
        previous = a
        tokens.append({'text':text,'start':round(min(a / 1000,total),3),'end':round(min(b / 1000,total),3)})
    if not any(normalized_text(x['text']) for x in tokens):
        p.error('words file is empty')
    chunks = split_script(tokens, args.sentences.read_text(encoding='utf-8')) if args.sentences else split_auto(tokens)
    chunks = [(txt, words) for txt, words in chunks if normalized_text(txt)]
    sentences = [{'i':i,'text':txt,'start':words[0]['start'],'end':max(x['end'] for x in words),
                  'match':1.0,'ok':True,'words':words} for i,(txt,words) in enumerate(chunks)]
    aligned = {'sr':int(probe['streams'][0]['sample_rate']),'total':total,
               'source':'imported word timing (match is text coverage, not ASR confidence)','sentences':sentences}
    audio_name = 'full' + args.audio.suffix.lower()
    for folder in ('audio','remotion/public'):
        dest = args.out / folder / audio_name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if args.audio.resolve() != dest.resolve():
            if dest.exists() and dest.read_bytes() != args.audio.read_bytes():
                p.error(f'{dest} already contains different audio; use a new output directory')
            if not dest.exists():
                shutil.copyfile(args.audio, dest)
    save(args.out / 'audio/timestamps.json', aligned)
    save(args.out / 'remotion/src/timing.json', make_timing_data(aligned))
    save(args.out / 'script.json', {'sentences':[x['text'] for x in sentences]})
    print(f'Imported {len(tokens)} tokens, {len(sentences)} captions, {total:.3f}s. Original audio unchanged.')

if __name__ == '__main__':
    main()
