# preview

Require completed `assets` and its verified handoff. If missing, give the prerequisite command and stop.

For motion or diagram selection, search the 動畫 and 共用元件 categories in [library.html](../library.html) across all sources. Check each entry's format: TSX cards can be reused directly; HTML/GSAP sources follow the [adaptation guide](../references/robonuggets-animate.md) for frame-driven Remotion use. Retain the selected Design.

1. Read [workflow](../video-talkcraft/WORKFLOW.md) sections ④ and ⑤, plus ⓪ for runtime setup when needed. Write the complete `SHOTBOOK.md`, align shot IDs and word cues, and run the storyboard checks. Build the Remotion composition skeleton and shared systems. Implement only the sample shot named in SHOTBOOK G0 (usually s01). Render it with sound using section ⑤-1 and surface the workbench when available.
2. Deliver links to the voiced sample MP4 and `SHOTBOOK.md` together. Label the review version (for example, `v1`). Record the paths and SHA-256 of both files and the design snapshot in the handoff, clear any earlier approval and mark `preview` as `awaiting user`. Ask the user to reply with explicit approval of that version or with changes. Stop before implementing the remaining shots.
3. When resuming with feedback, apply it, rerender the sample, and show the updated version for approval. When resuming with explicit approval, verify that the current hashes match the version shown, then record the user's approval and mark `preview` complete. If they differ, show the updated deliverables for approval first.

While waiting, end with **下一步** and tell the user how to approve or request changes. After recording approval, give `$video-talkcraft <project> render` for a new chat.
