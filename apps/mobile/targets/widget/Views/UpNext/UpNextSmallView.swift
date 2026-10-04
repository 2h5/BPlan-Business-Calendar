import SwiftUI

/// The small Home Screen (and StandBy) Up Next: the date, then the event on
/// now or next in its calendar colour, with a live countdown. Once today is
/// done it looks ahead to tomorrow.
struct UpNextSmallView: View {
  let upNext: UpNext
  let now: Date

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      date
      Spacer(minLength: 6)
      if let event = upNext.event {
        EventBlock(
          event: event, caption: caption(for: event), now: now,
          footnote: upNext.laterCount > 0 ? "+\(upNext.laterCount) more today" : nil)
      } else if let first = upNext.tomorrowFirst {
        EventBlock(
          event: first, caption: Text("Tomorrow"), now: now, footnote: "Nothing more today")
      } else {
        QuietNote(symbol: "sun.max", text: "Nothing coming up")
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }

  private var date: some View {
    VStack(alignment: .leading, spacing: -2) {
      Text(upNext.today.weekday.uppercased())
        .font(.system(size: 11, weight: .bold))
        .tracking(0.6)
        .foregroundStyle(Theme.now)
        .widgetAccentable()
        .lineLimit(1)
      Text("\(upNext.today.dayNumber)")
        .font(.system(size: 30, weight: .bold).monospacedDigit())
        .foregroundStyle(Theme.textPrimary)
    }
  }

  private func caption(for event: WidgetEvent) -> Text {
    event.isHappening(at: now)
      ? Text("Now · ends in \(event.endDate, style: .relative)")
      : Text("In \(event.startDate, style: .relative)")
  }
}

private struct EventBlock: View {
  let event: WidgetEvent
  let caption: Text
  let now: Date
  let footnote: String?

  var body: some View {
    HStack(alignment: .top, spacing: 7) {
      ColorMark(color: Color(hex: event.color), form: .bar)
        .frame(width: 3)

      VStack(alignment: .leading, spacing: 1) {
        // Sentence case: the live countdown cannot be uppercased.
        caption
          .font(.system(size: 10.5, weight: .bold).monospacedDigit())
          .foregroundStyle(event.isHappening(at: now) ? Theme.now : Theme.textSecondary)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
        Text(event.title)
          .font(.system(size: 14, weight: .bold))
          .foregroundStyle(Theme.textPrimary)
          .lineLimit(2)
        Text(event.allDay ? "All day" : "\(event.startLabel) – \(event.endLabel)")
          .font(.system(size: 11, weight: .medium).monospacedDigit())
          .foregroundStyle(Theme.textSecondary)
          .lineLimit(1)
        if let footnote {
          Text(footnote)
            .font(.system(size: 10.5, weight: .semibold))
            .foregroundStyle(Theme.textTertiary)
            .lineLimit(1)
            .padding(.top, 3)
        }
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}
