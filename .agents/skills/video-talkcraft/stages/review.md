# review

Run only when the user explicitly requests `$video-talkcraft <project> review` or expressly asks to continue with review. Require completed scene integration from `render`, the approved preview basis, and all shot IDs registered in `SCENES` and `SCENE_PARAMS`.

## Resume the integrated version

Read `talkcraft-handoff.md`, the approved SHOTBOOK, and the integrated scene registry. Compare files with the recorded integration hashes. For an older project without a review checkpoint, inspect the existing scenes and artifacts and record the actual starting state. Reuse completed scenes, generation drafts, rendered segments, and audio caches when their inputs still match. Verify integration changes and record the current version before review. Return incomplete scene generation to `render` with its existing generator option.

## Render and review

1. Read [workflow](../video-talkcraft/WORKFLOW.md) sections ⑥⑦ and ⑧ as needed, and [review protocol](../video-talkcraft/references/review-protocol.md). An explicit `review` request selects whole-film rendering and review unless the user asks for shot-by-shot review.
2. Render the integrated segments and full narration mix, assemble the film, and check frame count, duration, motion, audio, and the workbench contract. Prepare the protocol's review materials and perform one independent visual review, using its delegation rules. Fix P0/P1 findings and rerender affected shots and adjacent transitions.
3. Master the audio, rerun delivery checks, and record the verified voiced MP4, reports, any remaining P2 findings, and final hashes in the handoff. Mark `review` complete only when required checks and corrections are complete. If interrupted, record the precise remaining work and resume this stage from existing artifacts.

Review corrections to generated scenes are part of this stage. Changes that materially affect the approved SHOTBOOK or sample return to `preview`. Preserve the prior generator and API authorization scope when a correction requires regenerating a shot.

Return the verified voiced MP4, `SHOTBOOK.md`, and live workbench link when available, with unresolved limitations. End with **下一步**, state production is complete, and give `$video-talkcraft <project> preview` for requested storyboard or sample revisions. If blocked, describe the blocker and give `$video-talkcraft <project> review` with the same `--out` option. Additional review rounds require a new user request.
