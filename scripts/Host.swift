import Darwin
import UIKit

@main
final class PreviewHost: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    private var timer: Timer?
    private var current: String?
    private var factories: [String: Factory] = [:]
    private var handles: [UnsafeMutableRawPointer] = []

    private typealias Factory = @convention(c) (UnsafePointer<CChar>) -> UnsafeMutableRawPointer
    private let directory = URL.documentsDirectory.appending(path: "Canvas")

    private struct Selection: Codable {
        let screen: String
        let library: String
        let request: String
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        let placeholder = UIViewController()
        placeholder.view.backgroundColor = .systemBackground
        window.rootViewController = placeholder
        window.makeKeyAndVisible()
        self.window = window

        refresh()
        timer = Timer(timeInterval: 0.12, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
        if let timer { RunLoop.main.add(timer, forMode: .common) }
        return true
    }

    private func refresh() {
        guard let data = try? Data(contentsOf: directory.appending(path: "selection.json")),
              let selection = try? JSONDecoder().decode(Selection.self, from: data),
              current != selection.request,
              let makePreview = factory(for: selection.library)
        else { return }

        let viewController = selection.screen.withCString { screen in
            Unmanaged<UIViewController>.fromOpaque(makePreview(screen)).takeRetainedValue()
        }
        window?.rootViewController = viewController
        current = selection.request
        try? data.write(to: directory.appending(path: "ready.json"), options: .atomic)
    }

    private func factory(for library: String) -> Factory? {
        if let loaded = factories[library] { return loaded }
        let path = directory.appending(path: library).path
        guard let handle = dlopen(path, RTLD_NOW | RTLD_LOCAL) else {
            if let message = dlerror() { NSLog("Canvas: %s", message) }
            return nil
        }
        guard let symbol = dlsym(handle, "canvas_make_preview") else {
            dlclose(handle)
            return nil
        }
        // SwiftUI can retain types from a previous preview graph. Keep each loaded library mapped.
        handles.append(handle)
        let factory = unsafeBitCast(symbol, to: Factory.self)
        factories[library] = factory
        return factory
    }
}
