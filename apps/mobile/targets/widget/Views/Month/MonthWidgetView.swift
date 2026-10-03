import SwiftUI
import WidgetKit

/// The Month face. Medium pairs a compact grid with what is left of today;
/// large gives the grid the whole widget with a "next up" line underneath;
/// extra-large adds event titles to each day.
struct MonthWidgetView: View {
  let entry: CalendarEntry
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    let clock = WidgetClock(timeZoneIdentifier: snapshot.timeZone)
    let todayKey = clock.dayKey(for: entry.date)
    let month =
      snapshot.month(forKey: clock.monthKey(for: entry.date, offset: entry.pageOffset))
      ?? snapshot.month(forKey: clock.monthKey(for: entry.date))
      ?? snapshot.months.first
    let today = snapshot.day(forKey: todayKey)

    if let month {
      switch family {
      case .systemMedium:
        medium(month: month, todayKey: todayKey, today: today)
      default:
        large(month: month, todayKey: todayKey, today: today)
      }
    } else {
      SignedOutView()
    }
  }

  private func medium(month: WidgetMonth, todayKey: String, today: WidgetDay?) -> some View {
    VStack(spacing: 6) {
      MonthHeader(month: month, entry: entry, compact: true)
      HStack(alignment: .top, spacing: 12) {
        MonthGrid(
          month: month, weekdayLabels: snapshot.weekdayLabels, todayKey: todayKey,
          style: .compact)
        RestOfToday(day: today, now: entry.date, limit: 3)
          .frame(maxWidth: .infinity)
      }
    }
  }

  private func large(month: WidgetMonth, todayKey: String, today: WidgetDay?) -> some View {
    VStack(spacing: 8) {
      MonthHeader(month: month, entry: entry)
      MonthGrid(
        month: month, weekdayLabels: snapshot.weekdayLabels, todayKey: todayKey,
        style: family == .systemLarge ? .regular : .expanded)
      NextUpLine(day: today, now: entry.date)
    }
  }
}

/// The medium widget's right column: today's remaining events.
private struct RestOfToday: View {
  let day: WidgetDay?
  let now: Date
  let limit: Int

  var body: some View {
    let upcoming = (day?.events ?? []).filter { !$0.isPast(at: now) }

    VStack(alignment: .leading, spacing: 2) {
      Text("TODAY")
        .font(.system(size: 9, weight: .bold))
        .tracking(0.6)
        .foregroundStyle(Theme.textTertiary)
        .padding(.bottom, 2)

      if upcoming.isEmpty {
        QuietNote(symbol: "sparkles", text: "Nothing left today")
      } else {
        ForEach(upcoming.prefix(limit)) { event in
          Link(destination: DeepLink.day(day?.key ?? "")) {
            EventRow(event: event, now: now, dense: true)
          }
        }
        if upcoming.count > limit {
          Text("+\(upcoming.count - limit) more")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(Theme.textTertiary)
        }
      }
      Spacer(minLength: 0)
    }
  }
}

/// "Next · 15:00 Sprint planning" under the large month grid.
private struct NextUpLine: View {
  let day: WidgetDay?
  let now: Date

  var body: some View {
    let next = day?.events.first { !$0.isPast(at: now) && !$0.allDay }

    if let next {
      Link(destination: DeepLink.day(day?.key ?? "")) {
        HStack(spacing: 6) {
          ColorMark(color: Color(hex: next.color), form: .dot).frame(width: 7, height: 7)
          Text(next.isHappening(at: now) ? "Now" : "Next")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(next.isHappening(at: now) ? Theme.now : Theme.accent)
          Text(next.title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
            .lineLimit(1)
          Spacer(minLength: 4)
          Text(next.startLabel)
            .font(.system(size: 11, weight: .medium).monospacedDigit())
            .foregroundStyle(Theme.textSecondary)
        }
        .padding(.horizontal, 10)
        .frame(height: 28)
        .background(SurfaceFill(color: Theme.surface, cornerRadius: Theme.controlRadius + 1))
      }
    } else {
      QuietNote(symbol: "sparkles", text: "Nothing else on today")
        .frame(height: 28)
    }
  }
}
