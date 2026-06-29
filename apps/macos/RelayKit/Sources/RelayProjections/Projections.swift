import Foundation
import RelayModels

public enum MetricColorKey: Sendable {
    case text, status, motion, error
}

public struct MetricCellData: Identifiable, Sendable {
    public let id: String
    public let label: String
    public let value: String
    public let colorKey: MetricColorKey

    public init(id: String, label: String, value: String, colorKey: MetricColorKey) {
        self.id = id
        self.label = label
        self.value = value
        self.colorKey = colorKey
    }
}

public enum StatusDotVariant: Sendable {
    case success, active, error, warning, muted
}

public struct FooterStatus: Sendable {
    public let label: String
    public let dotVariant: StatusDotVariant

    public init(label: String, dotVariant: StatusDotVariant) {
        self.label = label
        self.dotVariant = dotVariant
    }
}

public enum RelayFormatters {
    public static func formatDuration(ms: Int64) -> String {
        if ms < 1000 { return "\(ms)ms" }
        let seconds = Double(ms) / 1000
        if seconds < 60 { return String(format: "%.2fs", seconds) }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return "\(mins)m \(String(format: "%02d", secs))s"
    }

    public static func formatLatencyMs(_ ms: Double) -> String {
        if ms < 1000 { return String(format: "%.2fms", ms) }
        return formatDuration(ms: Int64(ms))
    }

    public static func formatTokens(_ n: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }

    public static func formatTokPerSec(_ value: Double) -> String {
        if value < 10 { return String(format: "%.1f t/s", value) }
        return "\(Int(value.rounded())) t/s"
    }

    public static func formatCost(_ totalCost: Double, currency: String) -> String {
        if totalCost == 0 { return "0.0000 \(currency)" }
        if totalCost < 0.0001 { return String(format: "%.6f %@", totalCost, currency) }
        return String(format: "%.4f %@", totalCost, currency)
    }
}

public enum FooterProjection {
    public static func derive(
        sessionStatus: String,
        isStreaming: Bool,
        serverOnline: Bool?
    ) -> FooterStatus {
        if serverOnline == false {
            return FooterStatus(label: "OFFLINE", dotVariant: .error)
        }
        if serverOnline == nil {
            return FooterStatus(label: "CHECKING", dotVariant: .warning)
        }
        if isStreaming || sessionStatus == "running" {
            return FooterStatus(label: "RUNNING", dotVariant: .active)
        }
        if sessionStatus == "failed" {
            return FooterStatus(label: "FAILED", dotVariant: .error)
        }
        if sessionStatus == "completed" {
            return FooterStatus(label: "DONE", dotVariant: .success)
        }
        return FooterStatus(label: "READY", dotVariant: .success)
    }
}

public enum MetricsProjection {
    public static func buildGrid(
        inputTokens: Int,
        outputTokens: Int,
        totalCost: Double,
        currency: String,
        sessionStatus: String,
        cachedInputTokens: Int,
        lastTTFT: Double?,
        lastTokPerSec: Double?,
        lastResponseMs: Double?,
        toolCallCount: Int,
        sessionStartedAt: Int64?,
        sessionEndedAt: Int64?,
        now: Int64 = Int64(Date().timeIntervalSince1970 * 1000)
    ) -> [MetricCellData] {
        let totalTimeMs: Int64 = {
            guard let start = sessionStartedAt else { return 0 }
            return (sessionEndedAt ?? now) - start
        }()

        func statusColor(_ status: String) -> MetricColorKey {
            if status == "running" { return .motion }
            if status == "completed" { return .status }
            if status == "failed" { return .error }
            return .text
        }

        return [
            MetricCellData(id: "total-time", label: "TOTAL TIME", value: sessionStartedAt != nil ? RelayFormatters.formatDuration(ms: totalTimeMs) : "—", colorKey: .text),
            MetricCellData(id: "tokens", label: "TOKENS", value: RelayFormatters.formatTokens(inputTokens + outputTokens), colorKey: .text),
            MetricCellData(id: "tool-calls", label: "TOOL CALLS", value: "\(toolCallCount)", colorKey: .text),
            MetricCellData(id: "status", label: "STATUS", value: sessionStatus.uppercased(), colorKey: statusColor(sessionStatus)),
            MetricCellData(id: "ttft", label: "TTFT", value: lastTTFT.map { RelayFormatters.formatLatencyMs($0) } ?? "—", colorKey: sessionStatus == "running" ? .motion : .text),
            MetricCellData(id: "input", label: "INPUT", value: RelayFormatters.formatTokens(inputTokens), colorKey: .text),
            MetricCellData(id: "output", label: "OUTPUT", value: RelayFormatters.formatTokens(outputTokens), colorKey: .text),
            MetricCellData(id: "cached", label: "CACHED", value: cachedInputTokens > 0 ? RelayFormatters.formatTokens(cachedInputTokens) : "—", colorKey: .text),
            MetricCellData(id: "tok-per-sec", label: "TOK/S", value: lastTokPerSec.map { RelayFormatters.formatTokPerSec($0) } ?? "—", colorKey: .text),
            MetricCellData(id: "response", label: "RESPONSE", value: lastResponseMs.map { RelayFormatters.formatLatencyMs($0) } ?? "—", colorKey: .text),
            MetricCellData(id: "cost", label: "COST", value: RelayFormatters.formatCost(totalCost, currency: currency), colorKey: .text),
        ]
    }
}
