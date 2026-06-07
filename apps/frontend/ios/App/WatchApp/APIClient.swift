import Foundation

enum APIError: Error, LocalizedError {
    case notAuthenticated
    case http(Int, String)
    case decode
    case network(String)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: return "Open PureType on your iPhone to sign in."
        case let .http(code, _): return code == 401 ? "Session expired. Open the iPhone app." : "Server error (\(code))."
        case .decode: return "Couldn't read the response."
        case let .network(m): return m
        }
    }
}

/// Events surfaced from the voice stream to the UI.
enum VoiceStreamEvent {
    case message(String)      // incremental assistant text
    case transcript(String)   // final transcript of what the user said
    case actionApplied        // a task was created/changed/deleted
    case error(String)
    case done(message: String, transcript: String)
}

actor APIClient {
    static let shared = APIClient()

    private var baseURL: String { Shared.defaults.string(forKey: Shared.Keys.baseURL) ?? Shared.defaultBaseURL }
    private var token: String? { Shared.defaults.string(forKey: Shared.Keys.token) }

    private func request(_ path: String, method: String = "GET", json: [String: Any?]? = nil) throws -> URLRequest {
        guard let token, !token.isEmpty else { throw APIError.notAuthenticated }
        guard let url = URL(string: baseURL + path) else { throw APIError.network("Bad URL") }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.timeoutInterval = 30
        if let json {
            let clean = json.compactMapValues { $0 }
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: clean)
        }
        return req
    }

    private func run(_ req: URLRequest) async throws -> Data {
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw APIError.network("No response") }
            guard (200..<300).contains(http.statusCode) else {
                throw APIError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
            }
            return data
        } catch let e as APIError {
            throw e
        } catch {
            throw APIError.network(error.localizedDescription)
        }
    }

    // MARK: REST

    func fetchTasks() async throws -> [TaskItem] {
        let data = try await run(try request("/tasks"))
        do { return try JSONDecoder().decode([TaskItem].self, from: data) }
        catch { throw APIError.decode }
    }

    @discardableResult
    func createTask(text: String, bucket: String) async throws -> TaskItem {
        let data = try await run(try request("/tasks", method: "POST", json: ["text": text, "bucket": bucket]))
        do { return try JSONDecoder().decode(TaskItem.self, from: data) }
        catch { throw APIError.decode }
    }

    @discardableResult
    func patchTask(id: String, body: [String: Any?]) async throws -> TaskItem {
        let data = try await run(try request("/tasks/\(id)", method: "PATCH", json: body))
        do { return try JSONDecoder().decode(TaskItem.self, from: data) }
        catch { throw APIError.decode }
    }

    func deleteTask(id: String) async throws {
        _ = try await run(try request("/tasks/\(id)", method: "DELETE"))
    }

    // MARK: Voice (SSE)

    /// POST recorded audio to /voice/transcribe and stream events back. The
    /// backend emits SSE: bare `data:` lines are VoiceEvents, an `event:__return`
    /// line carries the final {transcription, message, error} object.
    func voiceStream(audioURL: URL) -> AsyncThrowingStream<VoiceStreamEvent, Error> {
        AsyncThrowingStream { continuation in
            Task {
                do {
                    guard let token, !token.isEmpty else { throw APIError.notAuthenticated }
                    guard let url = URL(string: baseURL + "/voice/transcribe") else { throw APIError.network("Bad URL") }

                    let boundary = "Boundary-\(UUID().uuidString)"
                    var req = URLRequest(url: url)
                    req.httpMethod = "POST"
                    req.timeoutInterval = 120
                    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

                    let audio = try Data(contentsOf: audioURL)
                    let tz = -TimeZone.current.secondsFromGMT() / 60
                    let df = DateFormatter()
                    df.dateFormat = "yyyy-MM-dd"
                    let clientDate = df.string(from: Date())

                    var body = Data()
                    func field(_ name: String, _ value: String) {
                        body.append("--\(boundary)\r\n".data(using: .utf8)!)
                        body.append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".data(using: .utf8)!)
                        body.append("\(value)\r\n".data(using: .utf8)!)
                    }
                    body.append("--\(boundary)\r\n".data(using: .utf8)!)
                    body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"voice.m4a\"\r\n".data(using: .utf8)!)
                    body.append("Content-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
                    body.append(audio)
                    body.append("\r\n".data(using: .utf8)!)
                    field("clientDate", clientDate)
                    field("clientTzOffsetMin", String(tz))
                    body.append("--\(boundary)--\r\n".data(using: .utf8)!)
                    req.httpBody = body

                    let (bytes, resp) = try await URLSession.shared.bytes(for: req)
                    guard let http = resp as? HTTPURLResponse else { throw APIError.network("No response") }
                    guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode, "") }

                    var currentEvent = ""
                    var finalMessage = ""
                    var finalTranscript = ""
                    for try await line in bytes.lines {
                        if line.hasPrefix("event:") { currentEvent = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces); continue }
                        guard line.hasPrefix("data:") else { if line.isEmpty { currentEvent = "" }; continue }
                        let raw = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                        guard !raw.isEmpty, let jdata = raw.data(using: .utf8) else { continue }
                        let obj = (try? JSONSerialization.jsonObject(with: jdata)) as? [String: Any]

                        switch currentEvent {
                        case "__error":
                            continuation.yield(.error((obj?["message"] as? String) ?? "Voice failed"))
                        case "__return":
                            finalMessage = (obj?["message"] as? String) ?? finalMessage
                            finalTranscript = (obj?["transcription"] as? String) ?? finalTranscript
                            if let err = obj?["error"] as? [String: Any], let m = err["message"] as? String {
                                continuation.yield(.error(m))
                            }
                        case "__job":
                            break
                        default:
                            if let type = obj?["type"] as? String {
                                switch type {
                                case "message": if let t = obj?["text"] as? String { continuation.yield(.message(t)) }
                                case "transcript": if let t = obj?["text"] as? String { finalTranscript = t; continuation.yield(.transcript(t)) }
                                case "action": continuation.yield(.actionApplied)
                                case "error": continuation.yield(.error((obj?["message"] as? String) ?? "Voice failed"))
                                default: break
                                }
                            }
                        }
                        currentEvent = ""
                    }
                    continuation.yield(.done(message: finalMessage, transcript: finalTranscript))
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
        }
    }
}
