import SwiftUI
import WidgetKit

/// Up Next: the event on now or next, for the Lock Screen (rectangular,
/// circular, inline) and a small Home Screen size that also shows in StandBy.
///
/// The `kind` must be listed in `WIDGET_KINDS` in
/// `src/features/widgets/constants.ts` so the app redraws it with new data.
struct UpNextWidget: Widget {
  static let kind = "UpNextWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: Self.kind, provider: UpNextProvider()) { entry in
      UpNextWidgetView(entry: entry)
    }
    .configurationDisplayName("Up Next")
    .description("What's on now or next, at a glance.")
    .supportedFamilies([
      .systemSmall, .accessoryRectangular, .accessoryCircular, .accessoryInline,
    ])
  }
}

struct UpNextWidgetView: View {
  let entry: UpNextEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    content
      .widgetURL(entry.upNext.map { DeepLink.day($0.today.key) } ?? DeepLink.today)
      .containerBackground(for: .widget) { background }
  }

  @ViewBuilder private var content: some View {
    switch family {
    case .accessoryRectangular: LockRectangularView(upNext: entry.upNext, now: entry.date)
    case .accessoryCircular: LockCircularView(upNext: entry.upNext, now: entry.date)
    case .accessoryInline: LockInlineView(upNext: entry.upNext, now: entry.date)
    default:
      if let upNext = entry.upNext {
        UpNextSmallView(upNext: upNext, now: entry.date)
      } else {
        SignedOutView()
      }
    }
  }

  /// The Lock Screen drops container backgrounds, so accessory sizes draw
  /// any backing they want inside their own view.
  @ViewBuilder private var background: some View {
    switch family {
    case .accessoryCircular, .accessoryRectangular, .accessoryInline: Color.clear
    default: WidgetBackdrop()
    }
  }
}
