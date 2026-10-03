import SwiftUI

/// "FRIDAY / 2 October" with an at-a-glance count and the view switcher.
struct TodayHeader: View {
  let day: WidgetDay
  let entry: CalendarEntry
  let openTasks: Int
  var compact = false

  var body: some View {
    StackedHeader(eyebrow: day.weekday, title: day.dateLabel, compact: compact) {
      if !compact {
        summary
      }
      ModeSwitcher(entry: entry, compact: compact)
    }
  }

  private var summary: some View {
    HStack(spacing: 8) {
      Label("\(day.events.count)", systemImage: "calendar")
      Label("\(openTasks)", systemImage: "checkmark.square")
    }
    .labelStyle(CountLabelStyle())
  }
}

private struct CountLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 3) {
      configuration.icon.font(.system(size: 9.5, weight: .semibold))
      configuration.title.font(.system(size: 11, weight: .semibold).monospacedDigit())
    }
    .foregroundStyle(Theme.textSecondary)
  }
}
