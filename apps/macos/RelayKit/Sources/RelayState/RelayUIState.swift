import Foundation
import RelayModels
import RelayProjections

public struct ChatMessage: Identifiable, Sendable, Equatable {
    public var id: String
    public var role: MessageRole
    public var content: String
    public var streaming: Bool
    public let timestamp: Int64
    public var completedAt: Int64?

    public init(id: String, role: MessageRole, content: String, streaming: Bool = false, timestamp: Int64, completedAt: Int64? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.streaming = streaming
        self.timestamp = timestamp
        self.completedAt = completedAt
    }
}

public enum MessageRole: String, Sendable {
    case user, assistant, error
}

public struct ToolTrace: Identifiable, Sendable, Equatable {
    public let id: String
    public let toolName: String
    public var status: ToolTraceStatus
    public let startedAt: Int64
    public var completedAt: Int64?
    public var error: String?
    public var input: JSONValue?
    public var output: JSONValue?

    public init(id: String, toolName: String, status: ToolTraceStatus, startedAt: Int64) {
        self.id = id
        self.toolName = toolName
        self.status = status
        self.startedAt = startedAt
    }
}

public enum ToolTraceStatus: String, Sendable {
    case running, completed, failed
}

public struct ConversationTurn: Identifiable, Sendable, Equatable {
    public let id: String
    public var userMessage: ChatMessage?
    public var assistantMessage: ChatMessage?
    public var traceIds: [String]

    public init(id: String) {
        self.id = id
        self.traceIds = []
    }
}

public struct RelayUIState: Sendable {
    public var messages: [ChatMessage] = []
    public var traces: [ToolTrace] = []
    public var turns: [ConversationTurn] = []
    public var sessionId: String?
    public var selectedModel: String = "gemini-2.5-flash"
    public var serverOnline: Bool?
    public var streamConnected = false
    public var activityLabel: String?
    public var seenEventIds: Set<String> = []
    public var lastEventId: String?
    public var sessionStartedAt: Int64?
    public var sessionEndedAt: Int64?
    public var messageQueue: [String] = []

    public var inputTokens = 0
    public var outputTokens = 0
    public var totalCost = 0.0
    public var currency = "USD"
    public var sessionStatus = "idle"
    public var cachedInputTokens = 0
    public var lastTTFT: Double?
    public var lastTokPerSec: Double?
    public var lastResponseMs: Double?

    public var isBusy: Bool {
        sessionStatus == "running" || messages.contains { $0.streaming }
    }

    public var isStreaming: Bool {
        messages.contains { $0.streaming } || activityLabel != nil
    }

    public var footerStatus: FooterStatus {
        FooterProjection.derive(
            sessionStatus: sessionStatus,
            isStreaming: isStreaming,
            serverOnline: serverOnline
        )
    }

    public var metricsGrid: [MetricCellData] {
        MetricsProjection.buildGrid(
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            totalCost: totalCost,
            currency: currency,
            sessionStatus: sessionStatus,
            cachedInputTokens: cachedInputTokens,
            lastTTFT: lastTTFT,
            lastTokPerSec: lastTokPerSec,
            lastResponseMs: lastResponseMs,
            toolCallCount: traces.count,
            sessionStartedAt: sessionStartedAt,
            sessionEndedAt: sessionEndedAt
        )
    }

    public var lastUserMessageId: String? {
        messages.last(where: { $0.role == .user })?.id
    }

    public init() {}

    public mutating func resetSession(keepingModel: Bool = true) {
        let model = selectedModel
        messages = []
        traces = []
        turns = []
        sessionId = nil
        activityLabel = nil
        seenEventIds = []
        lastEventId = nil
        sessionStartedAt = nil
        sessionEndedAt = nil
        messageQueue = []
        inputTokens = 0
        outputTokens = 0
        totalCost = 0
        currency = "USD"
        sessionStatus = "idle"
        cachedInputTokens = 0
        lastTTFT = nil
        lastTokPerSec = nil
        lastResponseMs = nil
        streamConnected = false
        if keepingModel { selectedModel = model }
    }

