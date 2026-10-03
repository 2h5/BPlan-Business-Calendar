import Foundation

/// The snapshot the app writes for the widget.
///
/// Mirrors `widgetSnapshotSchema` in
/// `src/features/widgets/schema.ts` field for field. The app has already
/// resolved time zones, colours, recurrence, and labels, so nothing here is
/// computed — the widget only draws it.
struct WidgetSnapshot: Codable {
  static let supportedVersion = 2

  let version: Int
  let generatedAt: String
  let timeZone: String
  /// "h12" or "h23".
  let hourCycle: String
  let weekdayLabels: [String]
  let months: [WidgetMonth]
  /// This week and the next.
  let weeks: [WidgetWeek]
  /// From the start of this week to two weeks from today, in order.
  let days: [WidgetDay]
  let tasks: [WidgetTask]
  let moreTaskCount: Int

  func month(forKey key: String) -> WidgetMonth? { months.first { $0.key == key } }
  func day(forKey key: String) -> WidgetDay? { days.first { $0.key == key } }

  /// The listed days from `key` on.
  func days(from key: String) -> ArraySlice<WidgetDay> {
    guard let index = days.firstIndex(where: { $0.key >= key }) else { return [] }
    return days[index...]
  }

  var uses24HourClock: Bool { hourCycle != "h12" }
}

struct WidgetWeek: Codable {
  let key: String
  /// "28 Sep – 4 Oct"
  let label: String
  /// Seven day keys in display order.
  let days: [String]
}

struct WidgetMonth: Codable {
  let key: String
  let title: String
  let year: String
  let weeks: [[WidgetMonthCell]]
}

struct WidgetMonthCell: Codable, Identifiable {
  let key: String
  let day: Int
  let inMonth: Bool
  let colors: [String]
  let count: Int
  let chips: [WidgetChip]

  var id: String { key }
}

struct WidgetChip: Codable {
  let title: String
  let color: String
}

struct WidgetDay: Codable {
  let key: String
  let weekday: String
  let dateLabel: String
  let events: [WidgetEvent]

  /// 3 for "2026-10-03".
  var dayNumber: Int { Int(key.suffix(2)) ?? 0 }
}

struct WidgetEvent: Codable, Identifiable {
  let id: String
  let title: String
  /// Epoch milliseconds.
  let start: Double
  let end: Double
  let allDay: Bool
  let startLabel: String
  let endLabel: String
  let color: String
  let location: String?
  /// Minutes from local midnight, clipped to this day (0...1440).
  let startMinute: Int
  let endMinute: Int

  var startDate: Date { Date(timeIntervalSince1970: start / 1000) }
  var endDate: Date { Date(timeIntervalSince1970: end / 1000) }

  func isPast(at now: Date) -> Bool { endDate <= now }
  func isHappening(at now: Date) -> Bool { !allDay && startDate <= now && now < endDate }
}

struct WidgetTask: Codable, Identifiable {
  let id: String
  let title: String
  let completed: Bool
  let overdue: Bool
  let flagged: Bool
  let dueLabel: String?
}
