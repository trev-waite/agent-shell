import AppKit
import SwiftUI

@main
struct RelayMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .frame(minWidth: 900, minHeight: 600)
                .onAppear { model.start() }
                .onDisappear { model.stop() }
        }
        .defaultLaunchBehavior(.presented)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Chat") {
                    Task { await model.newSession() }
                }
                .keyboardShortcut("n", modifiers: .command)
            }
            CommandGroup(after: .appSettings) {
                Button("Find in Conversation") {
                    model.showInThreadSearch.toggle()
                }
                .keyboardShortcut("f", modifiers: .command)
                Button("Stop") {
                    Task { await model.cancelCurrent() }
                }
                .keyboardShortcut(".", modifiers: .command)
                Button("Toggle Inspector") {
                    model.showInspector.toggle()
                }
                .keyboardShortcut("s", modifiers: [.command, .shift])
            }
        }

        Settings {
            SettingsView()
                .environment(model)
        }
    }
}
