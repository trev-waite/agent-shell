import SwiftUI
import RelayKit

struct ModelPickerSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var model = model

        NavigationStack {
            List {
                ForEach(model.providers, id: \.id) { provider in
                    Section(provider.label) {
                        ForEach(provider.models, id: \.id) { item in
                            modelRow(model: model, provider: provider, item: item)
                        }
                    }
                }
            }
            .navigationTitle("Model")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .frame(minWidth: 320, minHeight: 360)
    }

    @ViewBuilder
    private func modelRow(model: AppModel, provider: ProviderModelsInfo, item: ProviderModelInfo) -> some View {
        let isSelected = model.uiState.selectedModel == item.id
        Button {
            var next = model.uiState
            next.selectedModel = item.id
            model.uiState = next
            dismiss()
        } label: {
            HStack {
                Text(item.label)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(RelayPalette.streaming)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
