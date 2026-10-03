import SwiftUI

/// The medium Week view: seven columns, each a day's first events as chips.
/// Days already gone fade back; today sits on a raised card.
struct WeekStrip: View {
  let days: [WidgetDay]
  let weekdayLabels: [String]
  let todayKey: String

  var body: some View {
    HStack(spacing: 3) {
      ForEach(Array(days.enumerated()), id: \.element.key) { index, day in
        Link(destination: DeepLink.day(day.key)) {
          column(
            day: day, initial: index < weekdayLabels.count ? weekdayLabels[index] : "",
            isToday: day.key == todayKey)
        }
      }
    }
  }

  private func column(day: WidgetDay, initial: String, isToday: Bool) -> some View {
    // Three chips fit; with more to tell, two and a "+n".
    let shown = day.events.count > 3 ? 2 : 3
    let hidden = day.events.count - min(shown, day.events.count)

    return VStack(spacing: 3) {
      VStack(spacing: 1) {
        Text(initial)
          .font(.system(size: 8.5, weight: .semibold))
          .foregroundStyle(isToday ? Theme.accent : Theme.textTertiary)
          .widgetAccentable(isToday)
        DayBadge(number: day.dayNumber, isToday: isToday)
      }
      .padding(.bottom, 1)

      ForEach(day.events.prefix(shown)) { event in
        EventChip(title: event.title, color: Color(hex: event.color))
      }
      if hidden > 0 {
        Text("+\(hidden)")
          .font(.system(size: 8.5, weight: .semibold))
          .foregroundStyle(Theme.textTertiary)
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 4)
    .padding(.horizontal, 2)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background {
      if isToday {
        SurfaceFill(color: Theme.surface, cornerRadius: 8)
      }
    }
    .opacity(day.key < todayKey ? 0.45 : 1)
  }
}
