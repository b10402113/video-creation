---
name: script-write
disable-model-invocation: true
description: >
  Write the narration script (逐字稿) for a knowledge video topic — produces script.md only.
  Plans a spoken hook, audience context, and a closing recap, then stops for
  script review before outline-write runs.
---

# script-write

Turn source material into a spoken narration script. This is the heaviest content-creation skill — every word spoken on screen lives in `script.md`. It owns the script and nothing else: write it, review it, then stop for the user. `outline-write` runs after and treats the (possibly user-edited) script as frozen input.

## Trigger

User says: "寫逐字稿", "開始 script", "write narration", "script-write"

## Inputs

| File | Source | Required |
|---|---|---|
| `topics/<topic>/source.md` | topic-init output | ✅ |
| `topics/<topic>/source-index.json` | topic-init output | ✅ |
| `topics/<topic>/styles/current/theme.json` | style-define output | ✅ |

Read all three before writing a single line.

## Output

| File | Purpose |
|---|---|
| `topics/<topic>/script.md` | Narration script — one paragraph per beat, beats separated by `---`, no chapter headings or anchors; frontmatter carries thesis/audience/viewer_shift/target_duration |

**`script.md` is this skill's only output. Do not write `outline.md` here** — that is `outline-write`'s job, run after the user has reviewed and edited the script.

## Required reading

**寫任何一行稿之前，先讀完這份：**

| File | Covers |
|---|---|
| [`script-style.md`](script-style.md) | 口播稿三條底線（資訊保留度 ≥ 60%、去 AI 味、保持原文語言）、口播八原則、去 AI 味五類、唸出來測試、落盤自檢 checklist |

Step 4 draws its rules from `script-style.md`. Its checklist is the source of truth — do not duplicate it here.

## Step Flow

### Step 1 — Read source.md completely

Read the entire `source.md`. Do not skim. Understand every section, every claim, every code example. Note which sections have strong material and which are thin.

If source.md is missing, **stop and ask** — do not fabricate material.

### Step 2 — Grill the user on the video's frame

Use the source and the user's direction to settle the video frame before building the arc. Use `grilling` when available and useful. If any decision materially affects the draft and is still unresolved, group the relevant questions in one round with source-based recommendations.

The frontier is the video's frame:

- **Thesis**: one sentence — what is this video fundamentally about?
- **Audience**: who is watching? (beginner, intermediate, practitioner)
- **Viewer shift**: what should the viewer know/believe/do after watching that they didn't before?
- **Duration**: `target_duration` in minutes.
- **Split**: ship as one video, or split the topic into multiple scripts?

Derive your **recommended answer** to every item from `source.md` before asking, and put the whole frontier in one round. The user's answers override the source-derived values; every beat later traces back to the settled thesis.

#### Deriving the duration recommendation

The source sets the clock — not a house target:

- Count the source's **substantive sections**: sections carrying a claim, example, or comparison worth explaining. Ignore boilerplate, filler, and tangential asides.
- Budget **~1–1.5 minutes per substantive section**.
- Budget time for the opening hook plus essential background, and for the closing recap. Size each to the audience and topic.
- Round to the nearest minute — that is your recommended `target_duration`.

A four-section source lands around 5–7 minutes; a twelve-section source around 14–18. If the estimate falls below ~3 minutes, the source is thin — say so; let the grill settle whether to expand the material or ship it short. If it exceeds the 450-line script limit, recommend splitting the topic into multiple scripts.

#### Completion

Carry the settled thesis, audience, viewer shift and target duration into `script.md` frontmatter. `outline-write` reads these values directly. The split determines how many scripts to produce.

### Step 3 — Build the narration arc

Construct the arc before writing any spoken text:

```
hook → context → core value and evidence → implications → recap → optional action
```

