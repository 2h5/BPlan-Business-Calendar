import SwiftUI
import UIKit

/// The app's colour tokens (`packages/ui/src/theme/colors.ts`), light and dark,
/// so the widget reads as part of the same product as the app.
enum Theme {
  static let background = dynamic(light: "#FFFFFF", dark: "#13171E")
  static let backgroundGlow = dynamic(light: "#EAF1FE", dark: "#17223A")
  static let surface = dynamic(light: "#F4F6F8", dark: "#1D2330")
  static let surfaceRaised = dynamic(light: "#FFFFFF", dark: "#252C39")
  static let border = dynamic(light: "#E3E7ED", dark: "#29313E")

  static let textPrimary = dynamic(light: "#171B23", dark: "#F3F5F8")
  static let textSecondary = dynamic(light: "#596273", dark: "#AEB6C4")
  static let textTertiary = dynamic(light: "#8991A0", dark: "#737D8D")

  static let accent = Color(hex: "#196AF3")
  static let onAccent = Color.white
  static let now = dynamic(light: "#C94049", dark: "#FF7D84")
  static let warning = dynamic(light: "#A66A12", dark: "#E7B660")
  static let success = dynamic(light: "#16865A", dark: "#61D6A2")

  /// Square-cornered, never capsule: matches the app's segmented controls.
  static let controlRadius: CGFloat = 7
  static let cardRadius: CGFloat = 12

  private static func dynamic(light: String, dark: String) -> Color {
    let lightColor = UIColor(Color(hex: light))
    let darkColor = UIColor(Color(hex: dark))
    return Color(UIColor { $0.userInterfaceStyle == .dark ? darkColor : lightColor })
  }
}

extension Color {
  /// "#RRGGBB". Anything malformed falls back to the accent rather than black.
  init(hex: String) {
    let digits = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard digits.count == 6, let value = UInt64(digits, radix: 16) else {
      self.init(.sRGB, red: 0.098, green: 0.416, blue: 0.953, opacity: 1)
      return
    }
    self.init(
      .sRGB,
      red: Double((value >> 16) & 0xFF) / 255,
      green: Double((value >> 8) & 0xFF) / 255,
      blue: Double(value & 0xFF) / 255,
      opacity: 1)
  }
}

/// The widget's backdrop: the app's surface with a soft accent glow in the
/// top corner. In tinted and clear Home Screens the system replaces it.
struct WidgetBackdrop: View {
  var body: some View {
    ZStack {
      Theme.background
      RadialGradient(
        colors: [Theme.backgroundGlow, Theme.background.opacity(0)],
        center: .topLeading, startRadius: 0, endRadius: 260)
    }
  }
}
