import SwiftUI
import RelayKit

struct ContentView: View {
    @Environment(AppModel.self) private var model
    @State private var showModelPicker = false

    var body: some View {
        @Bindable var model = model

        ZStack(alignment: .top) {
            // Two columns only — sidebar + main. Inspector lives inside main so
            // toggling it never fights the system sidebar collapse control.
            NavigationSplitView {
                SessionSidebar(model: model)
                    .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 300)
            } detail: {
                MainColumn(model: model, showModelPicker: $showModelPicker)
            }
            .navigationSplitViewStyle(.balanced)

            if let notice = model.commandNotice {
                CommandNoticeBanner(message: notice) {
                    model.commandNotice = nil
                }
                .padding(.top, 8)
            }
        }
        .sheet(isPresented: $showModelPicker) {
            ModelPickerSheet()
        }
    }
}

/// Chat + optional inspector panel, side by side in the detail column.
private struct MainColumn: View {
    @Bindable var model: AppModel
    @Binding var showModelPicker: Bool

    var body: some View {
        HStack(spacing: 0) {
            ChatView(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .toolbar { chatToolbar }

            if model.showInspector {
                Divider()
                InspectorPanel(model: model)
                    .frame(width: 240)
            }
        }
    }

    @ToolbarContentBuilder
    private var chatToolbar: some ToolbarContent {
        ToolbarItem(placement: .primaryAction) {
            Button {
                showModelPicker = true
            } label: {
                Label(model.uiState.selectedModel, systemImage: "cpu")
            }
            .help("Change model")
        }

        if model.uiState.isBusy {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    Task { await model.cancelCurrent() }
                } label: {
                    Label("Stop", systemImage: "stop.fill")
                }
            }
        }

        if model.uiState.sessionStatus == "failed" {
            ToolbarItem(placement: .automatic) {
                Button("Resume") {
                    Task { await model.resumeFromCheckpoint() }
                }
            }
        }

        ToolbarItem(placement: .automatic) {
            Button {
                model.showInspector.toggle()
            } label: {
                Label("Inspector", systemImage: "sidebar.right")
            }
            .help("Toggle metrics panel")
        }
    }
}

struct CommandNoticeBanner: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(RelayPalette.warning)
            Text(message)
                .font(RelayTypography.caption)
                .lineLimit(3)
            Spacer(minLength: 8)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.semibold))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
        .padding(.horizontal, 20)
    }
}