- **Hook**: open with a source-backed tension, surprising fact, concrete problem, or visible payoff. Aim for a first line that can be spoken in about three seconds. Use the available `hooks` skill to develop three distinct opening options for this video's audience, language, and topic. Use the user's selected line if provided. For a full-script request, carry the strongest supported option into the draft and show it with the alternatives at script review. A request for hook options alone follows `hooks` and ends with the choices. If `hooks` is unavailable, draft three distinct options locally using the same source and promise checks.
- **Context** (1–2 beats): immediately ground the hook in a concrete situation the intended viewer can picture. Give the prerequisites they need to follow the main explanation: what is happening, which term or object matters, and why it matters. End with the question or payoff the main section will answer. A short script can place the hook and context in one opening beat.
- **Core value** (3–6 beats): the main content, each beat = one idea, one claim, one handoff.
- **Evidence** (1–3 beats): code demos, comparisons, data — whatever supports the claims.
- **Implications** (0–2 beats): so what? why does this matter beyond the tutorial?
- **Recap** (1 beat): answer the opening question and synthesize the main takeaways in a few spoken sentences. Then add a concrete action only if it follows from the lesson. For a short script, the recap and action can share the same beat.

For each major teaching point, identify a source-backed example the viewer can observe: a physical part, an operation, a comparison, or a diagram that explains an otherwise invisible mechanism. Keep each beat a unit of spoken meaning. The storyboard can place several shots inside a beat. If the user chooses a writing voice, use the matching `tone` profile when available and preserve the topic's terminology and language.

Size the arc to the `target_duration` derived in Step 2 at ~160 words/min (Chinese) or ~150 words/min (English). The beat counts above describe a mid-length topic; a shorter source keeps the same arc shape with fewer core and evidence beats.

### Step 4 — Write script.md

Follow `script-style.md`. Its highest principle binds here: **資訊保留度 ≥ 60%**, verified in Step 5 by a reviewer comparing `script.md` against `source.md` one information unit at a time — never by character count. If the source cannot fit at 60%, stop and ask the user to lengthen or split — never silently compress to 30%. If the source exceeds the 450-line limit, split the topic per Step 2.

#### Frontmatter

```markdown
---
source: source.md
lang: zh-CN
target_duration: ~8 minutes
thesis: "<一句話論點>"
audience: "<受眾>"
viewer_shift: "<看完後該知道 / 相信 / 做什麼>"
---
```

`target_duration` is the estimate from Step 2 — not a fixed default. The last three fields are the Step 2 values, carried forward so `outline-write` can read them without re-deriving.

#### Beat structure

`script.md` is a flat sequence of beats separated by `---`. There are no chapter headings and no HTML anchors — chapter boundaries are `outline-write`'s decision, not the script's.

```markdown
Spoken paragraph one — one thought, concrete subject and verb.

---

Spoken paragraph two — transitions naturally from the previous beat.

---

Next idea starts here...
```

Each `---`-separated beat becomes one step line in `outline.md`, in order. The outline partitions the beats into chapters; a beat that enumerates or sequences elements may expand to several visual steps at chapter-build.

#### Beat address convention

- Format: `ch{NN}-s{SS}` — a **logical** address, not written into the script
- `NN` = two-digit chapter number (01, 02, ...), assigned by `outline-write`'s chapter split
- `SS` = two-digit beat number within that chapter (00, 01, ...)
- Downstream skills (`outline-write`, `make-components`, `chapter-build`) derive it from the outline partition + beat order to refer to a specific beat

#### Writing rules

Style (口語化 / 短句 / 去 AI 味 / 數字翻譯 / 具體例子) lives in `script-style.md`. These are the `script.md` structure rules on top of it:

