import SwiftUI

@main
struct PureTypeWatchApp: App {
    @StateObject private var store = TaskStore()
    @Environment(\.scenePhase) private var scenePhase

    init() {
        WatchConnectivityProvider.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(store)
                .onAppear {
                    WatchConnectivityProvider.shared.onTokenChange = {
                        store.refreshTokenState()
                        Task { await store.load() }
                    }
                    if !store.hasToken { WatchConnectivityProvider.shared.requestToken() }
                }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                WatchConnectivityProvider.shared.requestToken()
                Task { await store.load() }
            }
        }
    }
}
