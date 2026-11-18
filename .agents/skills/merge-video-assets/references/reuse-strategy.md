# Formats, token cost and the original Talkcraft workflow

## Keep media formats; standardize the interface

| Asset | Low-effort storage | Work needed for Remotion |
| --- | --- | --- |
| Image / icon | Working WebP plus original SVG/PNG | Copy file; reference with `staticFile()` or use SVG directly |
| Footage / B-roll | Original video, including alpha when present | Check codec, aspect and fps; place as media; transcode only when needed |
| SFX / music | Original WAV/MP3/etc. | Check decode and gain; add composition-owned cues |
| GLB / model | Original model plus textures | Use an existing Three/Remotion bridge or a clearly labeled rendered clip |
| Existing Remotion card | TSX, props/CONFIG, usage guide | Copy to project, expose interface, change content/skin |
| HTML / GSAP / Canvas animation | Original source plus concise usage record | Adapt the selected effect once; store the validated TSX adapter for reuse |
| Fixed animation already rendered | Original MP4/WebM | Reuse as footage when editability is unnecessary; pixels/text/colors are baked in |

An MP4, WAV or GLB is not turned into TSX. TSX is the component that places, times and controls those files. For editable imported animation, a reusable frame-driven adapter removes recurring translation work. Before conversion, check the existing 108 cards and shared modules for an equivalent. Reuse the existing implementation when it expresses the required motion; keep the imported version as reference. Do not convert every animation at import: many will never be selected, some duplicate original cards, and some rely on heavy runtime-specific code.

A low-token render job imports an existing local component and supplies props. The main agent copies required code/media into the project before dispatch; the API model receives the public interface and timing, not every card's source, minified vendors or the full source archive. If the component cannot express the shot through props, expose a useful adapter or send only the chosen implementation details. A local path alone is not file access for the remote model.

## Verified upstream behavior

Checked on 2026-11-18 against upstream commit `ae9c24cade0c7416a6739360a91178a812ff8651` (commit time 2026-11-17 17:57:49 UTC).

1. Annotate narration semantics and inputs.
2. `scripts/card_match.py` reads `references/cards-index.json` and ranks candidates.
3. Record the chosen card in SHOTBOOK, along with caveats and sound cues.
4. Read only that card's Markdown guide; copy `template/cards/<slug>.tsx` into the video's `src/cards/`.
5. Change content, CONFIG and skin while retaining the motion logic. HTML demos are previews; the existing Remotion TSX is the implementation.
6. `scripts/card_lint.py` requires the copied file and checks normalized source similarity against the template (threshold 0.55). This guards reuse fidelity; it does not establish visual correctness.

Sources:

- [Original selection and reuse contract](https://github.com/Vincentwei1021/video-talkcraft/blob/ae9c24cade0c7416a6739360a91178a812ff8651/SKILL.md#L190-L210)
- [Card matching source](https://github.com/Vincentwei1021/video-talkcraft/blob/ae9c24cade0c7416a6739360a91178a812ff8651/scripts/card_match.py)
- [Fidelity checker](https://github.com/Vincentwei1021/video-talkcraft/blob/ae9c24cade0c7416a6739360a91178a812ff8651/scripts/card_lint.py)
- [A card's TSX implementation](https://github.com/Vincentwei1021/video-talkcraft/blob/ae9c24cade0c7416a6739360a91178a812ff8651/template/cards/source-converge.tsx)

## This workspace

The local staged `prepare → assets → preview → render → review` wrapper retains the original native card machinery, while allowing alternate Design and CLI scene generation. The original 108 cards already have TSX. The imported RoboNuggets source collection includes HTML/GSAP and other formats; being searchable does not make those Remotion components.

`tools/generate-shots.mjs` currently serializes only `id`, `timing`, `sharedContext` and `brief` into a text API request. It does not read selected asset IDs, resolve file paths, copy cards, or attach component source automatically. The main agent prepares that context. The merger/query helpers do not change this runner or the original matcher's vocabulary.

CLI retains the value of the library when it assembles prepared components. If the main agent supplies only a card name and the model recreates motion from scratch, fidelity and token savings are lost. Keep asset selection, copying and optional one-time adaptation outside the per-shot model request. Use import/props/timing in the request and validate the assembled scene afterwards.
