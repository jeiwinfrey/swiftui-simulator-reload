# Contributing

Keep changes focused. Explain what you tested and include the Xcode version, simulator runtime, and injector version for reports that depend on them.

Run the lightweight checks from the repository root with Node.js 20 or newer:

```sh
for script in scripts/*.mjs benchmarks/*.mjs; do node --check "$script"; done
node scripts/launch-app.mjs --help
node scripts/run.mjs --help
node benchmarks/run.mjs --help
```

Changes to app lifecycle, SwiftUI injection, or timing should be validated on a real iPhone simulator using the [benchmark](benchmarks/README.md). Hosted CI runs the JavaScript syntax and command smoke checks.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Write an imperative subject and keep each commit focused. Examples:

- `feat(launcher): add simulator device selection`
- `fix(benchmark): wait for the updated SwiftUI revision`
- `docs: explain injector setup`

Use `!` or a `BREAKING CHANGE` footer for incompatible changes.
