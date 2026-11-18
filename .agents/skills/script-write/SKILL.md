---
name: script-write
description: Turn a Talkcraft project's source files into a spoken narration script. Use for 逐字稿、寫口播稿、write narration, or script-write with a topic or project directory.
---

# script-write

1. Resolve a bare topic name under `projects/<topic>/`. Also accept a workspace-relative or absolute project directory. Read the relevant files under its `source/`, in the order requested by the user. Save any source supplied directly in the chat to that folder first. Where a project has no usable source, ask for the missing material.
2. Read [script-style.md](script-style.md). Use the user's audience, language, duration and framing when supplied. Otherwise infer them from the source. If the source is already a narration draft, retain the author's voice and requested details while adapting it for speech. Remove headings, time ranges and formatting that should stay off the audio track.
3. Write `script.md` in the project directory. Open on a concrete question or example, explain terms in context, then close by answering the opening question. Keep technical caveats and the reasoning behind them. Each beat is one spoken paragraph, separated by a standalone `---`. Use frontmatter like this:

    ```yaml
    ---
    source: source/notes.md
    lang: zh-TW
    target_duration: "~5 minutes"
    thesis: "這支影片要說清楚的一個觀點"
    audience: "誰會看這支影片"
    viewer_shift: "看完後能理解或做什麼"
    ---
    ```

    For multiple inputs, use a list for `source`. Keep media directions and commentary outside the spoken paragraphs.
4. Compare the finished script with the source. Check that examples, key numbers, conditions and exceptions survived, and that the pacing suits the requested length. Correct mismatches before handing it off.

For a script-only request, deliver `script.md`. If the user also asks for generated narration and timestamps, hand the saved script directly to [voice](../voice/SKILL.md). Start Talkcraft's `prepare` stage when requested.
