# Parallel shot generation

Run this only after the render guide verifies the approved preview. The main agent owns the timeline and integration. Use the output directory resolved for this project version throughout.

## Prepare the jobs

1. Compare the approved SHOTBOOK and `remotion/shots.json` with the existing scene registry. Keep the approved sample and any completed scenes. Identify the remaining shot IDs and group adjacent shots that share movement, layout, or a transition.
2. Write `shot-generation/jobs.json` under the output directory. Use this shape:

   ```json
   {
     "previewVersion": "v1-<approved storyboard hash>-<approved sample hash>-<approved design hash>",
     "sampleShot": "s01",
     "sharedContext": "<approved design rules, short approved sample excerpt, component imports/interfaces, and timing conventions>",
     "shots": [
       {"id": "s02", "brief": "<SHOTBOOK direction, exact frame range and cue anchors, narration excerpt, local asset IDs and adjacent transition constraints>"}
     ]
   }
   ```

   Use the actual approved sample ID. List any allowed shared components with their real prop signatures. Prepare missing common prerequisites before dispatch. Scope the brief to what that shot needs. For CLI keep shared context small: send only the theme tokens, exact Shot/ParamField interfaces, timing rules, and a short sample excerpt illustrating the lead/cue conversion. Put source caveats and asset coordinates in the relevant shot only. For CLI, include only material intended for the configured model endpoint. Never include secrets or the contents of `.env`.
3. Each job produces an editable `<id>.tsx` targeting `remotion/src/scenes/`, with a named component such as `S02` and an exported `PARAMS` declaration. Timing, shared subtitles, and global audio remain composition-owned. If a shot needs a shared asset registration or cue, tell the main agent to add it.

## CLI mode

From the workspace root:

```sh
node .agents/skills/video-talkcraft/tools/generate-shots.mjs "<out>" "<out>/shot-generation/jobs.json"
```

The CLI loads the workspace `.env` using the existing environment loader and calls `BASE_URL/chat/completions` with `VIDEO_MODEL`. It uses `TEXT_API_KEY` or `OPENAI_API_KEY` for bearer auth. Use an OpenAI-compatible API base, including its version path if the provider requires one. Existing environment values take precedence, as in the workspace text tools.

Run the same command with `--record-only` to inspect the endpoint and exact JSON bodies before any network requests. Use the already authorized destination and data scope. Each invocation writes `shot-generation/cli-audit/<run-id>/`. `run.json` lists the arguments, endpoint, model, and selected shots. Each `sNN.request.json` holds the exact UTF-8 POST body. Each `sNN.status.json` tells whether the request was recorded only, reused from cache, generated, or failed. Per-attempt files record latency, HTTP or network status, and the token counts the provider returns. Null usage means the provider supplied no count. Request bodies include project data; keep the audit local. It contains no authentication headers or keys.

When the user asks to see CLI inputs, deliver one readable JSON file per shot (`sNN.json`) and an index linking to those files. Decode the nested user message into fields such as `timing`, `sharedContext`, and `brief`. Put initial and revised requests for that shot in chronological order in a `requests` array. Preserve the exact serialized bodies in the audit and label reconstructed historical requests as such.

The CLI runs up to three shots concurrently by default and stages drafts under `shot-generation/cli/`. It retries transient errors once. When several requests time out or rate-limit, resume missing shots with fewer workers instead of resubmitting the whole batch at higher concurrency. It reports each draft path and exits nonzero if any job fails. Reuse drafts by rerunning with the same manifest and settings. Use `--parallel <n>` for concurrency, `--only s02 --only s03` to select a subset, or `--only s02 --retry s02` to regenerate a rejected draft. To include review feedback, update that shot's brief. Unchanged shots retain their cache keys. A staged file is a draft until the main agent checks and integrates it. Visual quality review runs in the separate `review` stage.

## Subagent mode

Use the current chat's subagent tool. Start up to three workers, bounded by the available slots. Assign disjoint shot groups and give each worker the job details, the approved sample path, and the relevant component references. Avoid passing the whole conversation when scoped context is sufficient.

Give each group its own scratch directory under `shot-generation/subagent/<approved-version>/<group>/`. Workers write only their assigned TSX drafts there. They may inspect the project and validate their own candidates without changing the shared composition. Ask them to return the completed IDs, file paths, validation results, and shared changes needed. The main agent records accepted IDs against the approved version and their job inputs so a resumed run can reuse matching work. Redispatch rejected or missing shots only. If subagent tools are unavailable, report that and give the CLI command as a next action if the user wants to switch generators.

## Integrate and stop

1. The main agent checks each draft's required exports, imports, asset paths, and deterministic timing against the approved interfaces and cue conventions. Merge accepted scenes, register them in timeline order in `SCENES` and `SCENE_PARAMS`, and apply any shared SFX or asset entries centrally. Preserve the approved sample. If the approved basis needs a material change, resume `preview`.
2. Run TypeScript and the workbench contract checks. Fix integration errors, then stop at the render checkpoint. Full-film encoding, frame extraction, visual review, and QA-driven changes belong to the explicitly requested [review stage](review.md).
3. Record generation mode, completed/remaining IDs, draft and integrated paths, checks, and integration hashes in the handoff. Mark `render` complete and `review` pending once integration passes. Track generation and integration time separately from later review and encoding.
