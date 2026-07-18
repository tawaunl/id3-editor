# TagEditor v1.0.1

This release focuses on faster library navigation, improved bulk editing, better rename workflows, and built-in update checks.

## Highlights

- Searchable, sortable file table in the left sidebar with sticky column headers.
- Bulk editing improvements for title, artist, album, genre, year, total tracks, and sequential track numbering.
- Optional auto-rename on save using the rename template.
- Clear rename status with current filename, preview highlighting, and no-rename-needed indication.
- Metadata lookup results now persist for the active track so you can compare matches without re-running search.
- Manual and automatic update checks against the latest GitHub release.

## Downloads

- Intel Mac (`x64`): `TagEditor-1.0.1.dmg`
- Apple Silicon (`arm64`): `TagEditor-1.0.1-arm64.dmg`

## Checksums (SHA-256)

```text
32eecc4bc9c5f16a28aae59fed6ecb8e08ab072d89e3fde74ae11b8e98b4b2dd  dist/TagEditor-1.0.1.dmg
b1c7c072d6e8f4e8e2204e5969468bcd292cd9fed4d9d403e8b7a92a1fbda7fe  dist/TagEditor-1.0.1-arm64.dmg
```

## Notes

- Unsigned builds are still supported; macOS may require users to open the app via Security & Privacy on first launch.
- For non-MP3 formats, ffmpeg must be installed and available on `PATH`.