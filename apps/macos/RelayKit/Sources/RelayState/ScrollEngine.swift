import Foundation

public enum ScrollFollowMode: Equatable, Sendable {
    case detached
    case following
}

public struct ScrollAnchor: Equatable, Sendable {
    public let distanceFromBottom: CGFloat
    public let visibleTurnId: String?

    public init(distanceFromBottom: CGFloat, visibleTurnId: String?) {
        self.distanceFromBottom = distanceFromBottom
        self.visibleTurnId = visibleTurnId
    }
}

public enum ScrollCommand: Equatable, Sendable {
    case none
    case scrollToTurn(id: String, topInset: CGFloat)
    case scrollToBottom
    case restoreAnchor(ScrollAnchor)
}

public struct ScrollEngine: Sendable {
    public static let liveEdgeThreshold: CGFloat = 24
    public static let newTurnTopInset: CGFloat = 80
    public static let priorContextHeight: CGFloat = 120

    public private(set) var followMode: ScrollFollowMode = .detached
    public private(set) var isStreaming = false
    public private(set) var hasUnseenContent = false
    public private(set) var pendingCommand: ScrollCommand = .none

    public init() {}

    public var showJumpToLatest: Bool {
        followMode == .detached && (hasUnseenContent || isStreaming)
    }

    public mutating func consumeCommand() -> ScrollCommand {
        defer { pendingCommand = .none }
        return pendingCommand
    }

    public mutating func userDidScroll(offsetFromBottom: CGFloat) {
        if offsetFromBottom <= Self.liveEdgeThreshold {
            followMode = .following
            hasUnseenContent = false
        } else {
            followMode = .detached
        }
    }

    public mutating func userDidSelectText() {
        followMode = .detached
    }

    public mutating func userDidFocusSearch() {
        followMode = .detached
    }

    public mutating func userDidNavigateWithKeyboard() {
        followMode = .detached
    }

    public mutating func userDidClickLink() {
        followMode = .detached
    }

    public mutating func setStreaming(_ streaming: Bool) {
        isStreaming = streaming
        if !streaming && followMode == .following {
            hasUnseenContent = false
        }
    }

    public mutating func onNewUserTurn(turnId: String) {
        followMode = .following
        hasUnseenContent = false
        pendingCommand = .scrollToTurn(id: turnId, topInset: Self.newTurnTopInset)
    }

    public mutating func onTokenAppended() {
        switch followMode {
        case .following:
            pendingCommand = .scrollToBottom
            hasUnseenContent = false
        case .detached:
            hasUnseenContent = true
        }
    }

    public mutating func onContentLayoutChanged(anchor: ScrollAnchor) {
        guard followMode == .detached else { return }
        pendingCommand = .restoreAnchor(anchor)
    }

    public mutating func onSessionReopen(lastUserTurnId: String) {
        followMode = .detached
        hasUnseenContent = false
        pendingCommand = .scrollToTurn(id: lastUserTurnId, topInset: Self.newTurnTopInset)
    }

    public mutating func jumpToLatest() {
        followMode = .following
        hasUnseenContent = false
        pendingCommand = .scrollToBottom
    }

    public mutating func onCancelOrError() {
        // Rule 13: do not change scroll position on interruption
    }
}
