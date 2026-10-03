import SwiftUI

/// "October 2026  ‹ ›" with the view switcher on the right.
struct MonthHeader: View {
  let month: WidgetMonth
  let entry: CalendarEntry
  var compact = false

  var body: some View {
    HStack(spacing: 6) {
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text(month.title)
          .font(.system(size: compact ? 15 : 17, weight: .bold))
          .foregroundStyle(Theme.textPrimary)
        Text(month.year)
          .font(.system(size: compact ? 15 : 17, weight: .regular))
          .foregroundStyle(Theme.accent)
          .widgetAccentable()
      }
      .lineLimit(1)
      .minimumScaleFactor(0.75)
      // The month name keeps its width before anything else gives way.
      .layoutPriority(1)

      Spacer(minLength: 4)

      let range = WidgetMode.month.pageRange
      PageArrows(
        entry: entry,
        canGoBack: entry.pageOffset > range.lowerBound,
        canGoForward: entry.pageOffset < range.upperBound,
        unit: "month")
      ModeSwitcher(entry: entry, compact: compact)
    }
  }
}
