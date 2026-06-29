import SwiftUI
import RelayKit

struct SessionSidebar: View {
    @Bindable var model: AppModel
    @State private var selectedSessionId: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.caption)
                    .foregroundStyle(RelayPalette.tertiaryText)
                TextField("Search sessions", text: $model.searchText)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(RelayPalette.separator.opacity(0.12), in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 6)

            if model.sessions.isEmpty {
                Text("No sessions")
                    .font(RelayTypography.caption)
                    .foregroundStyle(RelayPalette.tertiaryText)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(model.filteredSessions, selection: $selectedSessionId) { session in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(session.prompt)
                            .lineLimit(2)
                            .font(.body)
                        Text(sessionDate(session))
                            .font(.system(size: 11))
                            .foregroundStyle(RelayPalette.tertiaryText)
                    }
                    .tag(session.id)
                    .padding(.vertical, 3)
                }
                .listStyle(.sidebar)
            }
        }
        .navigationTitle("Relay")
        .onChange(of: selectedSessionId) { _, newId in
            guard let newId else { return }
            if newId == model.uiState.sessionId && !model.messages.isEmpty { return }
            Task { await model.openSession(newId) }
        }
        .onAppear {
            selectedSessionId = model.uiState.sessionId
        }
        .onChange(of: model.uiState.sessionId) { _, newId in
            if selectedSessionId != newId {
                selectedSessionId = newId
            }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await model.newSession() }
                } label: {
                    Label("New Chat", systemImage: "square.and.pencil")
                }
            }
        }
    }

    private func sessionDate(_ session: SessionSummary) -> String {
        let date = Date(timeIntervalSince1970: Double(session.createdAt) / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
