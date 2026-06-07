import SwiftUI

/// Full voice mode: tap to record, tap to send. Streams the agent's reply and
/// refreshes tasks when the agent applies changes. Same backend as the phone.
struct VoiceView: View {
    @EnvironmentObject var store: TaskStore
    @Environment(\.dismiss) private var dismiss
    @StateObject private var recorder = AudioRecorder()

    @State private var phase: Phase = .idle
    @State private var reply: String = ""
    @State private var transcript: String = ""
    @State private var errorText: String?

    enum Phase { case idle, recording, sending, done }

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                switch phase {
                case .idle:
                    prompt
                case .recording:
                    recordingView
                case .sending, .done:
                    resultView
                }
            }
            .padding(.vertical, 8)
        }
        .navigationTitle("Voice")
        .onDisappear { recorder.cancel() }
    }

    private var prompt: some View {
        VStack(spacing: 14) {
            Text("Tap and speak")
                .font(.headline)
            Text("“Add buy milk to today”, “mark groceries done”, “what’s on later?”")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            micButton(symbol: "mic.fill", tint: .accentColor) { begin() }
        }
    }

    private var recordingView: some View {
        VStack(spacing: 14) {
            Text("Listening…").font(.headline)
            WaveBars(level: recorder.level)
                .frame(height: 36)
            micButton(symbol: "stop.fill", tint: .red) { finish() }
            Button("Cancel") { recorder.cancel(); phase = .idle }
                .font(.caption2)
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
        }
    }

    private var resultView: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !transcript.isEmpty {
                Text(transcript)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if let errorText {
                Label(errorText, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
            } else if reply.isEmpty && phase == .sending {
                HStack(spacing: 6) { ProgressView(); Text("Thinking…").font(.caption) }
            } else {
                Text(reply.isEmpty ? "Done." : reply)
                    .font(.body)
            }
            if phase == .done {
                HStack {
                    Button { reset() } label: { Label("Again", systemImage: "mic.fill") }
                        .buttonStyle(.borderedProminent)
                    Button("Done") { dismiss() }
                        .buttonStyle(.bordered)
                }
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func micButton(symbol: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 28, weight: .semibold))
                .frame(width: 64, height: 64)
                .background(tint.opacity(0.25), in: Circle())
                .foregroundStyle(tint)
        }
        .buttonStyle(.plain)
    }

    private func begin() {
        recorder.requestPermission { granted in
            guard granted else { errorText = "Microphone access denied."; phase = .done; return }
            do { try recorder.start(); phase = .recording }
            catch { errorText = "Couldn't start recording."; phase = .done }
        }
    }

    private func finish() {
        guard let url = recorder.stop() else {
            errorText = "Didn't catch that. Try again."
            phase = .done
            return
        }
        phase = .sending
        Task { await stream(url) }
    }

    private func stream(_ url: URL) async {
        var changed = false
        do {
            for try await ev in await APIClient.shared.voiceStream(audioURL: url) {
                switch ev {
                case .message(let t): reply += t
                case .transcript(let t): transcript = t
                case .actionApplied: changed = true
                case .error(let m): errorText = m
                case .done(let m, let tr):
                    if reply.isEmpty { reply = m }
                    if transcript.isEmpty { transcript = tr }
                }
            }
        } catch {
            errorText = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
        try? FileManager.default.removeItem(at: url)
        if changed { await store.load() }
        phase = .done
    }

    private func reset() {
        reply = ""; transcript = ""; errorText = nil; phase = .idle
    }
}

/// Simple animated level meter.
struct WaveBars: View {
    let level: CGFloat
    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<9, id: \.self) { i in
                let phase = CGFloat((i % 3) + 1) / 3
                Capsule()
                    .fill(Color.accentColor)
                    .frame(width: 4, height: max(4, 36 * level * phase))
            }
        }
        .animation(.easeOut(duration: 0.1), value: level)
    }
}
