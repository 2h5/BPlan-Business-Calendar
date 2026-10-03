import SwiftUI
import WidgetKit

/// The Today face. Medium puts the day's events beside its tasks; large and
/// up lead with an "up next" card, then the rest of the schedule and the
/// tasks, each with a working checkbox.
///
/// When today runs out, the room left over looks ahead — tomorrow first, then
/// the days after — so an evening glance is never a half-empty widget.
struct TodayWidgetView: View {
  let entry: CalendarEntry
  let snapshot: WidgetSnapshot
  let family: WidgetFamily

  var body: some View {
    let clock = WidgetClock(timeZoneIdentifier: snapshot.timeZone)

    if let day = snapshot.day(forKey: clock.dayKey(for: entry.date)) {
      switch family {
      case .systemMedium: medium(day: day)
      default: large(day: day)
      }
    } else {
      // The snapshot is a week old: there is nothing true left to show.
      SignedOutView()
    }
  }

  // MARK: Medium

  private func medium(day: WidgetDay) -> some View {
    let upcoming = day.events.filter { !$0.isPast(at: entry.date) }
    let tomorrow = followingDays(after: day).first

    return VStack(spacing: 8) {
      TodayHeader(day: day, entry: entry, openTasks: openTaskCount, compact: true)
      HStack(alignment: .top, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          if !upcoming.isEmpty {
            eventRows(Array(upcoming.prefix(3)), dayKey: day.key)
          } else if let tomorrow, !tomorrow.events.isEmpty {
            SectionLabel(text: "TOMORROW")
            eventRows(Array(tomorrow.events.prefix(2)), dayKey: tomorrow.key)
          } else {
            QuietNote(symbol: "sun.max", text: "Nothing coming up")
          }
          Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)

        taskList(limit: 3, dense: true)
          .frame(maxWidth: .infinity)
      }
    }
  }

  // MARK: Large and extra-large

  private func large(day: WidgetDay) -> some View {
    let now = entry.date
    let timed = day.events.filter { !$0.allDay }
    let next = timed.first { !$0.isPast(at: now) }
    let later =
      day.events.filter(\.allDay) + timed.filter { !$0.isPast(at: now) && $0.id != next?.id }

    // Rows that fit under the card, shared by every section; a section's
    // label costs one. Tasks keep up to three.
    let taskRows = max(1, min(snapshot.tasks.count, 3))
    var room = (family == .systemLarge ? 6 : 15) - taskRows - 1
    var sections: [DaySection] = []

    if !later.isEmpty, room >= 2 {
      let shown = Array(later.prefix(room - 1))
      sections.append(DaySection(title: "LATER TODAY", dayKey: day.key, events: shown))
      room -= shown.count + 1
    }
    for (index, ahead) in followingDays(after: day).enumerated() where !ahead.events.isEmpty {
      guard room >= 2 else { break }
      let shown = Array(ahead.events.prefix(room - 1))
      let title = index == 0 ? "TOMORROW" : "\(ahead.weekday.uppercased()) · \(ahead.dateLabel)"
      sections.append(DaySection(title: title, dayKey: ahead.key, events: shown))
      room -= shown.count + 1
    }

    return VStack(alignment: .leading, spacing: 10) {
      TodayHeader(day: day, entry: entry, openTasks: openTaskCount)
      UpNextCard(event: next, dayKey: day.key, now: now)

      ForEach(sections) { section in
        VStack(alignment: .leading, spacing: 2) {
          SectionLabel(text: section.title)
          eventRows(section.events, dayKey: section.dayKey)
        }
      }

      VStack(alignment: .leading, spacing: 2) {
        SectionLabel(text: "TASKS")
        taskList(limit: sections.isEmpty ? 5 : taskRows, dense: false)
      }
      Spacer(minLength: 0)
    }
  }

  private func eventRows(_ events: [WidgetEvent], dayKey: String) -> some View {
    ForEach(events) { event in
      Link(destination: DeepLink.day(dayKey)) {
        EventRow(event: event, now: entry.date, dense: true)
      }
    }
  }

  private func followingDays(after day: WidgetDay) -> ArraySlice<WidgetDay> {
    guard let index = snapshot.days.firstIndex(where: { $0.key == day.key }) else { return [] }
    return snapshot.days[(index + 1)...]
  }

  // MARK: Tasks

  private func completed(_ task: WidgetTask) -> Bool {
    entry.pendingCompletion[task.id] ?? task.completed
  }

  private var openTaskCount: Int {
    snapshot.tasks.filter { !completed($0) }.count + snapshot.moreTaskCount
  }

  private func taskList(limit: Int, dense: Bool) -> some View {
    let hidden = max(snapshot.tasks.count - limit, 0) + snapshot.moreTaskCount

    return VStack(alignment: .leading, spacing: 0) {
      if snapshot.tasks.isEmpty {
        QuietNote(symbol: "checkmark.circle", text: "All clear")
      }
      ForEach(snapshot.tasks.prefix(limit)) { task in
        TaskRow(task: task, completed: completed(task), dense: dense)
      }
      if hidden > 0 {
        Link(destination: DeepLink.tasks) {
          Text("+\(hidden) more")
            .font(.system(size: 10.5, weight: .semibold))
            .foregroundStyle(Theme.textTertiary)
            .padding(.leading, 30)
        }
      }
      Spacer(minLength: 0)
    }
  }
}

private struct DaySection: Identifiable {
  let title: String
  let dayKey: String
  let events: [WidgetEvent]

  var id: String { dayKey }
}

private struct SectionLabel: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 9, weight: .bold))
      .tracking(0.6)
      .foregroundStyle(Theme.textTertiary)
      .padding(.bottom, 2)
  }
}
