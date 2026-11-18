#!/usr/bin/env python3
"""Copy an asset file/directory/ZIP into an inert staging directory; never run source code."""
import argparse, hashlib, json, shutil, stat, tempfile, zipfile
from pathlib import Path, PurePosixPath

IGNORE = {'.git', 'node_modules', '__MACOSX', '.DS_Store', '.env', '.aws', '.ssh'}

def permitted(parts):
    return not any(p in IGNORE or p.startswith('.env.') for p in parts)

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source', type=Path)
    ap.add_argument('--out', type=Path)
    ap.add_argument('--subdir', default='')
    args = ap.parse_args()
    source = args.source.expanduser().resolve()
    out = args.out.resolve() if args.out else Path(tempfile.mkdtemp(prefix='talkcraft-assets-')) / 'source'
    if out.exists():
        raise ValueError('Output must be a new directory')
    if source.is_dir() and (out == source or source in out.parents):
        raise ValueError('Output cannot be inside source')
    staged = []
    def put(relative, data):
        if relative.name == 'SKILL.md':
            relative = relative.with_name('SOURCE-SKILL.md')
        target = out / relative
        if target.exists():
            raise ValueError(f'Path collision after renaming: {relative}')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        staged.append({'path':relative.as_posix(), 'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()})
    if source.suffix.lower() == '.zip':
        prefix = PurePosixPath(args.subdir)
        if prefix.is_absolute() or '..' in prefix.parts:
            raise ValueError('Invalid subdir')
        with zipfile.ZipFile(source) as archive:
            # Validate the entire central directory before writing any member.
            for info in archive.infolist():
                p = PurePosixPath(info.filename)
                if p.is_absolute() or '..' in p.parts or '\\' in info.filename or stat.S_ISLNK(info.external_attr >> 16):
                    raise ValueError(f'Unsafe archive member: {info.filename}')
            for info in archive.infolist():
                if info.is_dir():
                    continue
                p = PurePosixPath(info.filename)
                if args.subdir:
                    try:
                        p = p.relative_to(prefix)
                    except ValueError:
                        continue
                if permitted(p.parts):
                    put(p, archive.read(info))
    elif source.is_dir():
        if args.subdir:
            sub = (source / args.subdir).resolve()
            if source not in sub.parents:
                raise ValueError('Subdir must be inside source')
            source = sub
        for p in sorted(source.rglob('*')):
            relative = p.relative_to(source)
            if not permitted(relative.parts):
                continue
            if p.is_symlink():
                raise ValueError(f'Symlink requires an explicit local copy: {relative}')
            if p.is_file():
                put(PurePosixPath(relative.as_posix()), p.read_bytes())
    elif source.is_file():
        if args.subdir:
            raise ValueError('subdir is only for directories or ZIPs')
        put(PurePosixPath(source.name), source.read_bytes())
    else:
        raise ValueError('Source does not exist')
    if not staged:
        raise ValueError('No usable files found')
    print(json.dumps({'sourceRoot':str(out), 'fileCount':len(staged), 'files':staged}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
