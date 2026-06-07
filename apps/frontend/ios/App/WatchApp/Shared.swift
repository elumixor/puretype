import Foundation

// MARK: - Shared constants

enum Shared {
    /// App Group used to share the auth token + cached task snapshot between
    /// the watch app and its complication/widget extension.
    static let appGroup = "group.app.puretype"

    /// Production API. The phone can override this via WatchConnectivity, but
    /// prod is the only backend that exists (see CLAUDE.md), so it's the default.
    static let defaultBaseURL = "https://api.puretype.app"

    enum Keys {
        static let token = "authToken"
        static let baseURL = "baseURL"
        static let snapshot = "taskSnapshot"
    }

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }
}

// MARK: - Models

/// A task as returned by GET /tasks. Only the fields the watch needs are
/// decoded; the backend may send more.
struct TaskItem: Codable, Identifiable, Equatable {
    let id: String
    var text: String
    var completed: Bool
    var order: Int
    var bucket: String
    var scheduledAt: Date?
    var projectId: String?

    enum CodingKeys: String, CodingKey {
        case id, text, completed, order, bucket, scheduledAt, projectId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        text = try c.decode(String.self, forKey: .text)
        completed = (try? c.decode(Bool.self, forKey: .completed)) ?? false
        order = (try? c.decode(Int.self, forKey: .order)) ?? 0
        bucket = (try? c.decode(String.self, forKey: .bucket)) ?? "later"
        projectId = try? c.decodeIfPresent(String.self, forKey: .projectId)
        if let s = try? c.decodeIfPresent(String.self, forKey: .scheduledAt) {
            scheduledAt = Shared.iso.date(from: s) ?? Shared.isoPlain.date(from: s)
        }
    }

    init(id: String, text: String, completed: Bool, order: Int, bucket: String,
         scheduledAt: Date? = nil, projectId: String? = nil) {
        self.id = id; self.text = text; self.completed = completed
        self.order = order; self.bucket = bucket
        self.scheduledAt = scheduledAt; self.projectId = projectId
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(text, forKey: .text)
        try c.encode(completed, forKey: .completed)
        try c.encode(order, forKey: .order)
        try c.encode(bucket, forKey: .bucket)
        try c.encodeIfPresent(projectId, forKey: .projectId)
        if let scheduledAt { try c.encode(Shared.iso.string(from: scheduledAt), forKey: .scheduledAt) }
    }
}

/// Fixed buckets the backend supports. "overdue" is derived, never stored.
enum Bucket: String, CaseIterable {
    case today, week, later

    var title: String {
        switch self {
        case .today: return "Today"
        case .week: return "This Week"
        case .later: return "Later"
        }
    }
}

extension Shared {
    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
}

// MARK: - Snapshot (what the widget reads)

/// Lightweight snapshot the app writes to the App Group after every fetch so
/// the complication can render an accurate count without its own network call.
struct TaskSnapshot: Codable {
    var remainingToday: Int
    var remainingTotal: Int
    var nextTaskText: String?
    var updatedAt: Date

    static let empty = TaskSnapshot(remainingToday: 0, remainingTotal: 0, nextTaskText: nil, updatedAt: Date(timeIntervalSince1970: 0))

    static func load() -> TaskSnapshot {
        guard let data = Shared.defaults.data(forKey: Shared.Keys.snapshot),
              let snap = try? JSONDecoder().decode(TaskSnapshot.self, from: data)
        else { return .empty }
        return snap
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            Shared.defaults.set(data, forKey: Shared.Keys.snapshot)
        }
    }
}

/// Compute the snapshot from a task list. A task counts as "today" when it is
/// in the today bucket OR it is overdue (a today/week task whose scheduled
/// period has passed) — mirroring the phone's Overdue display bucket.
func makeSnapshot(from tasks: [TaskItem], now: Date = Date()) -> TaskSnapshot {
    let cal = Calendar.current
    func isOverdue(_ t: TaskItem) -> Bool {
        guard !t.completed, t.bucket != "later", let s = t.scheduledAt else { return false }
        if t.bucket == "today" { return !cal.isDate(s, inSameDayAs: now) && s < now }
        // week: overdue once we're past that calendar week
        return cal.dateInterval(of: .weekOfYear, for: s)?.end ?? s < now
    }
    let active = tasks.filter { !$0.completed }
    let today = active.filter { $0.bucket == "today" || isOverdue($0) }
    let next = today.sorted { $0.order < $1.order }.first ?? active.sorted { $0.order < $1.order }.first
    return TaskSnapshot(
        remainingToday: today.count,
        remainingTotal: active.count,
        nextTaskText: next?.text,
        updatedAt: now
    )
}
