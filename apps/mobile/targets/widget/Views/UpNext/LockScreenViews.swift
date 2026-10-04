import SwiftUI
import WidgetKit

// The Lock Screen draws accessory widgets in one tint over the wallpaper, so
// these views use the system's primary and secondary styles rather than the
// app's colours, and mark the bit that should take the accent with
// `widgetAccentable()`.

/// Under the clock: the time, the event, then where it is or what follows.
struct LockRectangularView: View {
  let upNext: UpNext?
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let upNext {
        lines(for: upNext)
      } else {
        Text("BPlan").font(.headline).widgetAccentable()
        Text("Open the app to see your calendar")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder private func lines(for upNext: UpNext) -> some View {
    if let event = upNext.event {
      Text(event.isHappening(at: now) ? "Now · until \(event.endLabel)" : timeRange(event))
        .font(.caption.weight(.semibold).monospacedDigit())
        .widgetAccentable()
      Text(event.title).font(.headline).lineLimit(1)
      if let detail = detail(for: event, laterCount: upNext.laterCount) {
        Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
      }
    } else {
      Text("Today").font(.caption.weight(.semibold)).widgetAccentable()
      Text("No more events").font(.headline).lineLimit(1)
      if let first = upNext.tomorrowFirst {
        Text(
          first.allDay
            ? "Tomorrow: \(first.title)" : "Tomorrow \(first.startLabel) · \(first.title)")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
    }
  }

  private func timeRange(_ event: WidgetEvent) -> String {
    "\(event.startLabel) – \(event.endLabel)"
  }

  private func detail(for event: WidgetEvent, laterCount: Int) -> String? {
    if let location = event.location, !location.isEmpty { return location }
    return laterCount > 0 ? "+\(laterCount) more today" : nil
  }
}

/// A round slot: a ring filling through the event on now, the start time of
/// the next one, or today's date when the day is clear.
struct LockCircularView: View {
  let upNext: UpNext?
  let now: Date

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      content
    }
  }

  @ViewBuilder private var content: some View {
    if let upNext, let event = upNext.event {
      if event.isHappening(at: now) {
        Gauge(value: progress(through: event)) {
          Image(systemName: "calendar")
        } currentValueLabel: {
          Text("NOW").font(.system(size: 12, weight: .bold))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
      } else {
        startTime(event.startLabel)
      }
    } else if let upNext {
      VStack(spacing: -1) {
        Text(upNext.shortWeekday)
          .font(.system(size: 11, weight: .bold))
          .widgetAccentable()
        Text("\(upNext.today.dayNumber)")
          .font(.system(size: 22, weight: .bold).monospacedDigit())
      }
    } else {
      Image(systemName: "calendar").font(.system(size: 22, weight: .semibold))
    }
  }

  /// "8:00 AM" is too wide for the circle at a readable size, so a 12-hour
  /// label puts its AM/PM on a line of its own under the time.
  private func startTime(_ label: String) -> some View {
    let parts = label.split(separator: " ", maxSplits: 1).map(String.init)

    return VStack(spacing: 0) {
      Image(systemName: "calendar")
        .font(.system(size: 11, weight: .semibold))
        .widgetAccentable()
      Text(parts.first ?? label)
        .font(.system(size: 18, weight: .bold).monospacedDigit())
        .lineLimit(1)
        .minimumScaleFactor(0.6)
      if parts.count > 1 {
        Text(parts[1])
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 5)
  }

  private func progress(through event: WidgetEvent) -> Double {
    let length = event.endDate.timeIntervalSince(event.startDate)
    guard length > 0 else { return 1 }
    return min(max(now.timeIntervalSince(event.startDate) / length, 0), 1)
  }
}

/// One line above the clock, beside the date.
struct LockInlineView: View {
  let upNext: UpNext?
  let now: Date

  var body: some View {
    Label {
      Text(text)
    } icon: {
      Image(systemName: "calendar")
    }
  }

  private var text: String {
    guard let upNext else { return "BPlan" }
    guard let event = upNext.event else { return "No more events today" }
    return event.isHappening(at: now)
      ? "Now · \(event.title)" : "\(event.startLabel) \(event.title)"
  }
}
