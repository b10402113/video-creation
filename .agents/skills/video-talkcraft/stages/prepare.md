# prepare

1. Run `python3.11 .agents/skills/video-talkcraft/tools/resolve-project.py "<project>" --prepare` (include `--out` if supplied). It imports MP3 or WAV and `words.json`, or reuses matching inputs. Record the input hashes, output location and imported timing in the handoff. Use the existing recording and timings.
2. List usable styles from `design/<id>/design.md` and `theme.json`. Show the currently saved style and any requested `--design` as options. **Ask the user which style to use**, even if an existing project has a saved style. An explicit selection for the current prepare run satisfies the question. If the user has yet to choose, mark `awaiting user` and stop.
3. Once chosen, read that design's `design.md` and run `node .agents/skills/video-talkcraft/tools/select-design.mjs "<out>" "<id>"`. On resume, keep a matching saved snapshot unless the user asks to refresh it. Confirm the selected design and imported artifacts exist and mark `prepare` complete.
4. End with **下一步** and `$video-talkcraft <project> assets` in a new chat. While waiting, the next action is to reply with a style choice.

## New design

For `--new-design <id> --reference <url-or-video>` or a written brief, create `design/<id>/design.md` and `theme.json`. Use the workspace's `screen_youtube` module or the local clip to save representative frames and timestamps under `design/<id>/reference/`. Keep reference timestamps separate from narration cues. Use [gary-chen](../../../../design/gary-chen/design.md) as the format example. Validate the new design via `select-design.mjs`, rebuild the index with `node .agents/skills/video-talkcraft/tools/build-library.mjs`, and record the user's selection in the handoff.
