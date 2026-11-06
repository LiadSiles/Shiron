// The name under the icon (and in the share sheet) is "PlayGan", while app.json's `name` stays
// non-Latin ("פלייגן"). Expo derives the native project names from `name` — a non-Latin name
// keeps the Xcode project "app" — and a Latin "PlayGan" there would also clash with the iOS
// share extension's target, which is named from its own display name. So the visible label is
// set here instead: Android's app_name string; iOS uses ios.infoPlist.CFBundleDisplayName.
const { withStringsXml, AndroidConfig } = require('expo/config-plugins');

const LABEL = 'PlayGan';

module.exports = function withDisplayName(config) {
  return withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: LABEL }],
      cfg.modResults,
    );
    return cfg;
  });
};
