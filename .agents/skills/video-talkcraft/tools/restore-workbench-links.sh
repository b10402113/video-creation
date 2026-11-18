#!/usr/bin/env bash
set -euo pipefail
WB="$(cd "$(dirname "$0")/../video-talkcraft/workbench" && pwd)"
for pair in 'tplcards:../template/cards' 'public/cardpreviews:../../gallery/media' 'public/cardthumbs:../../gallery/thumbs'; do
  path="${pair%%:*}"
  target="${pair#*:}"
  if [[ -L "$WB/$path" && "$(readlink "$WB/$path")" == "$target" ]]; then continue; fi
  if [[ ! -f "$WB/$path" || "$(cat "$WB/$path")" != "$target" ]]; then
    echo "Unexpected workbench asset: $path" >&2
    exit 1
  fi
  [[ "$path" == public/cardpreviews || -d "$(dirname "$WB/$path")/$target" ]]
  rm "$WB/$path"
  ln -s "$target" "$WB/$path"
done
