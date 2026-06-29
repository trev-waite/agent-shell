import AppKit
import SwiftUI

/// AppKit-backed input — no focus ring; activates window on click.
struct MessageInputField: NSViewRepresentable {
    @Binding var text: String
    var onSubmit: () -> Void

    func makeNSView(context: Context) -> InputContainerView {
        let container = InputContainerView()
        let field = container.textField
        field.delegate = context.coordinator
        field.placeholderString = "Message Relay…"
        field.isBordered = false
        field.drawsBackground = false
        field.focusRingType = .none
        field.font = .systemFont(ofSize: NSFont.systemFontSize)
        field.lineBreakMode = .byWordWrapping
        field.maximumNumberOfLines = 6
        if let cell = field.cell as? NSTextFieldCell {
            cell.wraps = true
            cell.isScrollable = true
            cell.focusRingType = .none
        }
        container.onMouseDown = { context.coordinator.activateAndFocus(in: container) }
        return container
    }

    func updateNSView(_ container: InputContainerView, context: Context) {
        context.coordinator.parent = self
        if container.textField.stringValue != text {
            container.textField.stringValue = text
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var parent: MessageInputField

        init(parent: MessageInputField) {
            self.parent = parent
        }

        func activateAndFocus(in container: InputContainerView) {
            NSApp.setActivationPolicy(.regular)
            NSApp.activate(ignoringOtherApps: true)
            container.window?.makeKeyAndOrderFront(nil)
            container.window?.makeFirstResponder(container.textField)
        }

        func controlTextDidChange(_ obj: Notification) {
            guard let field = obj.object as? NSTextField else { return }
            parent.text = field.stringValue
        }

        func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                if NSEvent.modifierFlags.contains(.shift) {
                    return false
                }
                parent.onSubmit()
                return true
            }
            return false
        }
    }
}

final class InputContainerView: NSView {
    let textField = NSTextField()
    var onMouseDown: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        textField.translatesAutoresizingMaskIntoConstraints = false
        addSubview(textField)
        NSLayoutConstraint.activate([
            textField.topAnchor.constraint(equalTo: topAnchor),
            textField.leadingAnchor.constraint(equalTo: leadingAnchor),
            textField.trailingAnchor.constraint(equalTo: trailingAnchor),
            textField.bottomAnchor.constraint(equalTo: bottomAnchor),
            textField.heightAnchor.constraint(greaterThanOrEqualToConstant: 22),
            textField.heightAnchor.constraint(lessThanOrEqualToConstant: 120),
        ])
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    override func mouseDown(with event: NSEvent) {
        onMouseDown?()
        super.mouseDown(with: event)
    }

    override var acceptsFirstResponder: Bool { true }

    override func becomeFirstResponder() -> Bool {
        window?.makeFirstResponder(textField) ?? false
    }

    override func drawFocusRingMask() {}
    override var focusRingMaskBounds: NSRect { .zero }
}
