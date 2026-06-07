import Foundation
import SwiftUI
import WidgetKit

@MainActor
final class TaskStore: ObservableObject {
    @Published var tasks: [TaskItem] = []
    @Published var loading = false
    @Published var error: String?
    @Published var hasToken: Bool = Shared.defaults.string(forKey: Shared.Keys.token)?.isEmpty == false

    private let api = APIClient.shared

    /// Active (incomplete) tasks for a display bucket. "today" also folds in
    /// overdue tasks, matching the phone.
    func tasks(for bucket: Bucket) -> [TaskItem] {
        let now = Date()
        let cal = Calendar.current
        func isOverdue(_ t: TaskItem) -> Bool {
            guard !t.completed, t.bucket != "later", let s = t.scheduledAt else { return false }
            if t.bucket == "today" { return !cal.isDate(s, inSameDayAs: now) && s < now }
            return (cal.dateInterval(of: .weekOfYear, for: s)?.end ?? s) < now
        }
        let result: [TaskItem]
        switch bucket {
        case .today:
            result = tasks.filter { !$0.completed && ($0.bucket == "today" || isOverdue($0)) }
        case .week:
            result = tasks.filter { !$0.completed && $0.bucket == "week" && !isOverdue($0) }
        case .later:
            result = tasks.filter { !$0.completed && $0.bucket == "later" }
        }
        return result.sorted { $0.order < $1.order }
    }

    func refreshTokenState() {
        hasToken = Shared.defaults.string(forKey: Shared.Keys.token)?.isEmpty == false
    }

    func load() async {
        refreshTokenState()
        guard hasToken else { error = nil; return }
        loading = true
        defer { loading = false }
        do {
            let fetched = try await api.fetchTasks()
            tasks = fetched
            error = nil
            persistSnapshot()
        } catch let e as APIError {
            error = e.errorDescription
            if case .http(401, _) = e { hasToken = false }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func toggleComplete(_ task: TaskItem) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let newValue = !tasks[idx].completed
        tasks[idx].completed = newValue   // optimistic
        persistSnapshot()
        do {
            _ = try await api.patchTask(id: task.id, body: ["completed": newValue])
            persistSnapshot()
        } catch {
            if let i = tasks.firstIndex(where: { $0.id == task.id }) { tasks[i].completed = !newValue }
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func delete(_ task: TaskItem) async {
        let backup = tasks
        tasks.removeAll { $0.id == task.id }   // optimistic
        persistSnapshot()
        do { try await api.deleteTask(id: task.id) }
        catch {
            tasks = backup
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func move(_ task: TaskItem, to bucket: Bucket) async {
        guard let idx = tasks.firstIndex(where: { $0.id == task.id }) else { return }
        let old = tasks[idx].bucket
        tasks[idx].bucket = bucket.rawValue   // optimistic
        do { _ = try await api.patchTask(id: task.id, body: ["bucket": bucket.rawValue]) }
        catch {
            if let i = tasks.firstIndex(where: { $0.id == task.id }) { tasks[i].bucket = old }
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    func add(text: String, bucket: Bucket) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let created = try await api.createTask(text: trimmed, bucket: bucket.rawValue)
            tasks.append(created)
            persistSnapshot()
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    /// Write the snapshot the complication reads and ask WidgetKit to refresh.
    private func persistSnapshot() {
        makeSnapshot(from: tasks).save()
        WidgetCenter.shared.reloadAllTimelines()
    }
}
