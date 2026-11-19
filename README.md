# SwiftUI Simulator Reload

A Codex skill for editing SwiftUI while your app runs in one native iPhone Simulator. It also includes a small launcher for existing Debug builds and a benchmark you can run locally.

## Install the skill

Clone the repository into your Codex skills directory:

```sh
git clone https://github.com/jeiwinfrey/swiftui-simulator-reload.git \
  "${CODEX_HOME:-$HOME/.codex}/skills/swiftui-simulator-reload"
```

If you already installed a local copy, use the repository as the updated skill source and keep any local edits you need. Open a Codex chat in your iOS project and ask:

> Use `$swiftui-simulator-reload` to run my Debug app in Simulator with hot reload. I'll interact with it myself.

## Run the actual app

Use the project's existing injection setup if it has one. For a new terminal-driven setup, [SweetPad CLI](https://sweetpad.hyzyla.dev/docs/cli/hot-reload/) can build the Debug app, launch it on the selected simulator, and inject supported Swift edits on save. SwiftUI needs refresh hooks such as those provided by [Inject](https://github.com/krzysztofzablocki/Inject). [Whole-app setup and verification](references/whole-app.md)

The bundled launcher uses Node.js 20 or newer and the active Xcode toolchain. It opens Simulator and exits. A configured injector handles subsequent hot reloads.

```sh
node scripts/launch-app.mjs --bundle com.example.MyApp
# Or install a previously built simulator app first
node scripts/launch-app.mjs --app "/path/to/MyApp.app"
```

Use `--device <UDID>` to select a specific iPhone simulator. The launcher uses one device per invocation. Supported hot reloads keep the app process running. Changes to stored properties, signatures, assets, or dependencies may require a regular Debug rebuild.

The skill also includes a small native host for [isolated SwiftUI previews](references/project-setup.md) when you want to review a single view with sample data.

## Benchmark

The benchmark uses a real SwiftUI fixture app on one iPhone simulator. It edits the same view and records the time until that revision reaches an app-side SwiftUI callback. It also checks the app PID for each sample. On the published Apple M4 run, the median was **0.55 s for hot reload** and **2.67 s for a warm Xcode build and relaunch** across five measured edits per workflow. See [the results and reproduction steps](benchmarks/README.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for validation and commit conventions. The project is available under the [MIT License](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for the benchmark scaffold.
