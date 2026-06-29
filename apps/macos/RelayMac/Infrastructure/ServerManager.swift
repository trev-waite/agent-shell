import Foundation

/// Phase 3 scaffold — manages bundled relay-server lifecycle (not yet wired).
@MainActor
public final class ServerManager: ObservableObject {
    public static let shared = ServerManager()

    @Published public private(set) var isRunning = false
    @Published public private(set) var statusMessage = "Using external server"

    private var process: Process?

    private init() {}

    public func startIfNeeded() async {
        // Future: spawn bundled relay-server binary from app bundle Resources
        statusMessage = "External server expected at http://127.0.0.1:4310"
        isRunning = false
    }

    public func stop() {
        process?.terminate()
        process = nil
        isRunning = false
        statusMessage = "Stopped"
    }
}
