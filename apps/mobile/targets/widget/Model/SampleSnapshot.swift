import Foundation

/// A believable day for the widget gallery and the loading placeholder, so
/// "Add Widget" shows what the widget does rather than an empty frame.
enum SampleSnapshot {
  static func make(now: Date = Date()) -> WidgetSnapshot {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = .current
    let clock = WidgetClock(timeZoneIdentifier: TimeZone.current.identifier)
    let today = calendar.startOfDay(for: now)
    // Monday-first, to match the sample month grid.
    let lead = (calendar.component(.weekday, from: today) + 5) % 7
    let weekStart = calendar.date(byAdding: .day, value: -lead, to: today) ?? today

    func day(_ offset: Int) -> Date {
      calendar.date(byAdding: .day, value: offset, to: weekStart) ?? weekStart
    }

    // From the start of this week to two weeks from today, as the app writes.
    let days = (0..<(lead + 14)).map { offset -> WidgetDay in
      let date = day(offset)
      let plan = date == today ? todayPlan : weekPlan[offset % weekPlan.count]
      return WidgetDay(
        key: clock.dayKey(for: date),
        weekday: format("EEEE", date),
        dateLabel: format("d MMMM", date),
        events: plan.map { sampleEvent($0, on: date, calendar: calendar) })
    }

    let weeks = (0..<2).map { week -> WidgetWeek in
      let first = day(week * 7)
      let last = day(week * 7 + 6)
      return WidgetWeek(
        key: clock.dayKey(for: first),
        label: "\(format("d MMM", first)) – \(format("d MMM", last))",
        days: (0..<7).map { clock.dayKey(for: day(week * 7 + $0)) })
    }

    return WidgetSnapshot(
      version: WidgetSnapshot.supportedVersion,
      generatedAt: ISO8601DateFormatter().string(from: now),
      timeZone: TimeZone.current.identifier,
      hourCycle: "h23",
      weekdayLabels: ["M", "T", "W", "T", "F", "S", "S"],
      months: [sampleMonth(containing: today, calendar: calendar, clock: clock)],
      weeks: weeks,
      days: days,
      tasks: [
        WidgetTask(
          id: "1", title: "Send the Q4 deck", completed: false, overdue: true, flagged: true,
          dueLabel: nil),
        WidgetTask(
          id: "2", title: "Book flights", completed: false, overdue: false, flagged: false,
          dueLabel: "14:00"),
        WidgetTask(
          id: "3", title: "Reply to Priya", completed: true, overdue: false, flagged: false,
          dueLabel: nil),
      ],
      moreTaskCount: 2)
  }

  /// Title, start and end as (hour, minute), colour, location.
  private typealias Plan = (String, (Int, Int), (Int, Int), String, String?)

  private static let todayPlan: [Plan] = [
    ("Design review", (9, 30), (10, 30), "#6E8BFF", "Studio 3"),
    ("Lunch with Sam", (12, 30), (13, 30), "#3ECF8E", "Bluebird Café"),
    ("Sprint planning", (15, 0), (16, 0), "#B476FF", nil),
    ("Gym", (18, 0), (19, 0), "#F5B759", nil),
  ]

  /// A plausible working week, cycled through the other days.
  private static let weekPlan: [[Plan]] = [
    [("Standup", (9, 0), (9, 30), "#6E8BFF", nil), ("1:1 with Ana", (14, 0), (14, 45), "#3ECF8E", nil)],
    [("Standup", (9, 0), (9, 30), "#6E8BFF", nil), ("Roadmap", (11, 0), (12, 30), "#B476FF", "Room 4")],
    [("Focus time", (10, 0), (12, 0), "#F5B759", nil), ("Design crit", (15, 0), (16, 0), "#6E8BFF", nil)],
    [("Standup", (9, 0), (9, 30), "#6E8BFF", nil), ("Dentist", (16, 30), (17, 15), "#FF6B6B", nil)],
    [("Demo day", (13, 0), (15, 0), "#B476FF", nil), ("Drinks", (18, 0), (20, 0), "#3ECF8E", "The Crown")],
    [("Climbing", (10, 0), (12, 0), "#F5B759", nil)],
    [],
  ]

  private static func format(_ pattern: String, _ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = pattern
    return formatter.string(from: date)
  }

  private static func sampleEvent(_ plan: Plan, on day: Date, calendar: Calendar) -> WidgetEvent {
    let (title, from, to, color, location) = plan
    func at(_ time: (Int, Int)) -> Date {
      calendar.date(bySettingHour: time.0, minute: time.1, second: 0, of: day) ?? day
    }
    return WidgetEvent(
      id: "\(title)-\(day.timeIntervalSince1970)", title: title,
      start: at(from).timeIntervalSince1970 * 1000, end: at(to).timeIntervalSince1970 * 1000,
      allDay: false, startLabel: format("HH:mm", at(from)), endLabel: format("HH:mm", at(to)),
      color: color, location: location,
      startMinute: from.0 * 60 + from.1, endMinute: to.0 * 60 + to.1)
  }

  /// A Monday-first six-week grid with a scatter of event dots.
  private static func sampleMonth(
    containing today: Date, calendar: Calendar, clock: WidgetClock
  ) -> WidgetMonth {
    let monthStart =
      calendar.date(from: calendar.dateComponents([.year, .month], from: today)) ?? today
    let weekday = calendar.component(.weekday, from: monthStart)  // 1 = Sunday
    let lead = (weekday + 5) % 7
    let gridStart = calendar.date(byAdding: .day, value: -lead, to: monthStart) ?? monthStart
    let palette = ["#6E8BFF", "#3ECF8E", "#B476FF", "#F5B759", "#FF6B6B"]
    let month = calendar.component(.month, from: today)

    let cells = (0..<42).map { offset -> WidgetMonthCell in
      let date = calendar.date(byAdding: .day, value: offset, to: gridStart) ?? gridStart
      let day = calendar.component(.day, from: date)
      let busy = (day * 7) % 5
      let colors = Array(palette[0..<min(busy, 3)])
      return WidgetMonthCell(
        key: clock.dayKey(for: date), day: day,
        inMonth: calendar.component(.month, from: date) == month,
        colors: colors, count: colors.count,
        chips: zip(["Standup", "Review"], colors).map { WidgetChip(title: $0, color: $1) })
    }

    let titleFormat = DateFormatter()
    titleFormat.dateFormat = "MMMM"
    return WidgetMonth(
      key: clock.monthKey(for: today),
      title: titleFormat.string(from: today),
      year: String(calendar.component(.year, from: today)),
      weeks: (0..<6).map { Array(cells[($0 * 7)..<($0 * 7 + 7)]) })
  }
}
