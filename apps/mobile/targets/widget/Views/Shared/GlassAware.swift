import SwiftUI
import UIKit
import WidgetKit

// On a Clear or Tinted Home Screen iOS draws the widget on Liquid Glass and
// tints everything opaque in it one colour (white on Clear). A solid control
// fill then becomes a white blob with white text on it, and every calendar
// colour turns white. These two views are how the widget stays legible and
// colourful there; on the normal Home Screen they draw exactly as before.

/// A rounded fill for controls and cards: the app's colour normally, a faint
/// wash on glass so whatever sits on it stays readable.
struct SurfaceFill: View {
  let color: Color
  var cornerRadius: CGFloat = Theme.controlRadius
  /// How strong the wash is on glass; raise it for a selected or filled state.
  var glassOpacity: Double = 0.14

  @Environment(\.widgetRenderingMode) private var renderingMode

  var body: some View {
    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
      .fill(renderingMode == .fullColor ? color : Color.white.opacity(glassOpacity))
  }
}

/// A calendar colour — an event bar, a busy-day dot, the up-next card — that
/// keeps its colour on glass. iOS leaves an image in full colour when asked,
/// but tints plain shapes, so on glass the mark is drawn as an image: a
/// single pixel of the colour, stretched and clipped to the shape. (A symbol
/// such as `square.fill` brings its own corners and insets, which warp when
/// stretched to card size.)
struct ColorMark: View {
  enum Form {
    case bar
    case dot
    case card
  }

  let color: Color
  let form: Form

  @Environment(\.widgetRenderingMode) private var renderingMode

  var body: some View {
    if renderingMode != .fullColor, #available(iOS 18.0, *) {
      Image(uiImage: Self.swatch(color))
        .resizable()
        .widgetAccentedRenderingMode(.fullColor)
        .clipShape(shape)
    } else {
      shape.fill(color)
    }
  }

  private static func swatch(_ color: Color) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1), format: format).image {
      context in
      UIColor(color).setFill()
      context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    }
  }

  private var shape: AnyShape {
    switch form {
    case .dot: AnyShape(Circle())
    case .bar: AnyShape(RoundedRectangle(cornerRadius: 1.5, style: .continuous))
    case .card: AnyShape(RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous))
    }
  }
}
