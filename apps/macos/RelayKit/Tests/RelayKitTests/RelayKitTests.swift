import XCTest
@testable import RelayClient
@testable import RelayState

final class SSEParserTests: XCTestCase {
    func testParsesEventBlock() throws {
        var parser = SSEParser()
        XCTAssertNil(parser.consume(line: "id: 01HQXYZ"))
        XCTAssertNil(parser.consume(line: "data: {\"id\":\"01HQXYZ\",\"sessionId\":\"s1\",\"type\":\"message.started\",\"timestamp\":1,\"payload\":{\"role\":\"user\",\"content\":\"hi\"}}"))
        let event = parser.consume(line: "")
        XCTAssertNotNil(event)
        XCTAssertEqual(event?.type, .messageStarted)
    }

    func testIgnoresHeartbeatComments() {
        var parser = SSEParser()
        XCTAssertNil(parser.consume(line: ": heartbeat"))
    }
}

final class ScrollEngineTests: XCTestCase {
    func testDetachOnScrollAway() {
        var engine = ScrollEngine()
        engine.userDidScroll(offsetFromBottom: 100)
        XCTAssertEqual(engine.followMode, .detached)
    }

    func testFollowAtLiveEdge() {
        var engine = ScrollEngine()
        engine.userDidScroll(offsetFromBottom: 10)
        XCTAssertEqual(engine.followMode, .following)
    }

    func testTokenAppendedWhileDetachedSetsUnseen() {
        var engine = ScrollEngine()
        engine.userDidScroll(offsetFromBottom: 200)
        engine.onTokenAppended()
        XCTAssertTrue(engine.hasUnseenContent)
        XCTAssertTrue(engine.showJumpToLatest)
    }

    func testJumpToLatestResumesFollowing() {
        var engine = ScrollEngine()
        engine.userDidScroll(offsetFromBottom: 200)
        engine.setStreaming(true)
        engine.jumpToLatest()
        XCTAssertEqual(engine.followMode, .following)
        XCTAssertFalse(engine.hasUnseenContent)
        XCTAssertEqual(engine.consumeCommand(), .scrollToBottom)
    }

    func testNewUserTurnScrollsToTop() {
        var engine = ScrollEngine()
        engine.onNewUserTurn(turnId: "turn-1")
        XCTAssertEqual(engine.consumeCommand(), .scrollToTurn(id: "turn-1", topInset: 80))
    }
}

final class RelayUIStateTests: XCTestCase {
    func testDeduplicatesEvents() {
        var state = RelayUIState()
        let event = RelayEvent.fixtureMessageStarted(role: "user", content: "hello")
        state.apply(event: event)
        state.apply(event: event)
        XCTAssertEqual(state.messages.count, 1)
    }

    func testTokenStreamingAppends() {
        var state = RelayUIState()
        state.apply(event: .fixtureMessageStarted(role: "assistant", content: ""))
        state.apply(event: .fixtureToken(messageId: "e1", token: "Hi"))
        XCTAssertEqual(state.messages[0].content, "Hi")
    }

    func testDecodesLegacyCostUpdated() throws {
        let json = """
        {"id":"e3","sessionId":"s1","type":"cost.updated","timestamp":1002,"payload":{"inputTokens":10,"outputTokens":5,"totalCost":0.001,"currency":"USD"}}
        """
        let event = try JSONDecoder().decode(RelayEvent.self, from: json.data(using: .utf8)!)
        XCTAssertEqual(event.type, .costUpdated)
        if case .usageUpdated(let payload) = event.payload {
            XCTAssertEqual(payload.inputTokens, 10)
            XCTAssertEqual(payload.outputTokens, 5)
        } else {
            XCTFail("Expected usage payload")
        }
    }
}

extension RelayEvent {
    static func fixtureMessageStarted(role: String, content: String) -> RelayEvent {
        let json = """
        {"id":"e1","sessionId":"s1","type":"message.started","timestamp":1000,"payload":{"role":"\(role)","content":"\(content)"}}
        """
        return try! JSONDecoder().decode(RelayEvent.self, from: json.data(using: .utf8)!)
    }

    static func fixtureToken(messageId: String, token: String) -> RelayEvent {
        let json = """
        {"id":"e2","sessionId":"s1","type":"token.streamed","timestamp":1001,"payload":{"token":"\(token)","messageId":"\(messageId)"}}
        """
        return try! JSONDecoder().decode(RelayEvent.self, from: json.data(using: .utf8)!)
    }
}
