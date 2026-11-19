# Whole-app hot reload benchmark

This benchmark compares warm Xcode rebuilds with in-process SwiftUI injection on the same small iOS app, view edit, toolchain, and simulator.

## Results

Measured November 19, 2026 on an Apple M4 with 16 GB RAM, macOS 26.6.2, Xcode 26.4.1 (17E202), and one iPhone 17 Pro Max simulator running iOS 26.4. The hot-reload run used SweetPad 0.1.27 in build-log mode and Inject 1.6.0. Each row contains five measured edits.

| Workflow | Median | Range | App process |
| --- | ---: | ---: | --- |
| Warm Xcode build, install, and relaunch | 2.666 s | 2.587–2.849 s | New PID on each edit |
| SweetPad hot reload | 0.552 s | 0.366–0.603 s | Same PID across all edits |

The fixture's median edit-to-callback latency improved by **4.8×** in this run. [Raw samples](results/apple-m4-xcode-26.4.1.json)

## Reproduce

Use macOS, an active Xcode installation with an iPhone simulator runtime, Node.js 20 or newer, and [SweetPad CLI](https://sweetpad.hyzyla.dev/docs/cli/overview/) with hot reload support. Start one iPhone simulator and select its UDID from:

```sh
xcrun simctl list devices booted
```

Then run:

```sh
node benchmarks/run.mjs --device "<simulator-UDID>" --runs 5
```

The fixture pins [Inject](https://github.com/krzysztofzablocki/Inject) to 1.6.0. The first build resolves it through Swift Package Manager. Set `SWEETPAD_BIN` to the path of a downloaded CLI binary if it is outside `PATH`. Use `--mode rebuild` for the Xcode baseline alone or `--mode hot` to test only hot reload. The default `--recompiler buildlog` selects SweetPad's single-file recompiler. Use `--recompiler resolver` to measure its whole-module recompiler. Each invocation prints the raw samples and median as JSON.

## Method

- The fixture runs from its normal SwiftUI app entry point. The harness copies its source into a temporary project and changes a string in `ContentView.body` for each sample.
- For Xcode, the harness performs an incremental Debug build, terminates the running fixture, installs the rebuilt app, and launches it again. It uses the same Derived Data throughout the run. It checks that each sample starts a new app process.
- For hot reload, SweetPad builds and starts the fixture once. After the injector connects, the harness saves each edit and verifies that the fixture reports the new revision from the same process.
- Timing starts immediately before the source write and ends when the harness sees the new revision written by the app's SwiftUI `.task(id:)` callback. It excludes the initial build, Simulator boot, and one additional warm-up edit per mode. The callback measures arrival at the app's view update, and screen compositing may complete later.
- The benchmark launches and removes only its own fixture bundle. It leaves your simulator booted. Use a dedicated simulator if you want to avoid foregrounding the fixture over another app.

The fixture is deliberately small and the edit is compatible with injection. Timings include filesystem polling and reflect a specific machine, toolchain, and edit. They do not estimate cold builds, average performance across real apps, rendering latency, or memory use.
