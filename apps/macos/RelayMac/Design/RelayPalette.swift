import SwiftUI

public enum RelayPalette {
    public static let userBubble = Color(nsColor: .secondarySystemFill).opacity(0.35)
    public static let assistantText = Color.primary
    public static let secondaryText = Color.secondary
    public static let tertiaryText = Color(nsColor: .tertiaryLabelColor)
    public static let separator = Color(nsColor: .separatorColor).opacity(0.4)
    public static let error = Color.red
    public static let success = Color.green
    public static let warning = Color.orange
    public static let streaming = Color.accentColor
    public static let toolRunning = Color.orange.opacity(0.8)
}

public enum RelayTypography {
    public static let body = Font.body
    public static let caption = Font.caption
    public static let code = Font.system(.body, design: .monospaced)
    public static let title = Font.title3.weight(.medium)
}

public struct RelayGlassModifier: ViewModifier {
    public init() {}

    public func body(content: Content) -> some View {
        content
            .glassEffect(.regular, in: .rect(cornerRadius: 16))
    }
}

public extension View {
    func relayGlass(cornerRadius: CGFloat = 16) -> some View {
        glassEffect(.regular, in: .rect(cornerRadius: cornerRadius))
    }

    func relayGlassCapsule() -> some View {
        glassEffect(.regular, in: .capsule)
    }
}
