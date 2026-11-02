# iOS assets

iOS icons are generated from the Android foreground and background SVGs so the identity matches exactly.

- Output: `../generated/ios/AppIcon.appiconset/` with one opaque 1024 x 1024 PNG and a valid `Contents.json` (the single-size format used by Xcode 14 and later, and by Capacitor's iOS template).
- For older Xcode: `../generated/ios/legacy/AppIcon.appiconset/` has every iPhone/iPad size plus the App Store marketing icon.
- The artwork is full-bleed with the glyph at about 65% of the width. Do not bake rounded corners into it; iOS applies the mask.
- Target in the Capacitor project: `ios/App/App/Assets.xcassets/AppIcon.appiconset`. The generator copies there with `--sync`.
