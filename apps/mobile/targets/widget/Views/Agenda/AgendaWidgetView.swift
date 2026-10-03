import SwiftUI
import WidgetKit

/// The Agenda face: what is coming up over the next two weeks, grouped by
/// day, skipping the empty ones — as much as the widget has room for.
struct AgendaWidgetView: View {
  let entry: CalendarEntry
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    let clock = WidgetClock(timeZoneIdentifier: snapshot.timeZone)
    let todayKey = clock.dayKey(for: entry.date)
    let compact = family == .systemMedium
    let plan = AgendaPlan.columns(
      days: snapshot.days(from: todayKey), now: entry.date, budgets: budgets)
    let columns = plan.columns

    VStack(alignment: .leading, spacing: compact ? 6 : 10) {
      StackedHeader(eyebrow: "Agenda", title: title(columns, todayKey: todayKey), compact: compact) {
        ModeSwitcher(entry: entry, compact: compact)
      }

      if columns.allSatisfy(\.isEmpty) {
        QuietNote(symbol: "sparkles", text: "Nothing in the next two weeks")
        Spacer(minLength: 0)
      } else {
        HStack(alignment: .top, spacing: 14) {
          ForEach(Array(columns.enumerated()), id: \.offset) { index, groups in
            column(
              groups, todayKey: todayKey, dense: compact,
              showsEnd: !plan.hasMore && index == columns.count - 1)
          }
        }
      }
    }
  }

  private func column(
    _ groups: [AgendaPlan.Group], todayKey: String, dense: Bool, showsEnd: Bool
  ) -> some View {
    VStack(alignment: .leading, spacing: dense ? 4 : 8) {
      ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
        if index > 0 {
          Rectangle().fill(Theme.border.opacity(0.8)).frame(height: 0.5)
            .padding(.leading, 40)
        }
        AgendaDaySection(
          group: group, isToday: group.day.key == todayKey, now: entry.date, dense: dense)
      }
      // Everything ahead fitted: say so, so the space after reads as an
      // empty fortnight rather than a widget that stopped drawing.
      if showsEnd {
        QuietNote(symbol: "checkmark.circle", text: "Clear for two weeks")
          .padding(.top, groups.isEmpty ? 4 : 2)
          .padding(.leading, groups.isEmpty ? 0 : 40)
      }
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// Room per column, in half-rows: an event takes two, each day after a
  /// column's first takes one. Medium splits into two columns side by side.
  private var budgets: [Int] {
    switch family {
    case .systemMedium: [6, 6]
    case .systemLarge: [17]
    default: [38]
    }
  }

  /// How far ahead the list reaches: "Today", or "Today – 7 October".
  private func title(_ columns: [[AgendaPlan.Group]], todayKey: String) -> String {
    guard let last = columns.last(where: { !$0.isEmpty })?.last?.day else {
      return "Next two weeks"
    }
    return last.key == todayKey ? "Today" : "Today – \(last.dateLabel)"
  }
}

/// One day of the agenda: a date column beside its events.
private struct AgendaDaySection: View {
  let group: AgendaPlan.Group
  let isToday: Bool
  let now: Date
  let dense: Bool

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      VStack(spacing: -1) {
        Text(String(group.day.weekday.prefix(3)).uppercased())
          .font(.system(size: 9, weight: .heavy))
          .tracking(0.5)
          .foregroundStyle(isToday ? Theme.accent : Theme.textTertiary)
        Text("\(group.day.dayNumber)")
          .font(.system(size: dense ? 17 : 20, weight: .bold).monospacedDigit())
          .foregroundStyle(isToday ? Theme.accent : Theme.textPrimary)
      }
      .widgetAccentable(isToday)
      .frame(width: 30)
      .padding(.top, dense ? 1 : 2)

      VStack(spacing: 0) {
        ForEach(group.events) { event in
          Link(destination: DeepLink.day(group.day.key)) {
            EventRow(event: event, now: now, dense: dense)
          }
        }
        if group.hidden > 0 {
          Text("+\(group.hidden) more")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(Theme.textTertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 11)
        }
      }
    }
  }
}

/// Picks what the agenda shows, filling each column's room day by day. A day
/// that does not fit carries on at the top of the next column; in the last
/// column it ends with "+n more".
enum AgendaPlan {
  struct Group: Identifiable {
    let day: WidgetDay
    let events: [WidgetEvent]
    /// Events on this day the widget had no room for.
    let hidden: Int
    var id: String { "\(day.key)-\(events.first?.id ?? "")" }
  }

  /// `hasMore` is false when every event ahead found a place.
  static func columns(days: ArraySlice<WidgetDay>, now: Date, budgets: [Int])
    -> (columns: [[Group]], hasMore: Bool)
  {
    // Today keeps only what has not finished yet; empty days are skipped.
    var queue: [(day: WidgetDay, events: [WidgetEvent])] = days.compactMap { day in
      let events = day.events.filter { !$0.isPast(at: now) }
      return events.isEmpty ? nil : (day, events)
    }
    var columns: [[Group]] = []
    var cutShort = false

    for (index, budget) in budgets.enumerated() {
      let isLast = index == budgets.count - 1
      var room = budget
      var groups: [Group] = []

      while let (day, events) = queue.first {
        let cost = groups.isEmpty ? 0 : 1
        let fits = (room - cost) / 2
        guard fits >= 1 else { break }

        var shown = min(events.count, fits)
        let cut = shown < events.count
        // The last column gives a row to "+n more" when it can spare one.
        if cut, isLast, shown > 1 { shown -= 1 }
        let hidden = cut && isLast ? events.count - shown : 0
        groups.append(Group(day: day, events: Array(events.prefix(shown)), hidden: hidden))
        room -= cost + shown * 2

        if cut {
          cutShort = cutShort || isLast
          if isLast { queue.removeFirst() } else { queue[0].events = Array(events.dropFirst(shown)) }
          break
        }
        queue.removeFirst()
      }
      columns.append(groups)
    }
    return (columns, cutShort || !queue.isEmpty)
  }
}
