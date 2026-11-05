// Extra R8 keep rules for the release build. Expo SDK 58's template shrinks release builds
// (android.enableMinifyInReleaseBuilds=true), and R8 removed the constructor WorkManager finds
// by reflection (androidx.work.impl.WorkDatabase_Impl.<init>): 0.7.0 crashed at launch, before
// any screen, as soon as expo-background-task brought WorkManager in. See build-and-release.md.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MARK = '# shiron: keep rules (plugins/withKeepRules.js)';
const RULES = `
${MARK}
# Room databases are created by reflection through their no-argument constructor.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
`;

module.exports = function withKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(MARK)) fs.writeFileSync(file, current + RULES);
      return cfg;
    },
  ]);
};
