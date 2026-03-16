# Better Quote

> Mirror any line or block between notes without copy-paste chaos.

Better Quote is an Obsidian plugin for quickly **reusing exact content** across your vault.
It lets you link to source blocks with embeds, so updates happen in one place and stay consistent everywhere.

## Why Better Quote?

When your notes grow, repeated snippets become hard to maintain:

- The same definition appears in multiple files.
- Project briefs and meeting notes reuse shared context.
- You want one source of truth, not many slightly different copies.

Better Quote gives you a fast workflow to keep content synced through native block embeds.

## Features

- **Mirror to another note** (`mirror-to`)
  - Add a block ID to the current line if needed (`^quote1`, `^quote2`, ...)
  - Pick a target file from a fuzzy list
  - Append an embed like `![[Source Note#^quote3]]` to the target file

- **Mirror from anywhere** (`mirror-from`)
  - Search blocks across the whole vault
  - Select one result to insert its embed at the cursor
  - If the source block has no ID yet, Better Quote adds one automatically

- **Smart block search**
  - Searches by preview text and file path
  - Supports multiple terms with relevance ranking

- **Markdown-aware block extraction**
  - Handles headings, list items, blockquotes, and paragraphs
  - Skips frontmatter and fenced code blocks for cleaner results

## Quick Start

1. Open **Command Palette** in Obsidian.
2. Run `mirror-to` on a line you want to reuse elsewhere.
3. Choose a target note, and Better Quote appends an embed to it.
4. Or run `mirror-from` to search existing blocks and insert one immediately.

## Example Workflow

- In `Concepts.md`, you have:

  ```md
  Second-order effects matter more than first impressions.
  ```

- Run `mirror-to`, pick `Daily/2026-03-16.md`.
- Better Quote turns the source line into:

  ```md
  Second-order effects matter more than first impressions. ^quote1
  ```

- And appends to the target:

  ```md
  ![[Concepts#^quote1]]
  ```

Now you can edit the source once and keep all mirrors in sync.

## Commands

- `mirror-to`: Mirror current line/block into another note
- `mirror-from`: Search and insert a mirrored block from vault

## Installation

### Manual installation

1. Download `manifest.json`, `main.js`, and `styles.css` (if present) from a release.
2. Create a folder in your vault: `.obsidian/plugins/better-quote/`.
3. Put the files into that folder.
4. Reload Obsidian and enable **Better Quote** in Community Plugins.

## Compatibility

- Minimum Obsidian version: `1.5.0`
- Desktop and mobile supported (`isDesktopOnly: false`)

## Roadmap

- Optional settings for block ID prefix
- Optional insertion location strategies (top/bottom/near cursor)
- Better filtering scopes (current folder/tag)

## Feedback

If Better Quote helps your workflow, star the repo and open issues for ideas/bugs.

---

Built for people who prefer **linked thinking** over copy-paste maintenance.
