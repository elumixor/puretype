import Foundation
import WatchConnectivity

/// iPhone side of the watch auth handoff. The Capacitor web app stores the
/// JWT in UserDefaults via @capacitor/preferences under the key
/// "CapacitorStorage.authToken". We read it here and push it to the watch so
/// the native watch app + complication can call the backend directly.
final class WatchSessionBridge: NSObject, WCSessionDelegate {
    static let shared = WatchSessionBridge()

    /// Key Capacitor Preferences writes to (group "CapacitorStorage", "." separator).
    private let tokenKey = "CapacitorStorage.authToken"
    private let baseURL = "https://api.puretype.app"

    private var currentToken: String {
        UserDefaults.standard.string(forKey: tokenKey) ?? ""
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    /// Push the latest token to the watch. Uses application context (latest
    /// value wins, survives until overwritten) plus a transferUserInfo as a
    /// queued fallback for when the watch app is backgrounded.
    func pushToken() {
        guard WCSession.default.activationState == .activated else { return }
        let payload: [String: Any] = ["authToken": currentToken, "baseURL": baseURL]
        try? WCSession.default.updateApplicationContext(payload)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { pushToken() }
    }

    // Watch asked for the token (e.g. just installed, app group empty).
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        replyHandler(["authToken": currentToken, "baseURL": baseURL])
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        pushToken()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        if session.isReachable { pushToken() }
    }

    // Required no-op stubs on iOS.
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
