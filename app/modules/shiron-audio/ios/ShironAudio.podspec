Pod::Spec.new do |s|
  s.name           = 'ShironAudio'
  s.version        = '0.2.0'
  s.summary        = 'Decodes, trims and loudness-normalises recordings into AAC (Shiron app)'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Shiron'
  s.homepage       = 'https://github.com/LiadSiles/shiron'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Core/ is plain AVFoundation and is also built by the Swift package in swift-tests/.
  s.source_files = 'ShironAudioModule.swift', 'Core/**/*.swift'
  s.frameworks = 'AVFoundation', 'AudioToolbox', 'CoreMedia', 'UIKit'

  # WMA/WMV: a minimal FFmpeg built by scripts/build-wma-decoder.sh ios (git-ignored). Without it
  # the app still builds; Windows Media files are then reported as unsupported.
  wma = File.exist?(File.join(__dir__, 'WmaDecoder.xcframework'))
  s.vendored_frameworks = 'WmaDecoder.xcframework' if wma
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => wma ? '$(inherited) SHIRON_WMA' : '$(inherited)'
  }
end
