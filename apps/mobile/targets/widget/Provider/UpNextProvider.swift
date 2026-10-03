import WidgetKit

struct UpNextEntry: TimelineEntry {
  let date: Date
  /// nil when signed out or before the app has written anything.
  let snapshot: WidgetSnapshot?

  var upNext: UpNext? { snapshot.flatMap { UpNext(snapshot: $0, at: date) } }
}

/// The Up Next timeline. Like `CalendarProvider` it steps through time from the
/// stored snapshot, and it also redraws at every event start and end today,
/// so the Lock Screen never shows an event that has just finished as next.
struct UpNextProvider: TimelineProvider {
  private static let step: TimeInterval = 15 * 60
  private static let entriesPerTimeline = 16  // four hours

  func placeholder(in context: Context) -> UpNextEntry { Self.sample() }

  func getSnapshot(in context: Context, completion: @escaping (UpNextEntry) -> Void) {
    let snapshot = SharedStore.loadSnapshot()
    completion(
      context.isPreview && snapshot == nil
        ? Self.sample() : UpNextEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UpNextEntry>) -> Void) {
    let now = Date()
    let snapshot = SharedStore.loadSnapshot()
    var dates = (0..<Self.entriesPerTimeline).map {
      now.addingTimeInterval(Double($0) * Self.step)
    }

    if let snapshot, let last = dates.last {
      dates += UpNext.boundaries(in: snapshot, after: now).filter { $0 < last }
      let midnight = WidgetClock(timeZoneIdentifier: snapshot.timeZone).nextMidnight(after: now)
      if midnight < last {
        dates = dates.filter { $0 < midnight } + [midnight]
      }
    }

    let entries = Set(dates).sorted().map { UpNextEntry(date: $0, snapshot: snapshot) }
    completion(Timeline(entries: entries, policy: .atEnd))
  }

  private static func sample() -> UpNextEntry {
    let now = Date()
    return UpNextEntry(date: now, snapshot: SampleSnapshot.make(now: now))
  }
}
