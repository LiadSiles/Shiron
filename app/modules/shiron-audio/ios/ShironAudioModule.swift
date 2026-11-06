import ExpoModulesCore
import UIKit
#if SHIRON_WMA
import WmaDecoder
#endif

public class ShironAudioModule: Module {
  /// Extra time iOS grants after she leaves the app (about 30 s), so a song being saved or
  /// converted finishes instead of stopping halfway. Longer work resumes later through
  /// expo-background-task, or when she opens the app.
  private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

  public func definition() -> ModuleDefinition {
    Name("ShironAudio")

    // Runs on the module's background queue; a few seconds for a typical song.
    AsyncFunction("processAsync") { (inputUri: String, outputUri: String) -> [String: Any] in
      guard let input = URL(string: inputUri), input.isFileURL,
            let output = URL(string: outputUri), output.isFileURL else {
        throw Exception(name: "ShironAudio", description: "Expected file:// URIs", code: "ERR_AUDIO_BAD_URI")
      }
      do {
        let source = try Self.decodedIfWindowsMedia(input)
        defer { if source != input { try? FileManager.default.removeItem(at: source) } }
        return try AudioProcessor.process(input: source, output: output).dictionary
      } catch {
        // No half-written .m4a left behind, and every failure carries a code the app knows.
        try? FileManager.default.removeItem(at: output)
        let code = (error as? AudioProcessingError)?.code ?? "FAILED"
        throw Exception(
          name: "ShironAudio", description: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription,
          code: "ERR_AUDIO_\(code)")
      }
    }

    // Consecutive parts of a converted song, for transcription part by part (AudioSplitter).
    AsyncFunction("splitAsync") { (inputUri: String, outputDirUri: String, chunkSec: Double) -> [String] in
      guard let input = URL(string: inputUri), input.isFileURL,
            let dir = URL(string: outputDirUri), dir.isFileURL else {
        throw Exception(name: "ShironAudio", description: "Expected file:// URIs", code: "ERR_AUDIO_BAD_URI")
      }
      do {
        return try AudioSplitter.split(input: input, outputDir: dir, chunkSec: chunkSec).map { $0.absoluteString }
      } catch {
        let code = (error as? AudioProcessingError)?.code ?? "FAILED"
        throw Exception(
          name: "ShironAudio", description: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription,
          code: "ERR_AUDIO_\(code)")
      }
    }

    Function("startBackgroundWork") { (_: String) in
      DispatchQueue.main.async { self.beginBackgroundTime() }
    }

    Function("stopBackgroundWork") {
      DispatchQueue.main.async { self.endBackgroundTime() }
    }

    // Whether the share extension can hand files to the app on this install: the App Group the
    // signature grants (Sideloadly with a free Apple ID may grant none). Same lookup as the
    // share extension (patches/expo-share-intent); shown in Settings and the technical log.
    Function("appGroupStatus") { () -> [String: Any] in
      let declared = Bundle.main.object(forInfoDictionaryKey: "AppGroupIdentifier") as? String
      let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? []
      let provisioned = Self.provisionedAppGroups()
      let granted = ([declared].compactMap { $0 } + alt + provisioned).first {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil
      }
      var status: [String: Any] = ["alt": alt, "provisioned": provisioned]
      if let declared = declared { status["declared"] = declared }
      if let granted = granted { status["granted"] = granted }
      return status
    }
  }

  /// WMA, or a WMV's sound, as a temporary WAV (native/wma, FFmpeg): iOS can't decode Windows
  /// Media itself. Anything else is returned as is.
  private static func decodedIfWindowsMedia(_ url: URL) throws -> URL {
    guard ["wma", "wmv", "asf"].contains(url.pathExtension.lowercased()) else { return url }
    #if SHIRON_WMA
    let wav = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).wav")
    let code = shiron_wma_to_wav(url.path, wav.path)
    if code == -6 { throw AudioProcessingError.tooLong }
    guard code == 0 else { throw AudioProcessingError.unsupported("Windows Media (decoder \(code))") }
    return wav
    #else
    throw AudioProcessingError.unsupported("Windows Media (decoder not in this build)")
    #endif
  }

  /// The groups in the app's embedded.mobileprovision (a signed plist); none on the simulator.
  private static func provisionedAppGroups() -> [String] {
    guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
      let data = try? Data(contentsOf: url),
      let start = data.range(of: Data("<?xml".utf8)),
      let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex),
      let plist = try? PropertyListSerialization.propertyList(
        from: data.subdata(in: start.lowerBound..<end.upperBound), format: nil) as? [String: Any],
      let entitlements = plist["Entitlements"] as? [String: Any]
    else { return [] }
    return entitlements["com.apple.security.application-groups"] as? [String] ?? []
  }

  private func beginBackgroundTime() {
    guard backgroundTask == .invalid else { return }
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "shiron-new-songs") { [weak self] in
      self?.endBackgroundTime() // time is up: iOS suspends the app; the work resumes later
    }
  }

  private func endBackgroundTime() {
    guard backgroundTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTask)
    backgroundTask = .invalid
  }
}
