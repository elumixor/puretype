import SwiftUI

/// A project as returned by GET /projects (only the fields the watch renders).
struct WatchProject: Codable, Identifiable, Equatable {
    let id: String
    var name: String
    var emoji: String?
    var hue: Int?
    var avatarType: String?
}

// Canonical token format stored inside Task.text (see frontend tokens/regex.ts):
//   @project:<cuid>  @time:YYYY-MM-DDTHH:MM  @dur:<minutes>
//   @place:<name>|<lat>,<lng>  @link:<urlEncodedUrl>
private let tokenRegex = try! NSRegularExpression(pattern: "@(project|time|dur|place|link):([^\\s@]+)")

enum TaskToken {
    case text(String)
    case project(WatchProject?)
    case time(Date, hasTime: Bool)
    case duration(Int)
    case place(String)
    case link(String)
}

func parseTaskTokens(_ text: String, projects: [String: WatchProject]) -> [TaskToken] {
    var out: [TaskToken] = []
    let ns = text as NSString
    var last = 0
    let matches = tokenRegex.matches(in: text, range: NSRange(location: 0, length: ns.length))
    for m in matches {
        let r = m.range
        if r.location > last {
            out.append(.text(ns.substring(with: NSRange(location: last, length: r.location - last))))
        }
        last = r.location + r.length
        let type = ns.substring(with: m.range(at: 1))
        let value = ns.substring(with: m.range(at: 2))
        switch type {
        case "project":
            out.append(.project(projects[value]))
        case "dur":
            out.append(.duration(Int(value) ?? 0))
        case "link":
            out.append(.link(URL(string: value)?.host ?? value.removingPercentEncoding ?? value))
        case "place":
            let name = value.split(separator: "|").first.map(String.init) ?? value
            out.append(.place(name.removingPercentEncoding ?? name))
        case "time":
            if let (d, hasTime) = parseTokenDate(value) { out.append(.time(d, hasTime: hasTime)) }
            else { out.append(.text(value)) }
        default:
            out.append(.text(value))
        }
    }
    if last < ns.length {
        out.append(.text(ns.substring(from: last)))
    }
    return out
}

private func parseTokenDate(_ v: String) -> (Date, Bool)? {
    // YYYY-MM-DD or YYYY-MM-DDTHH:MM (local)
    let comps = v.split(separator: "T")
    let dateParts = comps.first?.split(separator: "-").compactMap { Int($0) } ?? []
    guard dateParts.count == 3 else { return nil }
    var dc = DateComponents()
    dc.year = dateParts[0]; dc.month = dateParts[1]; dc.day = dateParts[2]
    var hasTime = false
    if comps.count > 1 {
        let t = comps[1].split(separator: ":").compactMap { Int($0) }
        if t.count == 2 { dc.hour = t[0]; dc.minute = t[1]; hasTime = true }
    }
    guard let d = Calendar.current.date(from: dc) else { return nil }
    return (d, hasTime)
}

/// Plain-text version with tokens replaced by readable labels (no pills).
/// Used for the complication snapshot.
func plainTaskText(_ text: String, projects: [String: WatchProject]) -> String {
    parseTaskTokens(text, projects: projects).map { tok in
        switch tok {
        case let .text(s): return s
        case let .project(p): return p.map { ($0.emoji ?? "") + $0.name } ?? ""
        case let .time(d, hasTime): return formatTokenDate(d, hasTime: hasTime)
        case let .duration(m): return formatDuration(m)
        case let .place(n): return "📍" + n
        case let .link(h): return h
        }
    }.joined().replacingOccurrences(of: "  ", with: " ").trimmingCharacters(in: .whitespaces)
}

func formatDuration(_ minutes: Int) -> String {
    if minutes <= 0 { return "" }
    let h = minutes / 60, m = minutes % 60
    if h > 0 && m > 0 { return "\(h)h\(m)m" }
    if h > 0 { return "\(h)h" }
    return "\(m)m"
}

func formatTokenDate(_ date: Date, hasTime: Bool) -> String {
    let f = DateFormatter()
    f.dateFormat = hasTime ? "d MMM HH:mm" : "d MMM"
    return f.string(from: date)
}

func projectColor(_ p: WatchProject) -> Color {
    if let hue = p.hue { return Color(hue: Double(hue) / 360.0, saturation: 0.55, brightness: 0.95) }
    // Stable fallback hue derived from the id, mirroring the phone's auto avatar.
    let h = abs(p.id.hashValue) % 360
    return Color(hue: Double(h) / 360.0, saturation: 0.55, brightness: 0.95)
}

/// Renders task text with inline pills. Project names get a colored capsule;
/// other tokens render as subtle inline labels.
struct TaskTextView: View {
    let text: String
    let projects: [String: WatchProject]
    var completed: Bool = false

    var body: some View {
        let tokens = parseTaskTokens(text, projects: projects)
        WrapHStack(spacing: 4, lineSpacing: 3) {
            ForEach(Array(tokens.enumerated()), id: \.offset) { _, tok in
                view(for: tok)
            }
        }
    }

    @ViewBuilder
    private func view(for tok: TaskToken) -> some View {
        switch tok {
        case let .text(s):
            // Split words so the wrap layout can break long text.
            ForEach(Array(words(s).enumerated()), id: \.offset) { _, w in
                Text(w)
                    .strikethrough(completed)
                    .foregroundStyle(completed ? .secondary : .primary)
            }
        case let .project(p):
            if let p {
                HStack(spacing: 2) {
                    if let e = p.emoji, !e.isEmpty { Text(e) } else { Circle().fill(projectColor(p)).frame(width: 6, height: 6) }
                    Text(p.name)
                }
                .font(.caption2)
                .padding(.horizontal, 5)
                .padding(.vertical, 1)
                .background(projectColor(p).opacity(0.25), in: Capsule())
                .foregroundStyle(projectColor(p))
            }
        case let .time(d, hasTime):
            pill(formatTokenDate(d, hasTime: hasTime), systemImage: "calendar", tint: .blue)
        case let .duration(m):
            pill(formatDuration(m), systemImage: "clock", tint: .orange)
        case let .place(n):
            pill(n, systemImage: "mappin", tint: .green)
        case let .link(h):
            pill(h, systemImage: "link", tint: .teal)
        }
    }

    private func pill(_ s: String, systemImage: String, tint: Color) -> some View {
        HStack(spacing: 2) { Image(systemName: systemImage); Text(s) }
            .font(.caption2)
            .foregroundStyle(tint)
    }

    private func words(_ s: String) -> [String] {
        // Keep surrounding spaces collapsed but preserve word breaks.
        s.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
    }
}

/// Minimal flow layout so pills + words wrap on the narrow watch screen.
struct WrapHStack: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 3

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, maxLineWidth: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                maxLineWidth = max(maxLineWidth, x - spacing)
                x = 0; y += lineHeight + lineSpacing; lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        maxLineWidth = max(maxLineWidth, x - spacing)
        return CGSize(width: min(maxLineWidth, maxWidth), height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                x = 0; y += lineHeight + lineSpacing; lineHeight = 0
            }
            sv.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
