import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var urlString: String = ""

    var body: some View {
        Form {
            Section("Connection") {
                TextField("Relay server URL", text: $urlString)
                    .textFieldStyle(.roundedBorder)
                HStack {
                    StatusDot(variant: model.uiState.serverOnline == true ? .success : .error)
                    Text(model.uiState.serverOnline == true ? "Connected" : "Offline")
                }
                Button("Apply URL") {
                    if let url = URL(string: urlString) {
                        model.updateBaseURL(url)
                    }
                }
            }

            Section("API Key") {
                Text("Set GEMINI_API_KEY in your Relay server environment.")
                    .font(RelayTypography.caption)
                    .foregroundStyle(RelayPalette.secondaryText)
            }

            Section("Server (Future)") {
                ServerManagerSettingsView()
            }
        }
        .formStyle(.grouped)
        .frame(width: 420, height: 320)
        .onAppear { urlString = model.baseURL.absoluteString }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }
}

/// Phase 3 placeholder — server bundling UI scaffold.
struct ServerManagerSettingsView: View {
    @State private var serverStatus = "External (manual start)"

    var body: some View {
        LabeledContent("Status", value: serverStatus)
        Text("Bundled server management will appear here in a future release.")
            .font(RelayTypography.caption)
            .foregroundStyle(RelayPalette.tertiaryText)
    }
}
