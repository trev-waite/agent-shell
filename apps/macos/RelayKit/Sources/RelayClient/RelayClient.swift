import Foundation
import RelayModels

public struct RelayClientOptions: Sendable {
    public var baseURL: URL
    public var headers: [String: String]

    public init(baseURL: URL = URL(string: "http://127.0.0.1:4310")!, headers: [String: String] = [:]) {
        self.baseURL = baseURL
        self.headers = headers
    }
}

public struct SendOptions: Sendable {
    public var prompt: String
    public var model: String?
    public var sessionId: String?

    public init(prompt: String, model: String? = nil, sessionId: String? = nil) {
        self.prompt = prompt
        self.model = model
        self.sessionId = sessionId
    }
}

public struct SubscribeOptions: Sendable {
    public var sessionId: String
    public var lastEventId: String?
    public var onEvent: @Sendable (RelayEvent) -> Void
    public var onConnect: (@Sendable () -> Void)?
    public var onError: (@Sendable (Error) -> Void)?
    public var onClose: (@Sendable () -> Void)?

    public init(
        sessionId: String,
        lastEventId: String? = nil,
        onEvent: @escaping @Sendable (RelayEvent) -> Void,
        onConnect: (@Sendable () -> Void)? = nil,
        onError: (@Sendable (Error) -> Void)? = nil,
        onClose: (@Sendable () -> Void)? = nil
    ) {
        self.sessionId = sessionId
        self.lastEventId = lastEventId
        self.onEvent = onEvent
        self.onConnect = onConnect
        self.onError = onError
        self.onClose = onClose
    }
}

public struct ReplayOptions: Sendable {
    public var sessionId: String
    public var onEvent: @Sendable (RelayEvent) -> Void
    public var onComplete: (@Sendable () -> Void)?
    public var onError: (@Sendable (Error) -> Void)?

    public init(
        sessionId: String,
        onEvent: @escaping @Sendable (RelayEvent) -> Void,
        onComplete: (@Sendable () -> Void)? = nil,
        onError: (@Sendable (Error) -> Void)? = nil
    ) {
        self.sessionId = sessionId
        self.onEvent = onEvent
        self.onComplete = onComplete
        self.onError = onError
    }
}

public struct RerunOptions: Sendable {
    public var sessionId: String
    public var checkpointId: String?
    public var model: String?

    public init(sessionId: String, checkpointId: String? = nil, model: String? = nil) {
        self.sessionId = sessionId
        self.checkpointId = checkpointId
        self.model = model
    }
}

public protocol RelayClientProtocol: Sendable {
    func send(_ options: SendOptions) async throws -> String
    func listModels() async throws -> ModelsResponse
    func listSessions() async throws -> [SessionSummary]
    func listCheckpoints(sessionId: String) async throws -> [CheckpointInfo]
    func rerun(_ options: RerunOptions) async throws -> String
    func cancel(sessionId: String) async throws
    func health() async throws -> Bool
    func subscribe(_ options: SubscribeOptions) -> RelaySubscription
    func replay(_ options: ReplayOptions) -> RelaySubscription
}

public final class RelaySubscription: @unchecked Sendable {
    private let cancelHandler: @Sendable () -> Void

    init(cancelHandler: @escaping @Sendable () -> Void) {
        self.cancelHandler = cancelHandler
    }

    public func cancel() {
        cancelHandler()
    }
}

public final class RelayClient: RelayClientProtocol, @unchecked Sendable {
    private let options: RelayClientOptions
    private let session: URLSession
    private let decoder: JSONDecoder

    public init(options: RelayClientOptions = RelayClientOptions()) {
        self.options = options
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    public func send(_ sendOptions: SendOptions) async throws -> String {
        let url: URL
        if let sessionId = sendOptions.sessionId {
            url = options.baseURL.appendingPathComponent("sessions/\(sessionId)/messages")
        } else {
            url = options.baseURL.appendingPathComponent("sessions")
        }

        var body: [String: String] = ["prompt": sendOptions.prompt]
        if let model = sendOptions.model {
            body["model"] = model
        }

        let data = try await postJSON(url: url, body: body)
        struct Response: Decodable { let sessionId: String }
        return try decoder.decode(Response.self, from: data).sessionId
    }

    public func listModels() async throws -> ModelsResponse {
        let data = try await get(url: options.baseURL.appendingPathComponent("models"))
        return try decoder.decode(ModelsResponse.self, from: data)
    }

    public func listSessions() async throws -> [SessionSummary] {
        let data = try await get(url: options.baseURL.appendingPathComponent("sessions"))
        return try decoder.decode([SessionSummary].self, from: data)
    }

    public func listCheckpoints(sessionId: String) async throws -> [CheckpointInfo] {
        let url = options.baseURL.appendingPathComponent("sessions/\(sessionId)/checkpoints")
        let data = try await get(url: url)
        struct Response: Decodable { let checkpoints: [CheckpointInfo] }
        return try decoder.decode(Response.self, from: data).checkpoints
    }

    public func rerun(_ rerunOptions: RerunOptions) async throws -> String {
        let url = options.baseURL.appendingPathComponent("sessions/\(rerunOptions.sessionId)/rerun")
        var body: [String: String] = [:]
        if let checkpointId = rerunOptions.checkpointId { body["checkpointId"] = checkpointId }
        if let model = rerunOptions.model { body["model"] = model }
        let data = try await postJSON(url: url, body: body)
        struct Response: Decodable { let sessionId: String }
        return try decoder.decode(Response.self, from: data).sessionId
    }

    public func cancel(sessionId: String) async throws {
        let url = options.baseURL.appendingPathComponent("sessions/\(sessionId)/cancel")
        _ = try await postJSON(url: url, body: [String: String]())
    }

    public func health() async throws -> Bool {
        let url = options.baseURL.appendingPathComponent("health")
        let data = try await get(url: url)
        struct Response: Decodable { let status: String }
        let response = try decoder.decode(Response.self, from: data)
        return response.status == "ok"
    }

    public func subscribe(_ subscribeOptions: SubscribeOptions) -> RelaySubscription {
        let task = Task { [weak self] in
            guard let self else { return }
            await self.runLiveSSE(subscribeOptions)
        }
        return RelaySubscription { task.cancel() }
    }

    public func replay(_ replayOptions: ReplayOptions) -> RelaySubscription {
        let task = Task { [weak self] in
            guard let self else { return }
            await self.runReplaySSE(replayOptions)
        }
        return RelaySubscription { task.cancel() }
    }

    /// Replays a session and returns all parsed events in order.
    public func replaySession(sessionId: String) async throws -> [RelayEvent] {
        let url = options.baseURL.appendingPathComponent("sessions/\(sessionId)/replay")
        var request = URLRequest(url: url)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        applyHeaders(&request)

        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw RelayClientError.invalidResponse
        }

        var events: [RelayEvent] = []
        var dataLines = 0
        var parser = SSEParser()
        for try await line in bytes.lines {
            if Task.isCancelled { break }
            if line.hasPrefix("data:") { dataLines += 1 }
            if let event = parser.consume(line: line) {
                events.append(event)
            }
        }
        if events.isEmpty && dataLines > 0 {
            throw RelayClientError.decodeError(lineCount: dataLines)
        }
        return events
    }

