import SwiftUI
import RelayKit

struct JumpToLatestButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label("Jump to latest", systemImage: "arrow.down.circle.fill")
                .font(.caption.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
        }
        .buttonStyle(.glass)
        .accessibilityLabel("Jump to latest message")
    }
}
