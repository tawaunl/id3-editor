# TagEditor v1.0.0

First public release of TagEditor for macOS.

## Highlights

- Edit metadata tags for MP3, FLAC, AAC/M4A, WAV, and AIFF.
- Update common fields: title, artist, album, genre, year, and track info.
- Read and write album artwork.
- Metadata lookup support for MusicBrainz, iTunes, Discogs, and Last.fm.
- Native macOS distribution for Intel and Apple Silicon.

## Downloads

- Intel Mac (`x64`): `TagEditor-1.0.0.dmg`
- Apple Silicon (`arm64`): `TagEditor-1.0.0-arm64.dmg`

## Checksums (SHA-256)

```text
2cf2ad671e86a130c149fe3f7898be4ec7c93d2eec0cfed830589e7e1c3ca4e0  dist/TagEditor-1.0.0.dmg
8b481d438dae2f8f5ec8f6ec6f7c96bae19325fe31bfab2d84a271b27279df67  dist/TagEditor-1.0.0-arm64.dmg
```

## Notes

- If notarization/signing credentials are not configured, macOS may show a warning on first open.
- For non-MP3 formats, ffmpeg must be installed and available on `PATH`.