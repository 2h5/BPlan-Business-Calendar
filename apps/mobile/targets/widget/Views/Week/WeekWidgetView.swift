import SwiftUI
import WidgetKit

/// The Week face. Medium shows the seven days as columns of event chips;
/// large and up lay the week out on a time grid, like the app's week view.
/// The arrows page between this week and the next.
struct WeekWidgetView: View {
  let entry: CalendarEntry
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    let clock = WidgetClock(timeZoneIdentifier: snapshot.timeZone)
    let todayKey = clock.dayKey(for: entry.date)

    if let current = snapshot.weeks.firstIndex(where: { $0.days.contains(todayKey) }) {
      let index = min(current + entry.pageOffset, snapshot.weeks.count - 1)
      let week = snapshot.weeks[index]
      let days = week.days.map { key in
        snapshot.day(forKey: key) ?? WidgetDay(key: key, weekday: "", dateLabel: "", events: [])
      }
      let compact = family == .systemMedium

      VStack(spacing: compact ? 8 : 10) {
        StackedHeader(
          eyebrow: index == current ? "This week" : "Next week", title: week.label,
          compact: compact
        ) {
          PageArrows(
            entry: entry, canGoBack: index > current,
            canGoForward: index < snapshot.weeks.count - 1, unit: "week")
          ModeSwitcher(entry: entry, compact: compact)
        }

        if compact {
          WeekStrip(
            days: days, weekdayLabels: snapshot.weekdayLabels, todayKey: todayKey)
        } else {
          WeekTimeGrid(
            days: days, weekdayLabels: snapshot.weekdayLabels, todayKey: todayKey,
            now: entry.date, nowMinute: clock.minuteOfDay(for: entry.date),
            uses24HourClock: snapshot.uses24HourClock, detailed: family != .systemLarge)
        }
      }
    } else {
      // The snapshot is over a week old: there is nothing true left to show.
      SignedOutView()
    }
  }
}

/// A day's number, filled with the accent when it is today.
struct DayBadge: View {
  let number: Int
  let isToday: Bool
  var size: CGFloat = 18

  var body: some View {
    Text("\(number)")
      .font(.system(size: size * 0.62, weight: isToday ? .bold : .semibold).monospacedDigit())
      .foregroundStyle(isToday ? Theme.onAccent : Theme.textPrimary)
      .frame(width: size, height: size)
      .background {
        if isToday {
          SurfaceFill(color: Theme.accent, cornerRadius: size * 0.3, glassOpacity: 0.32)
        }
      }
      .widgetAccentable(isToday)
  }
}
