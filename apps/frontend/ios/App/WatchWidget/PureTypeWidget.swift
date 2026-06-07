import WidgetKit
import SwiftUI

struct TaskEntry: TimelineEntry {
    let date: Date
    let snapshot: TaskSnapshot
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> TaskEntry {
        TaskEntry(date: Date(), snapshot: TaskSnapshot(remainingToday: 3, remainingTotal: 7, nextTaskText: "Plan the week", updatedAt: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (TaskEntry) -> Void) {
        completion(TaskEntry(date: Date(), snapshot: TaskSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TaskEntry>) -> Void) {
        let entry = TaskEntry(date: Date(), snapshot: TaskSnapshot.load())
        // Refresh roughly every 15 min; the app also pokes WidgetCenter on edits.
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct PureTypeWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: TaskEntry

    private var count: Int { entry.snapshot.remainingToday }

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: "checklist")
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                    Text("\(count)")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.5)
                }
            }
            .widgetLabel { Text("Today") }

        case .accessoryInline:
            Label(inlineText, systemImage: "checklist")

        case .accessoryCorner:
            Text("\(count)")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .widgetLabel { Text(count == 1 ? "1 task" : "\(count) tasks") }

        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label(count == 0 ? "All clear" : "\(count) today", systemImage: "checklist")
                    .font(.headline)
                    .foregroundStyle(.primary)
                if let next = entry.snapshot.nextTaskText, count > 0 {
                    Text(next)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                } else {
                    Text("Nothing left today")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

        default:
            Text("\(count)")
        }
    }

    private var inlineText: String {
        if count == 0 { return "All clear" }
        if let next = entry.snapshot.nextTaskText { return "\(count) · \(next)" }
        return count == 1 ? "1 task today" : "\(count) tasks today"
    }
}

@main
struct PureTypeWidget: Widget {
    let kind = "PureTypeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            PureTypeWidgetEntryView(entry: entry)
                .widgetURL(URL(string: "puretype://open"))
        }
        .configurationDisplayName("Tasks Today")
        .description("Tasks remaining today.")
        .supportedFamilies([.accessoryCircular, .accessoryInline, .accessoryCorner, .accessoryRectangular])
    }
}
