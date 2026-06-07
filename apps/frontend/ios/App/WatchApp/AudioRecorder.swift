import Foundation
import AVFoundation

/// Records a short voice memo to an m4a file for upload to /voice/transcribe.
final class AudioRecorder: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var level: CGFloat = 0   // 0...1, for the waveform

    private var recorder: AVAudioRecorder?
    private var meterTimer: Timer?
    private(set) var fileURL: URL?

    func requestPermission(_ completion: @escaping (Bool) -> Void) {
        AVAudioApplication.requestRecordPermission { granted in
            DispatchQueue.main.async { completion(granted) }
        }
    }

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .default, options: [.duckOthers])
        try session.setActive(true)

        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 16000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        let rec = try AVAudioRecorder(url: url, settings: settings)
        rec.isMeteringEnabled = true
        rec.record()
        recorder = rec
        fileURL = url
        isRecording = true

        meterTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self, let r = self.recorder else { return }
            r.updateMeters()
            let power = r.averagePower(forChannel: 0)        // dB, ~ -60...0
            let normalized = max(0, min(1, (power + 50) / 50))
            DispatchQueue.main.async { self.level = CGFloat(normalized) }
        }
    }

    /// Stops recording and returns the file URL if a usable clip was captured.
    func stop() -> URL? {
        meterTimer?.invalidate()
        meterTimer = nil
        recorder?.stop()
        let url = fileURL
        recorder = nil
        isRecording = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if let url, let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? Int, size > 1024 {
            return url
        }
        return nil
    }

    func cancel() {
        _ = stop()
        if let url = fileURL { try? FileManager.default.removeItem(at: url) }
        fileURL = nil
    }
}
