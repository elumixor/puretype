import SwiftUI

struct ContentView: View {
    @EnvironmentObject var store: TaskStore
    @State private var showVoice = false
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            Group {
                if !store.hasToken {
                    signedOut
                } else if store.tasks.isEmpty && store.loading {
                    ProgressView()
                } else {
                    taskList
                }
            }
            .navigationTitle("PureType")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "plus") }
                        .disabled(!store.hasToken)
                }
            }
            .sheet(isPresented: $showVoice) { NavigationStack { VoiceView() } }
            .sheet(isPresented: $showAdd) { NavigationStack { AddTaskView() } }
        }
        .task { await store.load() }
    }

    private var taskList: some View {
        List {
            // Prominent voice button at the top.
            Section {
                Button { showVoice = true } label: {
                    HStack {
                        Image(systemName: "mic.fill")
                        Text("Voice").fontWeight(.semibold)
                        Spacer()
                    }
                }
                .listItemTint(.accentColor)
            }

            if let error = store.error {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
            }

            ForEach(Bucket.allCases, id: \.self) { bucket in
                let items = store.tasks(for: bucket)
                if !items.isEmpty {
                    Section(header: Text(headerTitle(bucket, count: items.count))) {
                        ForEach(items) { task in
                            TaskRow(task: task)
                        }
                    }
                }
            }

            if allEmpty {
                Section {
                    VStack(spacing: 6) {
                        Image(systemName: "checkmark.circle")
                            .font(.title2)
                            .foregroundStyle(.green)
                        Text("All clear").font(.headline)
                        Text("Tap + or use Voice to add a task.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                }
            }
        }
        .refreshable { await store.load() }
    }

    private var allEmpty: Bool {
        Bucket.allCases.allSatisfy { store.tasks(for: $0).isEmpty }
    }

    private func headerTitle(_ bucket: Bucket, count: Int) -> String {
        "\(bucket.title) · \(count)"
    }

    private var signedOut: some View {
        VStack(spacing: 10) {
            Image(systemName: "iphone.and.arrow.forward")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Sign in on iPhone")
                .font(.headline)
            Text("Open PureType on your paired iPhone and sign in. Your tasks sync here automatically.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Retry") {
                WatchConnectivityProvider.shared.requestToken()
                Task { await store.load() }
            }
            .buttonStyle(.bordered)
        }
        .padding()
    }
}

struct TaskRow: View {
    @EnvironmentObject var store: TaskStore
    let task: TaskItem

    var body: some View {
        Button {
            Task { await store.toggleComplete(task) }
        } label: {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(task.completed ? .green : .secondary)
                Text(task.text)
                    .strikethrough(task.completed)
                    .foregroundStyle(task.completed ? .secondary : .primary)
                    .lineLimit(3)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await store.delete(task) }
            } label: { Label("Delete", systemImage: "trash") }
        }
        .swipeActions(edge: .leading) {
            ForEach(otherBuckets, id: \.self) { b in
                Button {
                    Task { await store.move(task, to: b) }
                } label: { Label(b.title, systemImage: "tray.and.arrow.down") }
                    .tint(.blue)
            }
        }
    }

    private var otherBuckets: [Bucket] {
        Bucket.allCases.filter { $0.rawValue != task.bucket }
    }
}
