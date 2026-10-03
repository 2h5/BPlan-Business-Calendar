import SwiftUI

/// One event: a colour bar, the title, and its time. Past events fade back;
/// the one happening now gets a live "now" mark.
struct EventRow: View {
  let event: WidgetEvent
  let now: Date
  var dense = false

  var body: some View {
    let past = event.isPast(at: now)
    let live = event.isHappening(at: now)

    HStack(spacing: 8) {
      ColorMark(color: Color(hex: event.color), form: .bar)
        .frame(width: 3)

      VStack(alignment: .leading, spacing: 1) {
        Text(event.title)
          .font(.system(size: dense ? 12 : 13, weight: .semibold))
          .foregroundStyle(Theme.textPrimary)
          .lineLimit(1)

        HStack(spacing: 4) {
          if live {
            Circle().fill(Theme.now).frame(width: 5, height: 5)
          }
          Text(timeText)
            .font(.system(size: dense ? 10.5 : 11, weight: .medium).monospacedDigit())
            .foregroundStyle(live ? Theme.now : Theme.textSecondary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
        }
      }
      Spacer(minLength: 0)
    }
    .frame(height: dense ? 28 : 32)
    .opacity(past ? 0.45 : 1)
  }

  private var timeText: String {
    if event.allDay { return "All day" }
    if let location = event.location, !location.isEmpty, !dense {
      return "\(event.startLabel) · \(location)"
    }
    return "\(event.startLabel) – \(event.endLabel)"
  }
}
