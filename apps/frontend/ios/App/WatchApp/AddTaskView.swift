import SwiftUI

/// Quick add via watch dictation / scribble. Defaults to the bucket the user
/// was viewing. For anything richer (dates, projects), use Voice or the phone.
struct AddTaskView: View {
    @EnvironmentObject var store: TaskStore
    @Environment(\.dismiss) private var dismiss

    @State private var text = ""
    @State private var bucket: Bucket
    @State private var saving = false

    init(defaultBucket: Bucket = .today) {
        _bucket = State(initialValue: defaultBucket)
    }

    var body: some View {
        Form {
            Section {
                TextField("New task", text: $text)
                    .submitLabel(.done)
            }
            Section("Bucket") {
                Picker("Bucket", selection: $bucket) {
                    ForEach(Bucket.allCases, id: \.self) { Text($0.title).tag($0) }
                }
                .pickerStyle(.navigationLink)
            }
            Section {
                Button {
                    save()
                } label: {
                    if saving { ProgressView() } else { Label("Add", systemImage: "plus") }
                }
                .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty || saving)
            }
        }
        .navigationTitle("Add Task")
    }

    private func save() {
        saving = true
        Task {
            await store.add(text: text, bucket: bucket)
            saving = false
            dismiss()
        }
    }
}