    public mutating func apply(event: RelayEvent) {
        guard !seenEventIds.contains(event.id) else { return }
        seenEventIds.insert(event.id)
        lastEventId = event.id

        switch event.payload {
        case .messageStarted(let payload):
            let role: MessageRole = payload.role == "user" ? .user : .assistant
            let message = ChatMessage(
                id: event.id,
                role: role,
                content: payload.content,
                streaming: role == .assistant,
                timestamp: event.timestamp
            )
            messages.append(message)

            if role == .user {
                sessionStartedAt = sessionStartedAt ?? event.timestamp
                sessionEndedAt = nil
                activityLabel = "Thinking…"
                turns.append(ConversationTurn(id: event.id))
                if var turn = turns.last {
                    turn.userMessage = message
                    turns[turns.count - 1] = turn
                }
            }
            sessionStatus = "running"

        case .tokenStreamed(let payload):
            if let idx = messages.firstIndex(where: { $0.id == payload.messageId }) {
                messages[idx].content += payload.token
                messages[idx].streaming = true
            } else {
                messages.append(ChatMessage(
                    id: payload.messageId,
                    role: .assistant,
                    content: payload.token,
                    streaming: true,
                    timestamp: event.timestamp
                ))
            }
            activityLabel = "Writing…"

        case .messageCompleted(let payload):
            if let idx = messages.firstIndex(where: {
                $0.id == payload.messageId || ($0.role == .assistant && $0.streaming)
            }) {
                messages[idx].id = payload.messageId
                messages[idx].content = payload.content
                messages[idx].streaming = false
                messages[idx].completedAt = event.timestamp
                if let turnIdx = turns.indices.last {
                    turns[turnIdx].assistantMessage = messages[idx]
                }
            } else if !payload.content.isEmpty {
                let message = ChatMessage(
                    id: payload.messageId,
                    role: .assistant,
                    content: payload.content,
                    streaming: false,
                    timestamp: event.timestamp,
                    completedAt: event.timestamp
                )
                messages.append(message)
                if let turnIdx = turns.indices.last {
                    turns[turnIdx].assistantMessage = message
                }
            }
            activityLabel = nil

        case .toolStarted(let payload):
            traces.append(ToolTrace(
                id: payload.toolCallId,
                toolName: payload.toolName,
                status: .running,
                startedAt: event.timestamp
            ))
            if var lastTurn = turns.last {
                lastTurn.traceIds.append(payload.toolCallId)
                turns[turns.count - 1] = lastTurn
            }
            activityLabel = "Running \(payload.toolName)…"

        case .toolCompleted(let payload):
            if let idx = traces.firstIndex(where: { $0.id == payload.toolCallId }) {
                traces[idx].status = payload.error != nil ? .failed : .completed
                traces[idx].completedAt = event.timestamp
                traces[idx].output = payload.output
                traces[idx].error = payload.error
            }
            let stillRunning = traces.contains { $0.status == .running }
            if !stillRunning && !messages.contains(where: { $0.streaming }) {
                activityLabel = "Thinking…"
            }

        case .usageUpdated(let payload):
            inputTokens += payload.inputTokens
            outputTokens += payload.outputTokens
            totalCost = (totalCost + payload.totalCost * 1_000_000).rounded() / 1_000_000
            currency = payload.currency
            cachedInputTokens += payload.cachedInputTokens ?? 0
            lastTTFT = payload.timeToFirstOutputMs
            lastTokPerSec = payload.outputTokensPerSecond
            lastResponseMs = payload.responseTimeMs

        case .sessionCompleted:
            sessionEndedAt = event.timestamp
            activityLabel = nil
            sessionStatus = "completed"

        case .error(let payload):
            messages.append(ChatMessage(
                id: event.id,
                role: .error,
                content: formatError(code: payload.code, message: payload.message),
                timestamp: event.timestamp
            ))
            sessionEndedAt = event.timestamp
            activityLabel = nil
            sessionStatus = "failed"

        case .checkpointSaved:
            break
        }
    }

    private func formatError(code: String, message: String) -> String {
        let lower = message.lowercased()
        if lower.contains("rate limit") || lower.contains("quota") || code == "RATE_LIMIT" {
            return "Rate limit exceeded — wait a moment and try again.\n\n\(message)"
        }
        return message
    }
}
