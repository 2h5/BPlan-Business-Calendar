import WidgetKit

struct CalendarEntry: TimelineEntry {
  let date: Date
  /// nil when signed out or before the app has written anything.
  let snapshot: WidgetSnapshot?
  /// The view showing now, and the one chosen in Edit Widget.
  let mode: WidgetMode
  let home: WidgetMode
  /// Months or weeks away from the current one.
  let pageOffset: Int
  /// Which widget this is, for the buttons' intents (`SharedStore.slot`).
  let slot: String
  /// Task ticks made on the Home Screen that the app has not sent yet.
  let pendingCompletion: [String: Bool]
  /// The gallery preview, drawn from sample data.
  var isSample = false

  static func sample(now: Date = Date(), mode: WidgetMode = .today) -> CalendarEntry {
    CalendarEntry(
      date: now, snapshot: SampleSnapshot.make(now: now), mode: mode, home: mode, pageOffset: 0,
      slot: "", pendingCompletion: [:], isSample: true)
  }
}

/// Builds the widget's timeline from the stored snapshot.
///
/// The snapshot only changes when the app writes one — the app asks WidgetKit
/// to reload then — so the timeline just steps through time: a fresh entry
/// every 15 minutes keeps "now" and "up next" honest, and one at midnight
/// turns the page to the next day even if the app is never opened.
struct CalendarProvider: AppIntentTimelineProvider {
  private static let step: TimeInterval = 15 * 60
  private static let entriesPerTimeline = 16  // four hours

  func placeholder(in context: Context) -> CalendarEntry { .sample() }

  func snapshot(for configuration: CalendarWidgetIntent, in context: Context) async
    -> CalendarEntry
  {
    let entry = entry(at: Date(), configuration: configuration, family: context.family)
    return context.isPreview && entry.snapshot == nil
      ? .sample(mode: configuration.defaultView) : entry
  }

  func timeline(for configuration: CalendarWidgetIntent, in context: Context) async
    -> Timeline<CalendarEntry>
  {
    let now = Date()
    var dates = (0..<Self.entriesPerTimeline).map {
      now.addingTimeInterval(Double($0) * Self.step)
    }

    if let snapshot = SharedStore.loadSnapshot() {
      let midnight = WidgetClock(timeZoneIdentifier: snapshot.timeZone).nextMidnight(after: now)
      if let last = dates.last, midnight < last {
        dates = dates.filter { $0 < midnight } + [midnight]
      }
    }

    let entries = dates.map { entry(at: $0, configuration: configuration, family: context.family) }
    return Timeline(entries: entries, policy: .atEnd)
  }

  private func entry(
    at date: Date, configuration: CalendarWidgetIntent, family: WidgetFamily
  ) -> CalendarEntry {
    let home = configuration.defaultView
    let slot = SharedStore.slot(home: home, family: String(describing: family))
    return CalendarEntry(
      date: date,
      snapshot: SharedStore.loadSnapshot(),
      mode: SharedStore.mode(slot: slot, home: home, at: date),
      home: home,
      pageOffset: SharedStore.pageOffset(slot: slot, at: date),
      slot: slot,
      pendingCompletion: SharedStore.pendingCompletion())
  }
}
