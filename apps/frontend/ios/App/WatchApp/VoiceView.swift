import SwiftUI

/// Press-and-hold voice flow driven straight from the main button:
/// hold → records, release → sends to /voice/transcribe and applies.
@MainActor
final class VoiceController: ObservableObject {
    enum Phase { case idle, recording, sending, done }

    @Published var phase: Phase = .idle
    @Published var reply = ""
    @Published var transcript = ""
    @Published var error: String?

    let recorder = AudioRecorder()
    weak var store: TaskStore?
    private var startedAt: Date?

    var active: Bool { phase != .idle }

    func beginHold() {
        guard phase == .idle else { return }
        reply = ""; transcript = ""; error = nil
        phase = .recording   // show the overlay immediately
        recorder.requestPermission { granted in
            Task { @MainActor in self.afterPermission(granted) }
        }
    }

    private func afterPermission(_ granted: Bool) {
        guard phase == .recording else { return }
        guard granted else { error = "Microphone access denied."; phase = .done; return }
        do { try recorder.start(); startedAt = Date() }
        catch { self.error = "Couldn't start recording."; phase = .done }
    }

    func endHold() {
        guard phase == .recording else { return }
        let heldFor = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        let url = recorder.stop()
        guard let url, heldFor > 0.4 else {
            recorder.cancel()
            error = "Hold the button, then speak."
            phase = .done
            autoDismiss()
            return
        }
        phase = .sending
        Task { await stream(url) }
    }

    func dismiss() { phase = .idle; reply = ""; transcript = ""; error = nil }

    private func stream(_ url: URL) async {
        var changed = false
        do {
            for try await ev in await APIClient.shared.voiceStream(audioURL: url) {
                switch ev {
                case let .message(t): reply += t
                case let .transcript(t): transcript = t
                case .actionApplied: changed = true
                case let .error(m): error = m
                case let .done(m, tr):
                    if reply.isEmpty { reply = m }
                    if transcript.isEmpty { transcript = tr }
                }
            }
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        try? FileManager.default.removeItem(at: url)
        if changed { await store?.load() }
        phase = .done
        autoDismiss()
    }

    private func autoDismiss() {
        guard error == nil else { return }   // keep errors on screen until tapped
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if phase == .done { dismiss() }
        }
    }
}

/// Full-screen overlay shown while the voice controller is active.
struct VoiceOverlay: View {
    @ObservedObject var voice: VoiceController
    @ObservedObject var recorder: AudioRecorder

    var body: some View {
        ZStack {
            Color.black.opacity(0.001).ignoresSafeArea()
            VStack(spacing: 12) {
                switch voice.phase {
                case .recording:
                    Text("Listening…").font(.headline)
                    WaveBars(level: recorder.level).frame(height: 40)
                    Text("Release to send").font(.caption2).foregroundStyle(.secondary)
                case .sending:
                    if !voice.transcript.isEmpty {
                        Text(voice.transcript).font(.caption2).foregroundStyle(.secondary)
                    }
                    HStack(spacing: 6) { ProgressView(); Text(voice.reply.isEmpty ? "Thinking…" : voice.reply).font(.body) }
                case .done:
                    if let e = voice.error {
                        Label(e, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption).foregroundStyle(.orange).multilineTextAlignment(.center)
                    } else {
                        Image(systemName: "checkmark.circle.fill").font(.title).foregroundStyle(.green)
                        if !voice.reply.isEmpty {
                            Text(voice.reply).font(.body).multilineTextAlignment(.center)
                        }
                    }
                    Button("Done") { voice.dismiss() }.buttonStyle(.bordered).padding(.top, 2)
                case .idle:
                    EmptyView()
                }
            }
            .padding()
        }
    }
}

/// Animated level meter.
struct WaveBars: View {
    let level: CGFloat
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<9, id: \.self) { i in
                let phase = CGFloat((i % 3) + 1) / 3
                Capsule()
                    .fill(Color.accentColor)
                    .frame(width: 4, height: max(4, 40 * level * phase))
            }
        }
        .animation(.easeOut(duration: 0.1), value: level)
    }
}
