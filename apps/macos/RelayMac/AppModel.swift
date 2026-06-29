import SwiftUI
import RelayKit

@MainActor
@Observable
final class AppModel {
    var uiState = RelayUIState()
    var scrollEngine = ScrollEngine()

    // Top-level transcript state — @Observable does not track nested struct fields reliably.
    var messages: [ChatMessage] = []
    var turns: [ConversationTurn] = []
    var traces: [ToolTrace] = []

    var sessions: [SessionSummary] = []
    var providers: [ProviderModelsInfo] = []
    var checkpoints: [CheckpointInfo] = []
    var baseURL: URL
    var showInspector = true
    var showSettings = false
    var showInThreadSearch = false
    var searchText = ""
    var inThreadSearch = ""
    var commandNotice: String?
    private(set) var transcriptVersion = 0

    private var client: RelayClient
    private var subscription: RelaySubscription?
    private var healthTask: Task<Void, Never>?

    init(baseURL: URL = URL(string: UserDefaults.standard.string(forKey: "RELAY_URL") ?? "http://127.0.0.1:4310")!) {
        self.baseURL = baseURL
        self.client = RelayClient(options: RelayClientOptions(baseURL: baseURL))
    }

    func start() {
        healthTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollHealth()
                try? await Task.sleep(for: .seconds(10))
            }
        }
        Task { await refreshModels() }
        Task { await refreshSessions() }
    }

    func stop() {
        healthTask?.cancel()
        subscription?.cancel()
    }

    func updateBaseURL(_ url: URL) {
        baseURL = url
        UserDefaults.standard.set(url.absoluteString, forKey: "RELAY_URL")
        client = RelayClient(options: RelayClientOptions(baseURL: url))
        Task { await pollHealth() }
    }

    func refreshSessions() async {
        do {
            sessions = try await client.listSessions()
            if uiState.sessionId == nil, let first = sessions.first {
                await openSession(first.id)
            }
        } catch {
            sessions = []
            commandNotice = "Could not load sessions: \(error.localizedDescription)"
        }
    }

    func refreshModels() async {
        do {
            let response = try await client.listModels()
            providers = response.providers
            if let defaultModel = providers.first?.defaultModel {
                var next = uiState
                next.selectedModel = defaultModel
                uiState = next
            }
        } catch {
            providers = []
            commandNotice = "Could not load models: \(error.localizedDescription)"
        }
    }

    func pollHealth() async {
        do {
            var next = uiState
            next.serverOnline = try await client.health()
            uiState = next
        } catch {
            var next = uiState
            next.serverOnline = false
            uiState = next
        }
    }

    func openSession(_ sessionId: String) async {
        subscription?.cancel()
        uiState.resetSession(keepingModel: true)
        uiState.sessionId = sessionId
        clearTranscript()

        do {
            let events = try await client.replaySession(sessionId: sessionId)
            if events.isEmpty {
                commandNotice = "Session has no replay events."
            } else {
                for event in events {
                    var next = uiState
                    next.apply(event: event)
                    uiState = next
                }
                finalizeReplayedSession(events: events)
                syncTranscript()
            }
        } catch {
            commandNotice = "Could not load conversation: \(error.localizedDescription)"
        }

        if let lastUserId = uiState.lastUserMessageId {
            scrollEngine.onSessionReopen(lastUserTurnId: lastUserId)
        }

        subscribe(sessionId: sessionId)
    }

    func newSession() async {
        if let sessionId = uiState.sessionId {
            try? await client.cancel(sessionId: sessionId)
        }
        subscription?.cancel()
        uiState.resetSession()
        clearTranscript()
        scrollEngine = ScrollEngine()
    }

    func sendPrompt(_ prompt: String) async {
        let trimmed = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if uiState.isBusy {
            var next = uiState
            next.messageQueue.append(trimmed)
            uiState = next
            return
        }

        do {
            let sessionId = try await client.send(SendOptions(
                prompt: trimmed,
                model: uiState.selectedModel,
                sessionId: uiState.sessionId
            ))
            if uiState.sessionId != sessionId {
                var next = uiState
                next.sessionId = sessionId
                uiState = next
            }
            subscribe(sessionId: sessionId)
            await refreshSessions()
        } catch {
            commandNotice = error.localizedDescription
        }
    }

    func flushMessageQueueIfIdle() async {
        guard !uiState.isBusy, let next = uiState.messageQueue.first else { return }
        var state = uiState
        state.messageQueue.removeFirst()
        uiState = state
        await sendPrompt(next)
    }

    func cancelCurrent() async {
        guard let sessionId = uiState.sessionId else { return }
        try? await client.cancel(sessionId: sessionId)
        scrollEngine.onCancelOrError()
    }

    func resumeFromCheckpoint() async {
        guard let sessionId = uiState.sessionId else { return }
        do {
            checkpoints = try await client.listCheckpoints(sessionId: sessionId)
            _ = try await client.rerun(RerunOptions(sessionId: sessionId, checkpointId: checkpoints.last?.checkpointId))
            subscribe(sessionId: sessionId)
        } catch {
            commandNotice = error.localizedDescription
        }
    }

    private func subscribe(sessionId: String) {
        subscription?.cancel()
        subscription = client.subscribe(SubscribeOptions(
            sessionId: sessionId,
            lastEventId: uiState.lastEventId,
            onEvent: { [weak self] event in
                Task { @MainActor in
                    self?.applyEvent(event, fromReplay: false)
                }
            },
            onConnect: { [weak self] in
                Task { @MainActor in
                    guard let self else { return }
                    var next = self.uiState
                    next.streamConnected = true
                    self.uiState = next
                }
            },
            onError: { [weak self] error in
                Task { @MainActor in
                    guard let self else { return }
                    var next = self.uiState
                    next.streamConnected = false
                    self.uiState = next
                    self.commandNotice = error.localizedDescription
                }
            },
            onClose: { [weak self] in
                Task { @MainActor in
                    guard let self else { return }
                    var next = self.uiState
                    next.streamConnected = false
                    self.uiState = next
                }
            }
        ))
    }

    private func applyEvent(_ event: RelayEvent, fromReplay: Bool) {
        var next = uiState
        next.apply(event: event)
        uiState = next
        syncTranscript()

        if case .messageStarted(let payload) = event.payload, payload.role == "user", !fromReplay {
            scrollEngine.onNewUserTurn(turnId: event.id)
        }

        if case .tokenStreamed = event.payload {
            scrollEngine.onTokenAppended()
        }

        scrollEngine.setStreaming(uiState.isStreaming)

        if case .sessionCompleted = event.payload {
            AccessibilityNotification.Announcement("Session completed").post()
        }

        if case .error = event.payload {
            AccessibilityNotification.Announcement("Session failed").post()
        }

        flushQueueIfIdle()
    }

    private func syncTranscript() {
        messages = uiState.messages
        turns = uiState.turns
        traces = uiState.traces
        transcriptVersion += 1
    }

    private func clearTranscript() {
        messages = []
        turns = []
        traces = []
        transcriptVersion += 1
    }

    private func finalizeReplayedSession(events: [RelayEvent]) {
        guard !uiState.messages.isEmpty else { return }
        var next = uiState
        next.activityLabel = nil
        if events.contains(where: { $0.type == .sessionCompleted }) {
            next.sessionStatus = "completed"
        }
        uiState = next
    }

    private func flushQueueIfIdle() {
        guard !uiState.isBusy, !uiState.messageQueue.isEmpty else { return }
        Task { await flushMessageQueueIfIdle() }
    }

    var filteredSessions: [SessionSummary] {
        guard !searchText.isEmpty else { return sessions }
        return sessions.filter { $0.prompt.localizedCaseInsensitiveContains(searchText) }
    }
}