    // MARK: - HTTP helpers

    private func get(url: URL) async throws -> Data {
        var request = URLRequest(url: url)
        applyHeaders(&request)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return data
    }

    private func postJSON(url: URL, body: [String: String]) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        applyHeaders(&request)
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return data
    }

    private func applyHeaders(_ request: inout URLRequest) {
        for (key, value) in options.headers {
            request.setValue(value, forHTTPHeaderField: key)
        }
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw RelayClientError.invalidResponse
        }
        guard (200 ... 299).contains(http.statusCode) else {
            let text = String(data: data, encoding: .utf8) ?? ""
            throw RelayClientError.httpError(status: http.statusCode, body: text)
        }
    }

    // MARK: - SSE

    private func runLiveSSE(_ options: SubscribeOptions) async {
        var lastEventId = options.lastEventId
        while !Task.isCancelled {
            do {
                var url = self.options.baseURL
                    .appendingPathComponent("sessions/\(options.sessionId)/events")
                if let lastEventId {
                    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
                    components.queryItems = [URLQueryItem(name: "after", value: lastEventId)]
                    url = components.url!
                }

                var request = URLRequest(url: url)
                request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                if let lastEventId {
                    request.setValue(lastEventId, forHTTPHeaderField: "Last-Event-ID")
                }
                applyHeaders(&request)

                let (bytes, response) = try await session.bytes(for: request)
                guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                    throw RelayClientError.invalidResponse
                }

                options.onConnect?()
                var parser = SSEParser()
                for try await line in bytes.lines {
                    if Task.isCancelled { return }
                    if let event = parser.consume(line: line) {
                        lastEventId = event.id
                        options.onEvent(event)
                    }
                }

                if !Task.isCancelled {
                    options.onClose?()
                    try await Task.sleep(for: .seconds(1))
                }
            } catch {
                if Task.isCancelled { return }
                options.onError?(error)
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }

    private func runReplaySSE(_ options: ReplayOptions) async {
        do {
            let url = self.options.baseURL.appendingPathComponent("sessions/\(options.sessionId)/replay")
            var request = URLRequest(url: url)
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            applyHeaders(&request)

            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                throw RelayClientError.invalidResponse
            }

            var parser = SSEParser()
            for try await line in bytes.lines {
                if Task.isCancelled { return }
                if let event = parser.consume(line: line) {
                    options.onEvent(event)
                }
            }
            options.onComplete?()
        } catch {
            if !Task.isCancelled {
                options.onError?(error)
            }
        }
    }
}

public enum RelayClientError: Error, LocalizedError {
    case invalidResponse
    case httpError(status: Int, body: String)
    case decodeError(lineCount: Int)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid server response"
        case .httpError(let status, let body): return "HTTP \(status): \(body)"
        case .decodeError(let count): return "Could not decode \(count) server events"
        }
    }
}

/// Line-based SSE parser matching @relay/sdk behavior.
public struct SSEParser: Sendable {
    private var eventId: String?
    private var data: String?

    public init() {}

    public mutating func consume(line: String) -> RelayEvent? {
        let trimmed = line.hasSuffix("\r") ? String(line.dropLast()) : line

        if trimmed.hasPrefix(":") {
            return nil
        }

        if trimmed.hasPrefix("id:") {
            eventId = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            return nil
        }

        if trimmed.hasPrefix("data:") {
            data = String(trimmed.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            return nil
        }

        if trimmed.isEmpty, let data {
            defer {
                self.data = nil
                self.eventId = nil
            }
            guard let jsonData = data.data(using: .utf8) else { return nil }
            do {
                return try JSONDecoder().decode(RelayEvent.self, from: jsonData)
            } catch {
                return nil
            }
        }

        return nil
    }
}
