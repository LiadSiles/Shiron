// Signs every Android build (debug and release, local and CI) with the project keystore in
// app/keystore/, so each APK from GitHub Releases installs as an update of the previous one.
// The keystore is committed on purpose; see docs/wiki/build-and-release.md before changing it.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const KEYSTORE = 'shiron.keystore';
const ALIAS = 'shiron';
const PASSWORD = 'shiron-android';

function withKeystoreFile(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, 'keystore', KEYSTORE);
      const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', KEYSTORE);
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);
}

function withSigningConfig(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('signingConfigs.shiron')) return cfg;
    gradle = gradle.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        shiron {
            storeFile file('${KEYSTORE}')
            storePassword '${PASSWORD}'
            keyAlias '${ALIAS}'
            keyPassword '${PASSWORD}'
        }`,
    );
    gradle = gradle.replace(/signingConfig\s+signingConfigs\.debug/g, 'signingConfig signingConfigs.shiron');
    cfg.modResults.contents = gradle;
    return cfg;
  });
}

module.exports = function withSigningKey(config) {
  return withSigningConfig(withKeystoreFile(config));
};