1. **One thought per sentence.** No compound sentences joined by "and" that hold two distinct ideas.
2. **Concrete subjects and verbs.** "CSS Grid lets you define columns" not "Columns can be defined using CSS Grid."
3. **Spoken transitions.** Don't just jump topics — use phrases like "接下來", "所以我們來看看", "這就引出了下一個問題". The transition is part of the beat.
4. **Explain terminology at first use.** If a term appears for the first time, define it inline. Don't assume the viewer knows it.
5. **Preserve the beat's job.** Each beat from the source material has a purpose (claim, example, contrast). Keep that job — don't dilute it by cramming in extra ideas.
6. **One paragraph per beat.** Separate beats with `---`; each beat is one narration unit and one step line in the outline. chapter-build may split an enumerating beat into several visual steps. If the source holds genuinely separate ideas, give each its own beat.
7. **Handoff.** Each beat should end in a way that naturally leads to the next. The last sentence of a beat is the bridge.

#### Language handling

- Read `lang` from `theme.json`
- If `lang` is `zh-CN`:
  - Use Chinese punctuation: 「、」not "," — 「。」not "." — 「：」not ":"
  - Paragraph breaks with empty lines between beats
  - Colloquial but precise — write like you're explaining to a smart friend, not lecturing
- If `lang` is `en`:
  - Use English punctuation conventions
  - Active voice preferred
  - Short paragraphs, conversational tone
- Match the source material's language by default. If source is mixed, default to theme.json's lang.

#### Duration estimation

Write toward `target_duration`. The Step 5 reviewer estimates the finished script's spoken length by reading it — not by counting characters — and flags a miss beyond ~1 minute. If over, cut — don't compress. If under, the outline will guide where to expand.

#### File limit

Script.md must stay **under 450 lines**. If the topic requires more, split into multiple scripts and call script-write per segment.

### Step 5 — Self-check & reviewer

Run the 「跨階段硬性自檢協議」 from `quality-check/SKILL.md`: dispatch a **subagent reviewer** (if unavailable, strict self-review — never a glance) and give it **`script.md` and `source.md` together**, plus this checklist. The reviewer reads both files and returns pass/fail **per item with evidence** — every item below is judged by reading, not by character count.

**Review budget: one pass.** `script.md` gets one reviewer call, never more. After fixing all fail items, do **not** dispatch another reviewer to re-verify; the fix itself is the close-out. Re-opening a second review round is a violation of this step. (Contrast: `chapter-build/chapter-craft.md` allows up to two review rounds per chapter — that budget does not apply here.)

- Checklist — `script.md`: the checklist in `script-style.md`
- Cross-artifact checks (above and beyond the checklist):
  - [ ] Every claim in the script has support in source.md (no fabricated facts)
  - [ ] Every beat traces back to the thesis from Step 2
  - [ ] Each key concept has an observable example or a clear relationship that can be shown
  - [ ] Estimated spoken length matches `target_duration` from Step 2, within ~1 minute (reviewer's read-aloud estimate, not word count)
  - [ ] Beats are separated by `---`; no chapter headings, no HTML anchors, no orphan content
  - [ ] Language matches the source material (preserve source language)
  - [ ] Frontmatter carries thesis / audience / viewer_shift / target_duration
  - [ ] Script.md is under 450 lines

**拿到結論先改完所有 fail 項，再進 Step 6 匯報。** 直接拿原始結論匯報但不修復 = 違規。

### Step 6 — 🔴 HARD CHECKPOINT

**Stop. Do not proceed further.**

`script.md` is ready for human review. Present it with:

```
script.md is written. Please review and edit it directly:

1. Open script.md and read it aloud (or have TTS read it)
2. Check whether the hook earns attention, the context prepares the intended viewer, and the ending answers the opening question and recaps the lesson
3. Check duration: does the estimated time feel right?
4. Check tone: does it sound like the voice you want?

Edit script.md however you like. When you're happy with it, run /outline-write.

outline-write treats your edited script.md as frozen — it never modifies a word.
```

**Do not write `outline.md`, and do not proceed to `outline-write` or any other skill, until the user explicitly confirms.**

**Handoff contract**: the user may edit `script.md` after this checkpoint. Whatever is on disk when the user confirms is the frozen source of truth for `outline-write`. Do not carry an in-memory version of the script across the checkpoint — re-read from disk downstream.
