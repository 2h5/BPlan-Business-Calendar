const fs = require('fs');
const path = require('path');

const {
  IOSConfig,
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require('expo/config-plugins');

const SOURCE = path.join(__dirname, 'scene-delegate', 'SceneDelegate.swift');
const FILE_NAME = 'SceneDelegate.swift';
const MARKER = '// @generated with-scene-delegate: the SceneDelegate creates the window.';

/**
 * The template's window setup in `didFinishLaunching`. Under the scene
 * lifecycle there is no window yet at that point; SceneDelegate makes it.
 */
const WINDOW_SETUP =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*\n\s*factory\.startReactNative\([\s\S]*?launchOptions: launchOptions\)\s*\n#endif\n/;

/**
 * Adopts the UIScene lifecycle, which iOS 27 requires at launch. `ios/` is
 * generated, so this is the only place the change survives
 * `expo prebuild --clean`.
 */
function withSceneDelegate(config) {
  config = withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return plistConfig;
  });

  config = withAppDelegate(config, (delegateConfig) => {
    const { language, contents } = delegateConfig.modResults;
    if (language !== 'swift') {
      throw new Error('with-scene-delegate: expected a Swift AppDelegate');
    }
    if (contents.includes(MARKER)) return delegateConfig;
    if (!WINDOW_SETUP.test(contents)) {
      throw new Error('with-scene-delegate: AppDelegate window setup not found');
    }

    delegateConfig.modResults.contents = contents.replace(WINDOW_SETUP, `    ${MARKER}\n`);
    return delegateConfig;
  });

  return withXcodeProject(config, (projectConfig) => {
    const project = projectConfig.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectConfig.modRequest.projectRoot);
    const target = path.join(projectConfig.modRequest.platformProjectRoot, projectName, FILE_NAME);

    fs.copyFileSync(SOURCE, target);

    const filepath = `${projectName}/${FILE_NAME}`;
    if (!project.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project,
      });
    }
    return projectConfig;
  });
}

module.exports = withSceneDelegate;
