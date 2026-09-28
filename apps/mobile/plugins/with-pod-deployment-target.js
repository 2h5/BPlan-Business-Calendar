const { withPodfile } = require('expo/config-plugins');

const MARKER = '# @generated with-pod-deployment-target';
const ANCHOR = /react_native_post_install\([\s\S]*?\n\s*\)\n/;

/**
 * Raises every pod target — resource bundles included — to at least
 * `minimum`. Xcode 27 refuses targets below iOS 15, and some pods (e.g.
 * AsyncStorage's resource bundle) still declare 13.4, which React Native's
 * own post-install bump does not reach. `ios/` is generated, so the fix has to
 * live here to survive `expo prebuild --clean`.
 */
function withPodDeploymentTarget(config, { minimum = '15.1' } = {}) {
  return withPodfile(config, (podfileConfig) => {
    const podfile = podfileConfig.modResults.contents;
    if (podfile.includes(MARKER)) return podfileConfig;

    const match = podfile.match(ANCHOR);
    if (!match || match.index === undefined) {
      throw new Error('with-pod-deployment-target: react_native_post_install call not found');
    }

    const end = match.index + match[0].length;
    const snippet = [
      '',
      `    ${MARKER}`,
      '    installer.pods_project.targets.each do |target|',
      '      target.build_configurations.each do |build_config|',
      `        if build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${minimum}`,
      `          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minimum}'`,
      '        end',
      '      end',
      '    end',
      '',
    ].join('\n');

    podfileConfig.modResults.contents = podfile.slice(0, end) + snippet + podfile.slice(end);
    return podfileConfig;
  });
}

module.exports = withPodDeploymentTarget;
