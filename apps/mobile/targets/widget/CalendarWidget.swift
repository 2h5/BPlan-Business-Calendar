import SwiftUI
import WidgetKit

/// The BPlan Calendar widget: one widget with a Today / Week / Month / Agenda
/// switcher inside, opening on the view chosen in Edit Widget.
///
/// The `kind` must match `WIDGET_KIND` in `src/features/widgets/constants.ts`,
/// which the app uses to ask WidgetKit for a redraw.
struct CalendarWidget: Widget {
  static let kind = "CalendarWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: Self.kind, intent: CalendarWidgetIntent.self, provider: CalendarProvider()
    ) { entry in
      CalendarWidgetView(entry: entry)
        .containerBackground(for: .widget) { WidgetBackdrop() }
    }
    .configurationDisplayName("Calendar")
    .description("Your month, week, day, and agenda, with tasks you can tick off right here.")
    .supportedFamilies(Self.families)
  }

  private static var families: [WidgetFamily] {
    if #available(iOS 27.0, *) {
      return [.systemMedium, .systemLarge, .systemExtraLargePortrait]
    }
    return [.systemMedium, .systemLarge]
  }
}

struct CalendarWidgetView: View {
  let entry: CalendarEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        switch entry.mode {
        case .month: MonthWidgetView(entry: entry, snapshot: snapshot, family: family)
        case .week: WeekWidgetView(entry: entry, snapshot: snapshot, family: family)
        case .today: TodayWidgetView(entry: entry, snapshot: snapshot, family: family)
        case .agenda: AgendaWidgetView(entry: entry, snapshot: snapshot, family: family)
        }
      } else {
        SignedOutView()
      }
    }
    // Taps outside any button or link open the app on Today.
    .widgetURL(DeepLink.today)
  }
}
