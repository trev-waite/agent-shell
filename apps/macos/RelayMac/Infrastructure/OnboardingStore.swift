import Foundation

/// Phase 3 scaffold — first-run API key onboarding (not yet wired).
@MainActor
public enum OnboardingStore {
    public static var applicationSupportURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Relay", isDirectory: true)
    }

    public static var envFileURL: URL {
        applicationSupportURL.appendingPathComponent(".env")
    }

    public static func saveAPIKey(_ key: String) throws {
        try FileManager.default.createDirectory(at: applicationSupportURL, withIntermediateDirectories: true)
        let content = "GEMINI_API_KEY=\(key)\n"
        try content.write(to: envFileURL, atomically: true, encoding: .utf8)
    }

    public static var hasAPIKey: Bool {
        guard let content = try? String(contentsOf: envFileURL, encoding: .utf8) else { return false }
        return content.contains("GEMINI_API_KEY=") && !content.contains("GEMINI_API_KEY=\n")
    }
}
