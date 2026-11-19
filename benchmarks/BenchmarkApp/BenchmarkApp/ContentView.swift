import Foundation
import Inject
import SwiftUI

struct ContentView: View {
    @ObserveInjection private var injection
    @State private var taps = 0

    var body: some View {
        let revision = "BENCH-0000"

        NavigationStack {
            VStack(spacing: 18) {
                Text(revision).accessibilityIdentifier("benchmarkRevision")
                Button("Taps: \(taps)") { taps += 1 }
                NavigationLink("Open details") { Text("Benchmark destination") }
            }
            .navigationTitle("SwiftUI benchmark")
        }
        .task(id: revision) {
            let pid = ProcessInfo.processInfo.processIdentifier
            try? "\(revision) \(pid)".write(
                to: .documentsDirectory.appending(path: "benchmark-ready.txt"),
                atomically: true,
                encoding: .utf8
            )
        }
        .enableInjection()
    }
}
