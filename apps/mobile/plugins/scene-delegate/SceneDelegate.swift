// Copied into the generated iOS project by plugins/with-scene-delegate.js.
// Edit this file, not ios/, which `expo prebuild --clean` regenerates.

import React
import UIKit

/// iOS 27 terminates apps that have not adopted the UIScene lifecycle. The
/// app delegate still builds the React Native factory; the scene owns the
/// window, starts React Native in it, and forwards the links UIKit now
/// delivers to the scene instead of the app delegate.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Native modules still look for the window on the app delegate.
    appDelegate.window = window

    // A cold-start link arrives here rather than in the launch options, so
    // hand it to React Native where `Linking.getInitialURL()` looks for it.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }

    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)

    if let userActivity = connectionOptions.userActivities.first {
      self.scene(scene, continue: userActivity)
    }
  }

  // Deep links while running.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let context = URLContexts.first else { return }

    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    if let sourceApplication = context.options.sourceApplication {
      options[.sourceApplication] = sourceApplication
    }
    if let annotation = context.options.annotation {
      options[.annotation] = annotation
    }
    _ = UIApplication.shared.delegate?.application?(
      UIApplication.shared, open: context.url, options: options)
  }

  // Universal links and handoff.
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
