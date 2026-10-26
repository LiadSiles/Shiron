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
      } catch let error as AudioProcessingError {
        throw Exception(
          name: "ShironAudio", description: error.errorDescription ?? "Processing failed",
          code: "ERR_AUDIO_\(error.code)")
      }
    }
  }
}
