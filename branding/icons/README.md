# SakaKrib icon system

One original mark, one generator, every platform asset.

**The mark.** A squared **S** drawn as a single route line that starts and ends in a round node: *find a place, then move there*. It is not a house, pin or generic lettermark, and it stands alone without the wordmark. Nodes are the accent colour; the S is the primary colour (light backgrounds) or paper colour (dark backgrounds).

## Regenerate everything

From the repository root:

```bash
npm run generate:icons
```

Extra flags (pass after `--`): `--sync` copies assets into `android/` and `ios/` when those projects exist, `--patch-manifest` (with `--sync`) adds the default notification icon meta-data to `AndroidManifest.xml`, `--no-previews` skips preview PNGs. Output is deterministic: running it twice produces identical files.

## Source files (never modified by the script)

| File | Purpose |
|---|---|
| `source/sakakrib-mark.svg` | The symbol alone, for light backgrounds. |
| `source/sakakrib-logo-light.svg` | Horizontal logo (mark + wordmark) for light backgrounds. |
| `source/sakakrib-logo-dark.svg` | Same logo recoloured for dark backgrounds. |
| `android/adaptive-icon-foreground.svg` | 108dp adaptive foreground. Glyph is scaled to 88% so it stays inside the 66dp safe zone. Also used for iOS and legacy icons. |
| `android/adaptive-icon-background.svg` | Solid brand background layer. |
| `android/notification-icon.svg` | Separate white silhouette for the status bar: bolder stroke, wider opening, no colour. |

The wordmark (Poppins Bold) is converted to outlines inside the logo SVGs, so no font is needed to render them.

## Adaptive launcher icon vs notification icon

- **Adaptive launcher icon** is two full-colour layers (foreground and background). The device applies its own mask (circle, squircle, and so on) and may animate or parallax the layers, so artwork must stay in the centre 66dp of a 108dp canvas. Android 13+ can also tint the **monochrome** layer for themed icons; the generator derives it from the foreground silhouette.
- **Notification icon** is a different asset. Android discards colour and uses only the alpha channel, so a full-colour icon would show up as a solid blob. It is a white silhouette on transparent, drawn from its own SVG, and Android tints it with the notification colour.

## Where output goes

```
generated/android/res/mipmap-*/ic_launcher.png, ic_launcher_round.png,
                                ic_launcher_foreground.png, ic_launcher_monochrome.png
generated/android/res/mipmap-anydpi-v26/ic_launcher.xml, ic_launcher_round.xml
generated/android/res/values/ic_launcher_background.xml, sakakrib_notification_color.xml
generated/android/res/drawable-*/ic_stat_sakakrib.png      (notification, 24 to 96 px)
generated/android/play-store/ic_launcher-playstore.png     (512 px)
generated/android/AndroidManifest-notification-snippet.txt
generated/ios/AppIcon.appiconset/                           (single 1024 icon + Contents.json)
generated/ios/legacy/AppIcon.appiconset/                    (full size set for older Xcode)
previews/                                                   (logo and icon previews)
```

## How Capacitor picks the assets up

Capacitor does not read `branding/`. Native projects are created by `npx cap add android` / `npx cap add ios`, and the generated assets must be copied into them after that step:

```bash
npx cap add android && npx cap add ios      # only if your workflow creates them dynamically
npm run generate:icons -- --sync --patch-manifest
npx cap sync
```

`--sync` writes to `android/app/src/main/res` and `ios/App/App/Assets.xcassets/AppIcon.appiconset`, and skips (with a message) any project that does not exist. Put it in your CI job after the `cap add` step and before the Gradle/Xcode build. Nothing in `capacitor.config.ts`, the app ID (`com.sakakrib.app`) or the app name is touched.

## Change the brand colours

Edit `brand.json` and rerun the generator. Values there override the default colours baked into the SVGs, so every PNG, XML colour resource and preview updates. (The SVG files keep their original colours until you edit them too; update both if you want previews in an editor to match.)

## Limitations

- iOS icons must be opaque and square; iOS draws the rounded corners. The generator removes the alpha channel and checks it.
- iOS 18 dark and tinted icon variants are not generated; add them to `Contents.json` later if wanted.
- Pre-Android 8 devices use the pre-masked legacy PNGs; Android 8 to 12 use the adaptive layers without theming; Android 13+ adds the themed monochrome icon.
- Push notifications on iOS show the app icon automatically; there is no separate iOS notification asset.
- Android notification meta-data only takes effect for FCM messages that do not set their own icon. Messages with a payload `icon` override it.
