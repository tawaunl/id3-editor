# Tag Editor

A lightweight Mac desktop app for editing ID3 and metadata tags on audio files.

## Supported Formats

| Format | Read | Write | Notes |
|--------|------|-------|-------|
| MP3    | Yes  | Yes   | Uses node-id3 directly |
| FLAC   | Yes  | Yes   | Requires ffmpeg |
| AAC / M4A | Yes | Yes | Requires ffmpeg |
| WAV / AIFF | Yes | Yes | Requires ffmpeg |

## Supported Tags

- Title, Artist, Album
- Genre, Year
- Track number and total tracks
- Album artwork (JPEG/PNG)

## Metadata Lookup Sources

- MusicBrainz (no API key required)
- iTunes Search API (no API key required)
- Discogs (requires personal access token)
- Last.fm (requires API key)

## Setup

### 1. Install Node.js

Download from https://nodejs.org (v18 or later).

### 2. Install ffmpeg (required for FLAC, M4A, WAV, AIFF)

```bash
brew install ffmpeg
```

If you do not have Homebrew:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 3. Install dependencies

```bash
cd id3-editor
npm install
```

### 4. Run the app

```bash
npm start
```

## Usage

- Click **Open Files** in the sidebar, or drag and drop audio files onto the window.
- Select a file from the sidebar to load its tags into the editor.
- Edit any fields on the right.
- Click the album art area (or the Change button) to replace artwork.
- Press **Cmd+S** or click **Save Tags** to write changes back to the file.
- The dot indicator on a file name means you have unsaved changes.
- Click **Revert** to discard changes and reload the original tags.

## Build a distributable .app

```bash
npm run build
```

This now produces both Intel (`x64`) and Apple Silicon (`arm64`) `.dmg` files in the `dist/` folder.

Architecture-specific builds:

```bash
# Intel Mac
npm run build:mac:intel

# Apple Silicon Mac
npm run build:mac:apple-silicon
```

## Code signing and notarization (macOS)

The build is configured to notarize automatically after signing when these env vars are present:

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOURTEAMID"
```

You also need a `Developer ID Application` certificate installed in your keychain.

Then run:

```bash
npm run build
```

If the Apple env vars are not set, notarization is skipped and unsigned DMGs are still produced.

## Change the app icon (macOS)

1. Add your icon image as `assets/icon-source.png` at 1024x1024 pixels.
2. Generate the macOS icon file:

```bash
npm run icon:mac
```

3. Build the installer:

```bash
npm run build
```

The generated file `assets/icon.icns` is used for both the app bundle icon and the DMG icon.

## Notes

- Tag writes happen in-place; the original file is overwritten.
- For non-MP3 formats, ffmpeg must be on your PATH (installed via Homebrew above).
- Album art is written as a front-cover JPEG frame.
