# render

Require completed `preview` with explicit approval in the handoff. Recompute the recorded hashes for the reviewed SHOTBOOK, sample MP4 and design snapshot before touching the remaining shots. If approval is missing or the reviewed version changed, give `$video-talkcraft <project> preview` and stop. A render command by itself does not approve the preview.

## Select a generator

- `$video-talkcraft <project> render` uses the main agent to implement the remaining shots.
- `$video-talkcraft <project> render --generator cli` uses the local LLM request runner.
- `$video-talkcraft <project> render --generator subagent` delegates groups to parallel Codex subagents.

For `cli` or `subagent`, follow [shot generation](shot-generation.md) for jobs, staging and integration. The main agent owns approval verification, scene integration, and the checkpoint in all modes.

## Generate and merge

1. Read [workflow](../video-talkcraft/WORKFLOW.md) section ⑤ for implementation and workbench integration. Implement the remaining shots from the approved SHOTBOOK and sample. Reuse completed scenes and matching cached drafts. If a material change to the approved SHOTBOOK or sample becomes necessary, return to `preview` for new approval.
2. Check the generated modules' exports, imports, local asset paths, and timing conventions. Merge scenes into `remotion/src/scenes/`, register every shot in `SCENES` and `SCENE_PARAMS`, and integrate shared assets and SFX centrally. Preserve the approved sample.
3. Run the project's TypeScript check and `workbench_contract_lint.py <out>` with all shots implemented. Fix integration or compilation errors within this stage. Record any visual questions for `review`.

## Review checkpoint

The completion condition is all scene code merged into the composition and the integration checks passing. Stop here. Full-film MP4 encoding and mixing, frame extraction, visual pre-review, review subagents, motion/audio QA, quality revisions, mastering, and final delivery run in the separate [review stage](review.md) after the user requests it.

Record the generator, completed/remaining shot IDs, staged and integrated paths, static check results, and SHA-256 hashes of the integrated scenes and shared composition files in `talkcraft-handoff.md`. Mark `render` complete and `review` pending. An existing MP4 may be linked as an earlier artifact with its actual verification state.

Return links to the integrated scene registry, `SHOTBOOK.md`, and the workbench when available. State that scene integration is complete and review is pending. End with **下一步** and `$video-talkcraft <project> review` in a new chat, retaining any `--out` option. If integration is blocked, give the render command with the same generator and output options.
