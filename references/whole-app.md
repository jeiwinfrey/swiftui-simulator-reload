# Launch and hot-reload the actual app

## Keep the launch light

Use one native iPhone Simulator with the app's existing Debug simulator artifact. An injector is a separate prerequisite for hot reload. The bundled launcher uses Node.js 20 or newer and the active Xcode toolchain. It boots or reuses one device, opens the app, and exits. Use the existing project command first when it supplies required scheme arguments, environment variables, or injector integration.

From your iOS project's root after a project-level Skills CLI install, launch by installed bundle ID:

```sh
node .agents/skills/swiftui-simulator-reload/scripts/launch-app.mjs \
  --bundle com.example.MyApp
```

To install a built simulator app first, replace `--bundle com.example.MyApp` with `--app "/path/to/MyApp.app"`. Add `--device <UDID>` if more than one device fits. The launcher reuses a booted device when possible. With multiple candidates, use `xcrun simctl list devices available` to choose. Append app arguments after `--`. For scheme environment values needed by the app, pass the corresponding `SIMCTL_CHILD_` variables in the launcher's environment. If the skill is installed elsewhere, locate the launcher relative to `SKILL.md`.

If no suitable Debug artifact exists, build the repo's app scheme for the selected iPhone destination using the existing workspace or project. Reuse the project's Derived Data and build settings. Find the app from the build products or the app target's `TARGET_BUILD_DIR` and `FULL_PRODUCT_NAME`. Then install and launch that product. [Apple's Xcode command-line tools](https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference)

## Connect the injector

Reuse the project's existing Debug-only injection workflow when it works. For a new terminal-driven setup, check whether **SweetPad CLI** is available and compatible with the active Xcode. Its packaged CLI includes an injection client. Use the project's Debug scheme, the selected simulator UDID, and its documented SwiftUI refresh hooks. Run from the project directory with a retained terminal. [SweetPad CLI hot reload](https://sweetpad.hyzyla.dev/docs/cli/hot-reload/)

```sh
sweetpad run --hot --on "<simulator-UDID>"
```

Run one injector session at a time. **InjectionNext** also supports a project watcher. Check its release notes against the active Xcode version, use its Swift package integration, and scope the `-Xlinker -interposable` flags to Debug simulator builds for modules that need them. Use one supported SwiftUI refresh integration such as `Inject` or `HotSwiftUI` and instrument the views under iteration. Keep Release builds free of injection behavior. [InjectionNext releases](https://github.com/johnno1962/InjectionNext/releases)

InjectionNext's project-watcher mode uses compiler command lines from a compatible initial Xcode build. Follow its guidance for `EMIT_FRONTEND_COMMAND_LINES`, the matching active toolchain, and any compilation-cache settings the injector needs. Start its local watcher with the project selected and verify that it connects to the running app. This mode can watch saves from Codex or another editor. [InjectionNext project-watcher setup](https://github.com/johnno1962/InjectionNext#cursorvscodefile-watcher-mode) · [SwiftUI refresh hooks](https://github.com/krzysztofzablocki/Inject#swiftui)

If the tool is missing or the setup needs installation or a new project dependency, identify that prerequisite before claiming hot reload is active. Avoid changing global toolchain settings to work around an unverified incompatibility.

## Verify the edit loop

Use a visible change inside the `body` of an already instrumented view. Confirm the injector logged a successful injection and the real app's PID stayed the same. Saving a supported edit still recompiles affected Swift code. Changes to stored state layout, method signatures, assets, or dependencies commonly need a new build. A SwiftUI refresh may recreate some view state. Measure the project's reload time before estimating its speed.
