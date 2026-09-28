import ExpoModulesCore
import UIKit

/// The native half of the appearance cross-fade. React Native cannot snapshot
/// its own screen, so this covers the key window with a snapshot of itself,
/// lets JS repaint in the new theme underneath, then fades the snapshot out —
/// the same trick the web plays with `document.startViewTransition`.
public class ThemeCrossfadeModule: Module {
  private var cover: UIView?

  /// Never leave a stale frame over the app if JS does not call `finish`.
  private static let safetyTimeout: TimeInterval = 1.5

  public func definition() -> ModuleDefinition {
    Name("ThemeCrossfade")

    /// Resolves `true` once the snapshot is on screen, `false` when it could
    /// not be taken (or Reduce Motion is on) and the change should be instant.
    AsyncFunction("begin") { () -> Bool in
      self.removeCover()

      guard !UIAccessibility.isReduceMotionEnabled,
        let window = Self.keyWindow(),
        let snapshot = window.snapshotView(afterScreenUpdates: false)
      else { return false }

      snapshot.frame = window.bounds
      // Touches pass through to the app while the fade plays.
      snapshot.isUserInteractionEnabled = false
      window.addSubview(snapshot)
      self.cover = snapshot

      DispatchQueue.main.asyncAfter(deadline: .now() + Self.safetyTimeout) { [weak self, weak snapshot] in
        guard let self, let snapshot, self.cover === snapshot else { return }
        self.fadeOut(duration: 0.2)
      }
      return true
    }.runOnQueue(.main)

    Function("finish") { (durationMs: Double) in
      DispatchQueue.main.async {
        self.fadeOut(duration: max(durationMs, 0) / 1000)
      }
    }
  }

  private func fadeOut(duration: TimeInterval) {
    guard let view = cover else { return }
    cover = nil

    // The web's `cubic-bezier(0.4, 0, 0.2, 1)`.
    let animator = UIViewPropertyAnimator(
      duration: duration,
      controlPoint1: CGPoint(x: 0.4, y: 0),
      controlPoint2: CGPoint(x: 0.2, y: 1)
    ) {
      view.alpha = 0
    }
    animator.addCompletion { _ in view.removeFromSuperview() }
    animator.startAnimation()
  }

  private func removeCover() {
    cover?.removeFromSuperview()
    cover = nil
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }
}
