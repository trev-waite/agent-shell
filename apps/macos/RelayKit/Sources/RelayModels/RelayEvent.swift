import Foundation

public enum EventType: String, Codable, Sendable {
    case messageStarted = "message.started"
    case tokenStreamed = "token.streamed"
    case toolStarted = "tool.started"
    case toolCompleted = "tool.completed"
    case checkpointSaved = "checkpoint.saved"
    case usageUpdated = "usage.updated"
    case costUpdated = "cost.updated"
    case sessionCompleted = "session.completed"
    case messageCompleted = "message.completed"
    case error
}

public struct RelayEventBase: Codable, Sendable {
    public let id: String
    public let sessionId: String
    public let type: EventType
    public let timestamp: Int64
}

public struct MessageStartedPayload: Codable, Sendable {
    public let role: String
    public let content: String
}

public struct TokenStreamedPayload: Codable, Sendable {
    public let token: String
    public let messageId: String
}

public struct ToolStartedPayload: Codable, Sendable {
    public let toolCallId: String
    public let toolName: String
    public let input: JSONValue?
}

public struct ToolCompletedPayload: Codable, Sendable {
    public let toolCallId: String
    public let toolName: String
    public let output: JSONValue?
    public let error: String?
}

public struct CheckpointSavedPayload: Codable, Sendable {
    public let checkpointId: String
    public let label: String?
    public let data: JSONValue?
}

public struct UsageUpdatedPayload: Codable, Sendable {
    public let inputTokens: Int
    public let outputTokens: Int
    public let totalCost: Double
    public let currency: String
    public let cachedInputTokens: Int?
    public let reasoningTokens: Int?
    public let responseTimeMs: Double?
    public let timeToFirstOutputMs: Double?
    public let outputTokensPerSecond: Double?
}

public struct SessionCompletedPayload: Codable, Sendable {
    public let iteration: Int
}

public struct MessageCompletedPayload: Codable, Sendable {
    public let messageId: String
    public let role: String
    public let content: String
}

public struct ErrorPayload: Codable, Sendable {
    public let code: String
    public let message: String
    public let recoverable: Bool?
}

public enum JSONValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

public struct RelayEvent: Codable, Sendable, Identifiable {
    public let id: String
    public let sessionId: String
    public let type: EventType
    public let timestamp: Int64
    public let payload: EventPayload

    enum CodingKeys: String, CodingKey {
        case id, sessionId, type, timestamp, payload
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        sessionId = try container.decode(String.self, forKey: .sessionId)
        type = try container.decode(EventType.self, forKey: .type)
        timestamp = try container.decode(Int64.self, forKey: .timestamp)
        payload = try EventPayload.decode(type: type, from: container.superDecoder(forKey: .payload))
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(sessionId, forKey: .sessionId)
        try container.encode(type, forKey: .type)
        try container.encode(timestamp, forKey: .timestamp)
        try payload.encode(to: container.superEncoder(forKey: .payload))
    }
}

public enum EventPayload: Sendable {
    case messageStarted(MessageStartedPayload)
    case tokenStreamed(TokenStreamedPayload)
    case toolStarted(ToolStartedPayload)
    case toolCompleted(ToolCompletedPayload)
    case checkpointSaved(CheckpointSavedPayload)
    case usageUpdated(UsageUpdatedPayload)
    case sessionCompleted(SessionCompletedPayload)
    case messageCompleted(MessageCompletedPayload)
    case error(ErrorPayload)

    static func decode(type: EventType, from decoder: Decoder) throws -> EventPayload {
        switch type {
        case .messageStarted: return .messageStarted(try MessageStartedPayload(from: decoder))
        case .tokenStreamed: return .tokenStreamed(try TokenStreamedPayload(from: decoder))
        case .toolStarted: return .toolStarted(try ToolStartedPayload(from: decoder))
        case .toolCompleted: return .toolCompleted(try ToolCompletedPayload(from: decoder))
        case .checkpointSaved: return .checkpointSaved(try CheckpointSavedPayload(from: decoder))
        case .usageUpdated: return .usageUpdated(try UsageUpdatedPayload(from: decoder))
        case .costUpdated: return .usageUpdated(try UsageUpdatedPayload(from: decoder))
        case .sessionCompleted: return .sessionCompleted(try SessionCompletedPayload(from: decoder))
        case .messageCompleted: return .messageCompleted(try MessageCompletedPayload(from: decoder))
        case .error: return .error(try ErrorPayload(from: decoder))
        }
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case .messageStarted(let p): try p.encode(to: encoder)
        case .tokenStreamed(let p): try p.encode(to: encoder)
        case .toolStarted(let p): try p.encode(to: encoder)
        case .toolCompleted(let p): try p.encode(to: encoder)
        case .checkpointSaved(let p): try p.encode(to: encoder)
        case .usageUpdated(let p): try p.encode(to: encoder)
        case .sessionCompleted(let p): try p.encode(to: encoder)
        case .messageCompleted(let p): try p.encode(to: encoder)
        case .error(let p): try p.encode(to: encoder)
        }
    }
}

public struct SessionSummary: Codable, Sendable, Identifiable {
    public let id: String
    public let prompt: String
    public let createdAt: Int64
}

public struct ProviderModelInfo: Codable, Sendable {
    public let id: String
    public let label: String
}

public struct ProviderModelsInfo: Codable, Sendable {
    public let id: String
    public let label: String
    public let enabled: Bool
    public let defaultModel: String?
    public let models: [ProviderModelInfo]

    enum CodingKeys: String, CodingKey {
        case id, label, enabled, defaultModel = "default", models
    }
}

public struct ModelsResponse: Codable, Sendable {
    public let providers: [ProviderModelsInfo]
}

public struct CheckpointInfo: Codable, Sendable, Identifiable {
    public let checkpointId: String
    public let label: String?
    public let timestamp: Int64
    public let iteration: Int?

    public var id: String { checkpointId }
}

public enum SessionStatus: String, Sendable {
    case idle, running, paused, completed, failed, cancelled
}
