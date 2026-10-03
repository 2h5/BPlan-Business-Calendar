import SwiftUI

/// A tiny tinted event label for narrow columns: a colour bar and as much of
/// the title as fits, faded out at the edge rather than cut with an ellipsis,
/// which would eat half of a six-letter column.
struct EventChip: View {
  let title: String
  let color: Color
  var size: CGFloat = 8.5

  @Environment(\.widgetRenderingMode) private var renderingMode

  var body: some View {
    HStack(spacing: 2.5) {
      ColorMark(color: color, form: .bar).frame(width: 2, height: size * 1.3)
      FadingText(text: title, size: size)
    }
    .padding(.vertical, 1.5)
    .padding(.leading, 1.5)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      if renderingMode == .fullColor {
        RoundedRectangle(cornerRadius: 3, style: .continuous).fill(color.opacity(0.2))
      } else {
        SurfaceFill(color: .clear, cornerRadius: 3)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
  }
}

/// One line of text that runs off the trailing edge with a fade instead of
/// an ellipsis or a mid-word wrap — both waste a narrow column.
struct FadingText: View {
  let text: String
  let size: CGFloat
  var weight: Font.Weight = .semibold
  var color: Color = Theme.textPrimary

  var body: some View {
    // In an overlay, so the text's full width never widens its container.
    Color.clear
      .frame(maxWidth: .infinity)
      .frame(height: size * 1.3)
      .overlay(alignment: .leading) {
        Text(text)
          .font(.system(size: size, weight: weight))
          .foregroundStyle(color)
          .lineLimit(1)
          .fixedSize()
      }
      .clipped()
      .mask(FadeOutEdge())
  }
}

/// Opaque, then fading to clear over the last few points of the trailing edge.
struct FadeOutEdge: View {
  var width: CGFloat = 6

  var body: some View {
    HStack(spacing: 0) {
      Color.black
      LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
        .frame(width: width)
    }
  }
}
