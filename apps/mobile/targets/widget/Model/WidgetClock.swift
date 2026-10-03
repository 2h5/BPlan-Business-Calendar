import Foundation

/// "Which day is it now?" in the user's time zone — the only date maths the
/// widget does. Everything else arrives pre-computed in the snapshot.
///
/// It exists so a widget the app has not refreshed overnight still moves on to
/// the next day in the snapshot instead of showing yesterday as today.
struct WidgetClock {
  private let calendar: Calendar

  init(timeZoneIdentifier: String) {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: timeZoneIdentifier) ?? .current
    self.calendar = calendar
  }

  /// "2026-10-02"
  func dayKey(for date: Date) -> String {
    let parts = calendar.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
  }

  /// "2026-10", `offset` months from the month holding `date`.
  func monthKey(for date: Date, offset: Int = 0) -> String {
    let shifted = calendar.date(byAdding: .month, value: offset, to: date) ?? date
    let parts = calendar.dateComponents([.year, .month], from: shifted)
    return String(format: "%04d-%02d", parts.year ?? 1970, parts.month ?? 1)
  }

  /// Minutes since local midnight: where the Week view draws its "now" line.
  func minuteOfDay(for date: Date) -> Int {
    let parts = calendar.dateComponents([.hour, .minute], from: date)
    return (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
  }

  func nextMidnight(after date: Date) -> Date {
    let tomorrow = calendar.date(byAdding: .day, value: 1, to: date) ?? date
    return calendar.startOfDay(for: tomorrow)
  }
}
