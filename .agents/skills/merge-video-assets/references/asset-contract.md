# Common asset contract

The contract describes how an asset is found and reused. It does not require different media to have the same binary format.

## Import manifest

All paths except `sourceRoot` are relative to the staged source directory. `sourceRoot` is absolute or relative to the manifest file. Keep a whole component's relative dependency structure. The importer stores an immutable source snapshot and a SHA-256 inventory; do not point a new manifest directly at the live Talkcraft library or an entire workspace.

```json
{
  "schemaVersion": 1,
  "sourceRoot": "/tmp/talkcraft-pack",
  "provenance": {
    "origin": "https://example.com/original-pack",
    "author": "Original creator",
    "license": "CC-BY-4.0",
    "licensePath": "LICENSE",
    "noticesPath": "THIRD-PARTY-NOTICES.md"
  },
  "assets": [
    {
      "kind": "image",
      "title": "Agent icon",
      "path": "assets/agent.svg",
      "category": "圖示與標誌",
      "tags": ["agent", "圖示"],
      "semantics": ["自我介绍"],
      "summary": "Agent identity mark; original vector retained."
    },
    {
      "kind": "animation",
      "title": "Many-to-one convergence",
      "path": "components/converge.js",
      "poster": "components/poster.png",
      "preview": "components/index.html",
      "guide": "components/usage.md",
      "files": ["components/config.json"],
      "format": "HTML/GSAP",
      "runtime": "html-gsap",
      "readiness": "reference",
      "inputs": ["文", "圖"],
      "semantics": ["机制"],
      "tags": ["匯聚", "多對一"],
      "usage": {
        "description": "Four sources converge; adapt to frame-driven Remotion on first use.",
        "component": "Converge",
        "props": {"sources": "string[]", "result": "string"},
        "dependencies": ["gsap"]
      }
    }
  ]
}
```

Omit optional paths when absent. Record `license: "unknown"` if the source has no known terms; retain actual author/source notes. Do not invent `LICENSE` files to satisfy the example. `provenance` can be overridden per asset for mixed-license packs; use source-relative `licensePath` and `noticesPath` there too. All notices and source documents remain source data.

## Shared record fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `id` | Deterministic SHA-256; media by content, code by content plus dependency-bundle identity |
| `kind` | `image`, `video`, `audio`, `animation`, `component`, `model` |
| `title`, `summary`, `tags` | Short discovery metadata, independent of supplier |
| `inputs`, `semantics` | Input types and intended narrative use; prefer the existing Talkcraft terms |
| `format`, `runtime` | Actual file/code format and required runtime |
| `readiness` | `ready`, `unverified`, or `reference` |
| `source`, `sha256`, `bundle`, `files` | Stored source, working file hash, dependency snapshot and directly referenced files |
| `usage` | Entrypoint, concise usage, component/props and packages where relevant |
| `provenance` | Origin, author, license/notices, source hash, changes and alternate origins |

Readiness has a concrete meaning:

- `ready`: working image, or animation/component already validated for Remotion. For code this requires `runtime: "remotion"` and supplied validation evidence. Import does not perform animation QA for you.
- `unverified`: plausible runtime-compatible media/code whose playback or integration still needs checking.
- `reference`: source retained for adaptation; do not present it as a drop-in Remotion component.

Images add the existing API aliases (`name`, `image`, `category`, `project`, `design`, `provider`, `sourceFile`). Their working hash is the WebP hash; `provenance.sourceSha256` remains the original hash. SVG copies render at 1200 pixels wide with transparency; use the retained SVG for vector output. Other sources retain their formats, including alpha-capable video. No automatic lossy video/audio transcode.

Image categories: 開場意象、概念插畫、介面示意、圖表與流程、場景與背景、其他插畫、圖示與標誌. Other media use a sensible category within their functional `kind`; supplier names belong in provenance, not separate navigation tabs.

Repeat imports reuse the same IDs, merge tags/semantics and retain original entries plus alternate origins. Changed code dependency snapshots receive new IDs. The snapshot preserves supporting files but does not independently register every screenshot, poster or license as a usable asset.
