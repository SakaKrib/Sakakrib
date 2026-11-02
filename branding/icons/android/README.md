# Android assets

- `adaptive-icon-foreground.svg`: 1024-unit canvas = 108dp. Keep artwork inside a circle of radius 313 units (66dp diameter).
- `adaptive-icon-background.svg`: solid primary colour.
- `notification-icon.svg`: white only, transparent background, no gradients or shadows. Fills about 80% of the canvas, as Android guidelines suggest for 24dp status-bar icons.

Generated output is in `../generated/android/res`. The adaptive `ic_launcher.xml` references `@color/ic_launcher_background`, `@mipmap/ic_launcher_foreground` and `@mipmap/ic_launcher_monochrome`, all of which the generator writes. Reference the notification icon as `@drawable/ic_stat_sakakrib`.

For Firebase Cloud Messaging, add the meta-data from `../generated/android/AndroidManifest-notification-snippet.txt` (or run the generator with `--sync --patch-manifest`). This only sets display defaults; it does not touch `google-services.json` or any credentials.
