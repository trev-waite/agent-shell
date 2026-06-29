import SwiftUI
import RelayKit

struct InspectorPanel: View {
    @Bindable var model: AppModel

    private var uiState: RelayUIState { model.uiState }

    private var isIdle: Bool {
        uiState.sessionStatus == "idle" && !model.messages.contains { $0.streaming }
    }

    private var compactMetrics: [MetricCellData] {
        uiState.metricsGrid.filter { ["status", "tokens", "cost"].contains($0.id) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if !model.traces.isEmpty {
                    tracesSection
                }
                metricsSection
            }
            .padding(16)
        }
        .navigationTitle("Metrics")
    }

    private var tracesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Tools")

            ForEach(model.traces) { trace in
                HStack(spacing: 8) {
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
                .padding(.vertical, 6)
            }
        }
    }

    private var metricsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Session")

            if isIdle && uiState.inputTokens == 0 {
                Text("No activity yet")
                    .font(RelayTypography.caption)
                    .foregroundStyle(RelayPalette.tertiaryText)
                    .padding(.vertical, 4)
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    ForEach(isIdle ? compactMetrics : uiState.metricsGrid) { cell in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(cell.label)
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(RelayPalette.tertiaryText)
                            Text(cell.value)
                                .font(RelayTypography.caption)
                                .foregroundStyle(metricColor(cell.colorKey))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 6)
                        .padding(.horizontal, 8)
                        .background(RelayPalette.separator.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(RelayPalette.tertiaryText)
            .tracking(0.5)
    }

    private func metricColor(_ key: MetricColorKey) -> Color {
        switch key {
        case .text: RelayPalette.assistantText
        case .status: RelayPalette.success
        case .motion: RelayPalette.streaming
        case .error: RelayPalette.error
        }
    }
}
