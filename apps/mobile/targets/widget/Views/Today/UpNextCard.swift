import SwiftUI

/// The hero card on the large Today widget: what is on now, or next, washed in
/// that event's colour, with a countdown that ticks without a timeline reload.
struct UpNextCard: View {
  let event: WidgetEvent?
  let dayKey: String
  let now: Date

  @Environment(\.widgetRenderingMode) private var renderingMode

  var body: some View {
    Link(destination: DeepLink.day(dayKey)) {
      ZStack(alignment: .leading) {
        if renderingMode == .fullColor {
          RoundedRectangle(cornerRadius: Theme.cardRadius, style: .continuous)
            .fill(
              LinearGradient(
                colors: [tint, tint.opacity(0.72)],
                startPoint: .topLeading, endPoint: .bottomTrailing)
            )
        } else {
          // On glass a gradient would be tinted flat white, and iOS warps a
          // card-sized colour image, so the card turns translucent like the
          // rest of the widget and keeps its colour in a bar down the side.
          SurfaceFill(color: .clear, cornerRadius: Theme.cardRadius, glassOpacity: 0.16)
          ColorMark(color: tint, form: .bar)
            .frame(width: 4)
            .padding(.vertical, 12)
            .padding(.leading, 9)
        }

        if let event {
          details(for: event)
        } else {
          free
        }
      }
      .frame(height: 74)
    }
  }

  private var tint: Color { event.map { Color(hex: $0.color) } ?? Theme.accent }

  private func details(for event: WidgetEvent) -> some View {
    let live = event.isHappening(at: now)

    return VStack(alignment: .leading, spacing: 2) {
      HStack(spacing: 5) {
        Text(live ? "NOW" : "UP NEXT")
          .font(.system(size: 9.5, weight: .heavy))
          .tracking(0.7)
        Text("·")
        Group {
          if live {
            Text("ends in \(event.endDate, style: .relative)")
          } else {
            Text("in \(event.startDate, style: .relative)")
          }
        }
        .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
      }
      .foregroundStyle(.white.opacity(0.85))
      // The small caps line leaves more air under it than the title does, so
      // pull it in: the three lines then sit evenly and the block centres.
      .padding(.bottom, -3)

      Text(event.title)
        .font(.system(size: 16, weight: .bold))
        .foregroundStyle(.white)
        .lineLimit(1)

      Text(subtitle(for: event))
        .font(.system(size: 11, weight: .medium).monospacedDigit())
        .foregroundStyle(.white.opacity(0.85))
        .lineLimit(1)
    }
    .padding(.leading, textInset)
    .padding(.trailing, 14)
  }

  /// Room for the colour bar on glass.
  private var textInset: CGFloat { renderingMode == .fullColor ? 14 : 22 }

  private func subtitle(for event: WidgetEvent) -> String {
    let time = "\(event.startLabel) – \(event.endLabel)"
    guard let location = event.location, !location.isEmpty else { return time }
    return "\(time)  ·  \(location)"
  }

  private var free: some View {
    HStack(spacing: 10) {
      Image(systemName: "sparkles")
        .font(.system(size: 20, weight: .semibold))
      VStack(alignment: .leading, spacing: 2) {
        Text("You're free")
          .font(.system(size: 16, weight: .bold))
        Text("Nothing else scheduled today")
          .font(.system(size: 11, weight: .medium))
          .opacity(0.85)
      }
    }
    .foregroundStyle(.white)
    .padding(.leading, textInset)
    .padding(.trailing, 14)
  }
}
