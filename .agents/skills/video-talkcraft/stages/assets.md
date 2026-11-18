# assets

Require completed `prepare` and the imported timing and confirmed design snapshot. If missing, give the `prepare` command and stop.

1. Read [workflow](../video-talkcraft/WORKFLOW.md) sections ②-1 and ③. Annotate the narration with its semantic role, emphasis, entities, and visual needs. Use the imported word timings for cues. Leave shot assignment and sync for `preview`.
2. Search the [library](../library.html) 圖片素材 tab or `image-library/entries/` by subject, project, design, category, or tag. In `assets.json`, reuse images with `{id, libraryId}`. For new illustrations use `{id, prompt, category, tags}` under `images` and a shared `style` string. Run `node .agents/skills/video-talkcraft/tools/generate-assets.mjs "<out>"` to copy or generate WebP images and record provenance in the shared library and project ledger. For older projects, `sync-image-library.mjs "<out>"` imports existing ledger entries into the shared library.
   Find icons in 圖片素材 and other reusable assets in 動畫、共用元件、音效、3D 模型、影片素材 in the same library. Imported images use the same `{id, libraryId}` format and copy command as other images; original SVGs remain linked on each card. Retain entry provenance when copying. For HTML/GSAP adaptation or source licenses, read the [source guide](../references/robonuggets-animate.md).
3. Capture real UI, source quotes and factual charts from their sources and register them in `sources.md`. Use generated art for illustrations and labeled mockups. Verify media with the section ③ checks. Record material gaps with affected narration sections and mark the stage complete when the required artifacts and media checks are ready.

End with **下一步** and `$video-talkcraft <project> preview` in a new chat. If blocked, say what to resolve and give the command to resume `assets`.
