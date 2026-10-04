# ADR 0003: Images are embedded in the project file until the export milestone

- Status: accepted
- Date: 2026-10-04

## Context
Spec §4.9 makes folder mode (images in `assets/` next to the project JSON) the default when the File System Access API is available, with embedded data URIs as the portable alternative. Writing a sibling folder needs a directory handle (`showDirectoryPicker`), a second permission prompt, and a separate code path for Firefox and Safari. A project opened from a single file handle cannot write next to itself.

## Decision
- New images are stored embedded (`assets.mode = 'embedded'`, `dataUri` per item), as WebP ≤ 2048 px (≈ 50–300 kB each).
- `assets.mode`, `path` and the folder layout stay in the schema unchanged. Converting between modes becomes an Export option in M10, as §4.9 already describes ("Conversion between modes is an Export option").
- Missing assets (a reference without an item, or a folder-mode path that cannot be read) render as a placeholder, and the integrity check reports them as warnings, never errors.

## Consequences
- One file is the whole project: autosave, crash recovery and the download fallback work identically in every browser.
- Project JSON grows with images, and git diffs of image changes are noisy. Folder mode solves both in M10.
- Unreferenced images are pruned when the gear editor saves, so replacing or recalibrating an image does not accumulate data.
