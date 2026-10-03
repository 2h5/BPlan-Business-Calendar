import Foundation

/// What the Up Next widget shows at a given moment: the event on now or next
/// today, how many more follow it, and — once today is done — tomorrow's
/// first event. Picked from the snapshot only; nothing is computed beyond
/// "which day and which event is it now".
struct UpNext {
  let today: WidgetDay
  /// On now, or the next to start today. All-day events never lead.
  let event: WidgetEvent?
  /// Timed events after `event` today.
  let laterCount: Int
  /// Tomorrow and its first event, for when today has nothing left.
  let tomorrow: WidgetDay?

  init?(snapshot: WidgetSnapshot, at now: Date) {
    let clock = WidgetClock(timeZoneIdentifier: snapshot.timeZone)
    guard let today = snapshot.day(forKey: clock.dayKey(for: now)) else { return nil }

    let ahead = today.events.filter { !$0.allDay && !$0.isPast(at: now) }
    self.today = today
    event = ahead.first
    laterCount = max(ahead.count - 1, 0)
    tomorrow = snapshot.days(from: today.key).dropFirst().first
  }

  func isLive(at now: Date) -> Bool { event?.isHappening(at: now) ?? false }

  var tomorrowFirst: WidgetEvent? {
    tomorrow?.events.first { !$0.allDay } ?? tomorrow?.events.first
  }

  /// "SAT", for the small and circular sizes.
  var shortWeekday: String { String(today.weekday.prefix(3)).uppercased() }

  /// The moments the widget should redraw at: each start and end still ahead
  /// today, so "next" moves on exactly when an event begins or ends.
  static func boundaries(in snapshot: WidgetSnapshot, after now: Date) -> [Date] {
    let clock = WidgetClock(timeZoneIdentifier: snapshot.timeZone)
    guard let today = snapshot.day(forKey: clock.dayKey(for: now)) else { return [] }
    return today.events
      .filter { !$0.allDay }
      .flatMap { [$0.startDate, $0.endDate] }
      .filter { $0 > now }
  }
}
