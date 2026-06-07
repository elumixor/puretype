import Foundation
import WatchConnectivity

/// Receives the auth token (and optional API base URL) pushed from the iPhone
/// app and persists it to the App Group so both the watch app and the
/// complication can authenticate. Also actively requests the token on launch
/// in case the phone hasn't pushed yet.
final class WatchConnectivityProvider: NSObject, WCSessionDelegate {
    static let shared = WatchConnectivityProvider()

    var onTokenChange: (() -> Void)?

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    /// Ask the phone to send the current token (used if the app group is empty).
    func requestToken() {
        guard WCSession.default.activationState == .activated,
              WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["request": "token"], replyHandler: { [weak self] reply in
            self?.ingest(reply)
        }, errorHandler: nil)
    }

    private func ingest(_ dict: [String: Any]) {
        var changed = false
        if let token = dict[Shared.Keys.token] as? String {
            let existing = Shared.defaults.string(forKey: Shared.Keys.token)
            if existing != token {
                if token.isEmpty { Shared.defaults.removeObject(forKey: Shared.Keys.token) }
                else { Shared.defaults.set(token, forKey: Shared.Keys.token) }
                changed = true
            }
        }
        if let base = dict[Shared.Keys.baseURL] as? String, !base.isEmpty {
            Shared.defaults.set(base, forKey: Shared.Keys.baseURL)
        }
        if changed {
            DispatchQueue.main.async { [weak self] in self?.onTokenChange?() }
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { requestToken() }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        ingest(applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        ingest(userInfo)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        ingest(message)
    }
}
