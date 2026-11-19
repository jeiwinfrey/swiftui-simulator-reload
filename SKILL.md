---
name: swiftui-simulator-reload
description: Launch the actual iOS Debug app in one native macOS Simulator and enable SwiftUI hot reload with minimal extra processes. Use when the user wants to navigate their running app and manually review AI edits without a full build on every save.
---

# SwiftUI Simulator Reload

Run the app through its normal entry point in one Simulator window. Keep its navigation, app data, assets, and enabled Debug capabilities available. The user handles Simulator interaction and visual review.

1. Find the application's scheme or existing Debug launch command and any configured hot-reload tool. Prefer the project's existing native workflow. Reuse a compatible installed build or an existing simulator `.app`. Build the Debug app when the initial artifact is missing or needs changes that require a rebuild.
2. Read [whole-app setup](references/whole-app.md) for the bundled launcher and the Debug-only SwiftUI injection setup. Use one explicit iPhone destination when selection is ambiguous. Keep the native Simulator and the injector needed by the project. Use the IDE only when the build or injector needs it. Keep the edit loop free of video mirroring, screenshot polling, additional preview hosts, and repeated clean builds.
3. Verify the real app's bundle ID and the injector's connection. For a safe edit to an instrumented SwiftUI view, check for a successful injection and the same app process ID before and after. Let the user check the visual result. If injection is unavailable or incompatible, report the missing prerequisite and the actual launch state.
4. Inject supported source edits. Use the app's normal build and launch flow for changes to stored properties, signatures, target configuration, dependencies, or resources that the injector cannot update in place. Report measured reload time for the project when available.

Use the [isolated view setup](references/project-setup.md) only when the user explicitly asks for an isolated preview with sample data. Its runner starts a separate preview app.
