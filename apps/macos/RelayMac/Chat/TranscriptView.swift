import SwiftUI
import RelayKit

/// SwiftUI transcript — reliable rendering; scroll commands from ScrollEngine.
struct TranscriptView: View {
    let turns: [ConversationTurn]
    let messages: [ChatMessage]
    let traces: [ToolTrace]
    let revision: Int
    @Binding var scrollEngine: ScrollEngine
    var onScrollOffset: (CGFloat) -> Void
    var onTextSelection: () -> Void

    @State private var bottomMarker = "transcript-bottom"

    private var displayTurns: [ConversationTurn] {
        if !turns.isEmpty { return turns }
        return synthesizedTurns(from: messages)
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(displayTurns) { turn in
                        TranscriptTurnView(
                            turn: turn,
                            messages: messages,
                            traces: traces,
                            onTextSelection: onTextSelection
                        )
                        .id(turn.id)
                    }
                    Color.clear
                        .frame(height: 1)
                        .id(bottomMarker)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                max(0, geometry.contentSize.height - geometry.contentOffset.y - geometry.containerSize.height)
            } action: { _, offsetFromBottom in
                onScrollOffset(offsetFromBottom)
            }
            .onChange(of: revision) { _, _ in
                applyScrollCommand(scrollEngine.consumeCommand(), proxy: proxy)
            }
            .onAppear {
                applyScrollCommand(scrollEngine.consumeCommand(), proxy: proxy)
            }
        }
    }

    private func applyScrollCommand(_ command: ScrollCommand, proxy: ScrollViewProxy) {
        switch command {
        case .none:
            break
        case .scrollToBottom:
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(bottomMarker, anchor: .bottom)
            }
        case .scrollToTurn(let id, _):
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(id, anchor: .top)
            }
        case .restoreAnchor:
            break
        }
    }

    private func synthesizedTurns(from messages: [ChatMessage]) -> [ConversationTurn] {
        var result: [ConversationTurn] = []
        var current: ConversationTurn?

        for message in messages {
            switch message.role {
            case .user:
                if let open = current {
                    result.append(open)
                }
                var turn = ConversationTurn(id: message.id)
                turn.userMessage = message
                current = turn
            case .assistant:
                if var open = current {
                    open.assistantMessage = message
                    current = open
                } else {
                    var turn = ConversationTurn(id: message.id)
                    turn.assistantMessage = message
                    current = turn
                }
            case .error:
                if let open = current {
                    result.append(open)
                    current = nil
                }
                var turn = ConversationTurn(id: message.id)
                turn.assistantMessage = message
                result.append(turn)
            }
        }

        if let open = current {
            result.append(open)
        }
        return result
    }
}

private struct TranscriptTurnView: View {
    let turn: ConversationTurn
    let messages: [ChatMessage]
    let traces: [ToolTrace]
    var onTextSelection: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let user = turn.userMessage ?? messages.first(where: { $0.id == turn.id && $0.role == .user }) {
                MessageBubble(message: user, isUser: true)
            }

            if let assistant = turn.assistantMessage ?? assistantMessage(for: turn) {
                MessageBubble(message: assistant, isUser: false)
            }

            ForEach(turn.traceIds, id: \.self) { traceId in
                if let trace = traces.first(where: { $0.id == traceId }) {
                    TraceChip(trace: trace)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func assistantMessage(for turn: ConversationTurn) -> ChatMessage? {
        guard let userTs = turn.userMessage?.timestamp else { return nil }
        let nextUserTs = messages.first(where: { $0.role == .user && $0.timestamp > userTs })?.timestamp
        return messages.first(where: { message in
            message.role == .assistant
                && message.timestamp >= userTs
                && (nextUserTs == nil || message.timestamp < nextUserTs!)
        })
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    let isUser: Bool

    var body: some View {
        Text(message.content + (message.streaming ? "▌" : ""))
            .font(RelayTypography.body)
            .foregroundStyle(message.role == .error ? RelayPalette.error : RelayPalette.assistantText)
            .textSelection(.enabled)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: 680, alignment: isUser ? .trailing : .leading)
            .background {
                if isUser {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(RelayPalette.userBubble)
                }
            }
            .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}

private struct TraceChip: View {
    let trace: ToolTrace

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(trace.status == .running ? RelayPalette.toolRunning : RelayPalette.tertiaryText)
                .frame(width: 6, height: 6)
            Text(trace.toolName)
                .font(RelayTypography.caption.weight(.medium))
            Spacer()
            Text(trace.status.rawValue)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(RelayPalette.tertiaryText)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(RelayPalette.separator.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
    }
}
