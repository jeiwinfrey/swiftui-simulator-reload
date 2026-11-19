import SwiftUI
import UIKit

@MainActor
@_cdecl("canvas_make_preview")
public func makePreview(_ name: UnsafePointer<CChar>) -> UnsafeMutableRawPointer {
    let controller = UIHostingController(rootView: previewRoot())
    return Unmanaged.passRetained(controller as UIViewController).toOpaque()
}
