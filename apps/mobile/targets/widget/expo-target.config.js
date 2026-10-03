/**
 * The Home Screen widget, generated into the Xcode project by
 * `@bacons/apple-targets` on `expo prebuild`. Everything in this folder is the
 * widget's source; `ios/` is regenerated and must not be edited by hand.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'CalendarWidget',
  displayName: 'BPlan',
  // Interactive widgets (Button/Toggle with App Intents) need iOS 17.
  deploymentTarget: '17.0',
  bundleIdentifier: '.widget',
  colors: {
    $accent: { light: '#196AF3', dark: '#196AF3' },
    $widgetBackground: { light: '#FFFFFF', dark: '#13171E' },
  },
  entitlements: {
    // The same group the app writes the snapshot into (app.json).
    'com.apple.security.application-groups':
      config.ios.entitlements['com.apple.security.application-groups'],
  },
});
