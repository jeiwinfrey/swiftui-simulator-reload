# Isolated SwiftUI preview

Use this setup when the user requests a standalone view with sample data. For the full app, use [whole-app setup](whole-app.md).

Use macOS with an active Xcode toolchain, Node.js 20 or newer, and a booted iPhone simulator. The launcher uses iOS 17.0 as the default deployment target. Set a newer deployment target when the selected source needs it. Native Liquid Glass needs an iOS 26 or newer SDK and simulator runtime.

## Declare the preview files

Create `NativePreview/preview.json` in the app's project root. Use paths relative to that root. Include the real SwiftUI view, its supporting Swift files, and the preview adapter. For example:

```json
{
  "sources": [
    "MyApp/Features/Profile/ProfileView.swift",
    "MyApp/Features/Profile/ProfileModel.swift",
    "NativePreview/Preview.swift"
  ],
  "resources": [],
  "deploymentTarget": "17.0"
}
```

Create `NativePreview/Preview.swift` with a top-level `@MainActor func previewRoot() -> some View`. Use the selected view's real initializer, environment values, and any navigation container it needs. Supply sample data and local stubs for services the view calls. This example assumes `ProfileView` accepts a `profile` and the project provides a `.preview` fixture.

```swift
import SwiftUI

@MainActor
func previewRoot() -> some View {
    NavigationStack {
        ProfileView(profile: .preview)
    }
}
```

The launcher copies each item in `resources` into the preview bundle using its base name. Use this for files or prepared resource bundles. The launcher invokes the Swift compiler on the listed files. It does not resolve package targets, compile asset catalogs, or apply the app's Xcode scheme or entitlements.

## Run and troubleshoot

From the app project root, run:

```sh
node "${CODEX_HOME:-$HOME/.codex}/skills/swiftui-simulator-reload/scripts/run.mjs" "$PWD"
```

- Add `--device <UDID>` when more than one iPhone is booted. Run one watcher for that project on the selected simulator.
- `Ready on…` means the initial view mounted. A successful save produces `Hot reload mounted`. The last successful view remains in place if compilation fails. Fix the compiler error and save again.
- Keep the preview foregrounded in Simulator while editing. If the launcher reports a mount timeout, switch to the preview app and save again.
- Restart the watcher after changing the config, bundled resources, or source list. Control-C stops the watcher. A fresh session also releases the older versions of the preview library the previous host retained.
