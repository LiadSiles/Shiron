import ExpoModulesCore

public class ShironAudioModule: Module {
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
  }
}
