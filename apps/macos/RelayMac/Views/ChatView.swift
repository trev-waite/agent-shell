import SwiftUI
import RelayKit

struct ChatView: View {
    @Bindable var model: AppModel
    @State private var inputText = ""

    private var displayedMessages: [ChatMessage] {
        let query = model.inThreadSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return model.messages }
        return model.messages.filter { $0.content.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        VStack(spacing: 0) {
            statusStrip

            if model.showInThreadSearch {
                inThreadSearchBar
                Divider().opacity(0.2)
            }

            Group {
                if model.messages.isEmpty {
                    emptyState
                } else if displayedMessages.isEmpty {
                    noSearchMatches
                } else {
                    messageTranscript
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if model.uiState.serverOnline == false {
                offlineBanner
            }

            inputBar
        }
        .navigationTitle("Chat")
    }

    private var messageTranscript: some View {
        ZStack(alignment: .bottom) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        ForEach(displayedMessages) { message in
                            MessageRow(
                                message: message,
                                highlight: model.inThreadSearch.trimmingCharacters(in: .whitespacesAndNewlines)
                            )
                            .id(message.id)
                        }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onScrollGeometryChange(for: CGFloat.self) { geometry in
                    max(0, geometry.contentSize.height - geometry.contentOffset.y - geometry.containerSize.height)
                } action: { _, offsetFromBottom in
                    model.scrollEngine.userDidScroll(offsetFromBottom: offsetFromBottom)
                }
                .onChange(of: model.transcriptVersion) { _, _ in
                    applyScrollCommand(proxy: proxy)
                }
                .onAppear {
                    applyScrollCommand(proxy: proxy)
                }
                .overlay(alignment: .bottom) {
                    if model.scrollEngine.showJumpToLatest {
                        JumpToLatestButton {
                            model.scrollEngine.jumpToLatest()
                            applyScrollCommand(proxy: proxy)
                        }
                        .padding(.bottom, 12)
                    }
                }
            }
        }
    }

    private func applyScrollCommand(proxy: ScrollViewProxy) {
        switch model.scrollEngine.consumeCommand() {
        case .none:
            break
        case .scrollToBottom:
            guard !displayedMessages.isEmpty else { return }
            withAnimation(.easeOut(duration: 0.15)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
        case .scrollToTurn(let id, _):
            withAnimation(.easeOut(duration: 0.15)) {
                proxy.scrollTo(id, anchor: .top)
            }
        case .restoreAnchor:
            break
        }
    }

    private var statusStrip: some View {
        HStack(spacing: 8) {
            StatusDot(
                variant: model.uiState.footerStatus.dotVariant,
                pulsing: model.uiState.isStreaming
            )
            Text(model.uiState.footerStatus.label)
                .font(RelayTypography.caption.weight(.medium))
                .foregroundStyle(RelayPalette.secondaryText)

            if let activity = model.uiState.activityLabel {
                Text(activity)
                    .font(RelayTypography.caption)
                    .foregroundStyle(RelayPalette.tertiaryText)
            }

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    private var inThreadSearchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(RelayPalette.tertiaryText)
            TextField("Search in conversation", text: $model.inThreadSearch)
                .textFieldStyle(.plain)
                .onChange(of: model.inThreadSearch) { _, _ in
                    model.scrollEngine.userDidFocusSearch()
                }
            Button {
                model.showInThreadSearch = false
                model.inThreadSearch = ""
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(RelayPalette.tertiaryText)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 8)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "bubble.left.and.bubble.right")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(RelayPalette.tertiaryText)
            Text("Hello there")
                .font(RelayTypography.title)
            Text("Ask Relay anything to get started.")
                .font(RelayTypography.caption)
                .foregroundStyle(RelayPalette.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noSearchMatches: some View {
        VStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.title3)
                .foregroundStyle(RelayPalette.tertiaryText)
            Text("No matches")
                .font(RelayTypography.title)
            Text("Try a different search term.")
                .font(RelayTypography.caption)
                .foregroundStyle(RelayPalette.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var inputBar: some View {
        HStack(alignment: .center, spacing: 12) {
            MessageInputField(text: $inputText, onSubmit: submit)
                .frame(minHeight: 24)

            Button(action: submit) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 26))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(
                        inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? RelayPalette.tertiaryText
                            : RelayPalette.streaming
                    )
            }
            .buttonStyle(.plain)
            .disabled(inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor).opacity(0.55))
        )
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    private var offlineBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash")
            Text("Server offline — start with `bun run dev`")
        }
        .font(RelayTypography.caption)
        .foregroundStyle(RelayPalette.error)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        .background(RelayPalette.error.opacity(0.08))
    }

    private func submit() {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        inputText = ""
        Task { await model.sendPrompt(text) }
    }
}

private struct MessageRow: View {
    let message: ChatMessage
    var highlight: String = ""

    var body: some View {
        let isUser = message.role == .user
        let content = message.content + (message.streaming ? "▌" : "")

        highlightedText(content, query: highlight)
            .font(RelayTypography.body)
            .foregroundStyle(message.role == .error ? RelayPalette.error : Color.primary)
            .textSelection(.enabled)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background {
                if isUser {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(RelayPalette.userBubble)
                }
            }
            .frame(maxWidth: 680, alignment: isUser ? .trailing : .leading)
            .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }

    private func highlightedText(_ content: String, query: String) -> Text {
        guard !query.isEmpty,
              let range = content.range(of: query, options: .caseInsensitive) else {
            return Text(content)
        }

        let before = String(content[..<range.lowerBound])
        let match = String(content[range])
        let after = String(content[range.upperBound...])

        return Text(before)
            + Text(match).bold().foregroundStyle(RelayPalette.streaming)
            + highlightedText(after, query: query)
    }
}

struct StatusDot: View {
    let variant: StatusDotVariant
    var pulsing: Bool = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 7, height: 7)
            .opacity(pulsing && variant == .active ? 0.65 : 1)
            .animation(pulsing ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true) : .default, value: pulsing)
    }

    private var color: Color {
        switch variant {
        case .success: RelayPalette.success
        case .active: RelayPalette.streaming
        case .error: RelayPalette.error
        case .warning: RelayPalette.warning
        case .muted: RelayPalette.tertiaryText
        }
    }
}
