import SwiftUI

/// The large Week view: day headers, a row of all-day events, and the week
/// laid out on a time grid, with a "now" line across today.
struct WeekTimeGrid: View {
  let days: [WidgetDay]
  let weekdayLabels: [String]
  let todayKey: String
  let now: Date
  let nowMinute: Int
  let uses24HourClock: Bool
  /// Extra-large: start times in shorter blocks too.
  let detailed: Bool

  private let gutter: CGFloat = 22
  private let columnSpacing: CGFloat = 2

  var body: some View {
    let window = HourWindow(days: days)
    let hasAllDay = days.contains { $0.events.contains(where: \.allDay) }

    VStack(spacing: 4) {
      row { index, day in dayHeading(day, index: index) }
      if hasAllDay {
        row { _, day in allDayCell(day) }
      }
      HStack(spacing: 0) {
        HourGutter(window: window, uses24HourClock: uses24HourClock)
          .frame(width: gutter)
        HStack(spacing: columnSpacing) {
          ForEach(days, id: \.key) { day in
            Link(destination: DeepLink.day(day.key)) {
              WeekDayLane(
                day: day, window: window, isToday: day.key == todayKey,
                isPast: day.key < todayKey, now: now, nowMinute: nowMinute, detailed: detailed)
            }
          }
        }
        .background(HourLines(window: window))
      }
    }
  }

  /// A row aligned with the grid's columns, past the hour gutter.
  private func row<Cell: View>(
    @ViewBuilder cell: @escaping (Int, WidgetDay) -> Cell
  ) -> some View {
    HStack(spacing: columnSpacing) {
      ForEach(Array(days.enumerated()), id: \.element.key) { index, day in
        Link(destination: DeepLink.day(day.key)) {
          cell(index, day).frame(maxWidth: .infinity)
        }
      }
    }
    .padding(.leading, gutter)
  }

  private func dayHeading(_ day: WidgetDay, index: Int) -> some View {
    let isToday = day.key == todayKey
    return VStack(spacing: 2) {
      Text(index < weekdayLabels.count ? weekdayLabels[index] : "")
        .font(.system(size: 9, weight: .semibold))
        .foregroundStyle(isToday ? Theme.accent : Theme.textTertiary)
        .widgetAccentable(isToday)
      DayBadge(number: day.dayNumber, isToday: isToday, size: 20)
    }
    .opacity(day.key < todayKey ? 0.5 : 1)
  }

  @ViewBuilder
  private func allDayCell(_ day: WidgetDay) -> some View {
    let allDay = day.events.filter(\.allDay)
    if let first = allDay.first {
      EventChip(
        title: allDay.count > 1 ? "+\(allDay.count) \(first.title)" : first.title,
        color: Color(hex: first.color), size: 8)
        .opacity(day.key < todayKey ? 0.5 : 1)
    } else {
      Color.clear.frame(height: 14)
    }
  }
}

/// The hours the grid shows: at least a working day, stretched to take in
/// the week's earliest and latest events, but never so long the blocks
/// become slivers.
struct HourWindow {
  let start: Int
  let end: Int

  private static let usual = 8...18
  private static let longest = 18

  init(days: [WidgetDay]) {
    let timed = days.flatMap(\.events).filter { !$0.allDay && $0.endMinute > $0.startMinute }
    var start = min(timed.map { $0.startMinute / 60 }.min() ?? Self.usual.lowerBound, Self.usual.lowerBound)
    let end = max(timed.map { ($0.endMinute + 59) / 60 }.max() ?? Self.usual.upperBound, Self.usual.upperBound)
    // Something overnight would drag the window to midnight: keep the evening.
    // What falls outside is left off the grid rather than squashed onto it.
    start = max(start, end - Self.longest)
    self.start = start
    self.end = end
  }

  var hours: Int { end - start }

  /// Whether any of the event shows on the grid.
  func shows(_ event: WidgetEvent) -> Bool {
    event.endMinute > start * 60 && event.startMinute < end * 60
  }

  /// How far down the grid a minute of the day sits, clamped to it.
  func offset(of minute: Int, hourHeight: CGFloat) -> CGFloat {
    let clamped = min(max(minute, start * 60), end * 60)
    return CGFloat(clamped - start * 60) / 60 * hourHeight
  }

  /// Every second or third hour, whichever keeps the labels apart.
  var labelledHours: [Int] {
    let step = hours > 12 ? 3 : 2
    let first = (start + step - 1) / step * step
    return Array(stride(from: first, through: end - 1, by: step)).filter { $0 > start }
  }
}

/// Faint lines across the grid at the labelled hours.
private struct HourLines: View {
  let window: HourWindow

  var body: some View {
    GeometryReader { geometry in
      let hourHeight = geometry.size.height / CGFloat(window.hours)
      ForEach(window.labelledHours, id: \.self) { hour in
        Rectangle()
          .fill(Theme.border.opacity(0.7))
          .frame(height: 0.5)
          .offset(y: window.offset(of: hour * 60, hourHeight: hourHeight))
      }
    }
  }
}

/// The hour labels down the left of the grid, centred on their lines.
private struct HourGutter: View {
  let window: HourWindow
  let uses24HourClock: Bool

  var body: some View {
    GeometryReader { geometry in
      let hourHeight = geometry.size.height / CGFloat(window.hours)
      ForEach(window.labelledHours, id: \.self) { hour in
        Text(label(hour))
          .font(.system(size: 7.5, weight: .medium).monospacedDigit())
          .foregroundStyle(Theme.textTertiary)
          .lineLimit(1)
          .fixedSize()
          .frame(width: geometry.size.width - 3, alignment: .trailing)
          .offset(y: window.offset(of: hour * 60, hourHeight: hourHeight) - 5)
      }
    }
  }

  private func label(_ hour: Int) -> String {
    if uses24HourClock { return String(format: "%02d", hour % 24) }
    let twelve = hour % 12 == 0 ? 12 : hour % 12
    return "\(twelve)\(hour % 24 < 12 ? "a" : "p")"
  }
}
