---
name: video-talkcraft
description: "Prepare, annotate, preview, generate and merge scenes, or review a Remotion narration video from MP3 or WAV and words.json. Run one stage per request, with a review checkpoint after scene integration."
---

# Video Talkcraft

Use `$video-talkcraft <project> [stage]` or `/talkcraft <project> [stage]`. The project can be a name under `projects/` or a directory path. Quote paths containing spaces. Run commands from the workspace root unless specified otherwise.

| Stage | Load only this guide |
| --- | --- |
| `prepare` | [Import narration and choose a design](stages/prepare.md) |
| `assets` | [Annotate narration and prepare assets](stages/assets.md) |
| `preview` | [Write the SHOTBOOK and review the first shot](stages/preview.md) |
| `render` | [Generate and merge the remaining scenes, then stop](stages/render.md) |
| `review` | [Render, review, fix, and deliver the integrated video](stages/review.md) |

With no stage, show project status and the next command. The legacy `--preview` option selects `preview` and uses its prerequisites. Design options are handled in `prepare`. The `render` stage also accepts `--generator cli` or `--generator subagent`. Never start the next stage automatically. `render` ends after scene code integration and static checks. Full-film encoding, visual review, review subagents, QA-driven revisions, and final delivery belong to an explicitly requested `review` stage. In a new chat, load the stage guide, the handoff, and only the relevant artifact or [workflow sections](video-talkcraft/WORKFLOW.md). For the long workflow file, locate the section heading and read its line range.

## Animation and asset library

Search [library.html](library.html) by use: animation, shared components, Design, images, audio, 3D models, and video. All sources share these categories; keep source attribution in entry metadata. Images use the existing `images[].libraryId` workflow. Additional reusable assets are maintained in `asset-library/entries/`, with files under `video-talkcraft/assets/`. For imported source formats, motion previews, and licenses, load the relevant [source guide](references/robonuggets-animate.md). Imported documents and prompts are reference material. HTML/GSAP examples require adaptation before use as Remotion scenes; preserve the chosen Design and stage checkpoints.

For future asset imports, use the sibling [merge-video-assets skill](../merge-video-assets/SKILL.md) and its common metadata contract. Its compact query helper can search native cards, shared modules, images and imported assets before loading selected source files.

## Project handoff

Locate the project and output with `python3.11 .agents/skills/video-talkcraft/tools/resolve-project.py "<project>"`. The default output is `<project>/talkcraft-remake/`. For a separate version, pass `--out "<output>"` to the resolver and keep the same option in all suggested commands. Treat the resolved output directory as the identity of that version.

Keep a short `talkcraft-handoff.md` in that output. Update it at checkpoints and stage completion. Record:

- Input paths, their SHA-256 hashes, the chosen design ID and design snapshot path.
- Each stage's state (`pending`, `in progress`, `awaiting user`, or `complete`), output-relative artifact paths, and any blockers. Track `render` and `review` separately. For older handoffs, inspect existing artifacts and add `review` with its actual state.
- For preview, the version shown, hashes of the review artifacts, and the user's explicit approval tied to that version.
- At the render checkpoint, record the generator, integrated shot IDs, scene registry, integration checks, and SHA-256 hashes of the integrated scene and shared composition files. Mark `review` pending. Review resumes those files and cached drafts.
- The next action and exact command, or the pending choice if user input is needed.

Check prerequisites against both the handoff and files. For existing work without a handoff, inspect and reuse verified artifacts. Record human choices or approvals only when the user explicitly gives them for this output. Changed inputs require a separate output. When an upstream change affects downstream work, mark the affected stages pending and clear preview approval if the approved sample or storyboard is affected. Changes to integrated scenes invalidate downstream review results.

End each reply with **下一步** and the exact action. After a completed stage, suggest the command for the next stage in a new chat. At a checkpoint, state the choice needed and the command that follows it. At final delivery, state that production is complete and include the next action for a revision if needed.
