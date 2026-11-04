import ExpoModulesCore
import UIKit

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
        return try AudioProcessor.process(input: input, output: output).dictionary
      } catch {
        // No half-written .m4a left behind, and every failure carries a code the app knows.
        try? FileManager.default.removeItem(at: output)
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
