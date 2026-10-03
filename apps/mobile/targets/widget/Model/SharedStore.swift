import Foundation

/// The faces of the Calendar widget, in switcher order — the app's order:
/// day, week, month, agenda.
enum WidgetMode: String, CaseIterable {
  case today
  case week
  case month
  case agenda

  /// How far the ‹ › arrows can page: months either side, this week and the
  /// next. Today and Agenda do not page.
  var pageRange: ClosedRange<Int> {
    switch self {
    case .month: -1...3
    case .week: 0...1
    case .today, .agenda: 0...0
    }
  }
}

/// A task tick made on the Home Screen, waiting for the app to send it.
/// Mirrors `pendingTaskToggleSchema` in `src/features/widgets/schema.ts`.
struct PendingTaskToggle: Codable {
  let id: String
  let completed: Bool
  /// Epoch seconds.
  let at: Double
}

/// The widget's side of the App Group storage shared with the app.
///
/// Keys mirror `WIDGET_STORAGE_KEYS` in `src/features/widgets/constants.ts`.
/// The snapshot and its keys belong to the app; the view state below it
/// belongs to the widget alone.
enum SharedStore {
  static let appGroup = "group.com.example.calendarapp"

  private static let snapshotKey = "widget.snapshot"
  private static let pendingTogglesKey = "widget.pendingTaskToggles"

  /// A view switched to or paged and then left alone settles back on the
  /// widget's default view, so tomorrow's glance opens where the person chose
  /// in Edit Widget, not on whatever they last poked at.
  private static let viewLifetime: TimeInterval = 10 * 60

  private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  // MARK: Snapshot

  static func loadSnapshot() -> WidgetSnapshot? {
    guard let json = defaults?.string(forKey: snapshotKey),
      let data = json.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snapshot.version == WidgetSnapshot.supportedVersion
    else { return nil }
    return snapshot
  }

  // MARK: View state

  /// Which widget some view state belongs to. WidgetKit does not tell a
  /// button which widget it sits in, so widgets are told apart by what does
  /// differ: their default view and their size. Two identical widgets share
  /// state, which is harmless — they would show the same thing anyway.
  static func slot(home: WidgetMode, family: String) -> String {
    "\(home.rawValue).\(family)"
  }

  static func mode(slot: String, home: WidgetMode, at now: Date = Date()) -> WidgetMode {
    guard isFresh(slot: slot, at: now),
      let raw = defaults?.string(forKey: key(slot, "mode")),
      let mode = WidgetMode(rawValue: raw)
    else { return home }
    return mode
  }

  static func pageOffset(slot: String, at now: Date = Date()) -> Int {
    guard isFresh(slot: slot, at: now) else { return 0 }
    return defaults?.integer(forKey: key(slot, "page")) ?? 0
  }

  /// Switching view starts it on the current month or week.
  static func setMode(_ mode: WidgetMode, slot: String, at now: Date = Date()) {
    defaults?.set(mode.rawValue, forKey: key(slot, "mode"))
    defaults?.set(0, forKey: key(slot, "page"))
    defaults?.set(now, forKey: key(slot, "touchedAt"))
  }

  /// `delta` of zero jumps back to the current month or week. Keeps the view
  /// showing, so a page turn also renews its stay.
  static func shiftPage(by delta: Int, mode: WidgetMode, slot: String, at now: Date = Date()) {
    let next = delta == 0 ? 0 : pageOffset(slot: slot, at: now) + delta
    let range = mode.pageRange
    defaults?.set(mode.rawValue, forKey: key(slot, "mode"))
    defaults?.set(min(max(next, range.lowerBound), range.upperBound), forKey: key(slot, "page"))
    defaults?.set(now, forKey: key(slot, "touchedAt"))
  }

  private static func isFresh(slot: String, at now: Date) -> Bool {
    guard let touched = defaults?.object(forKey: key(slot, "touchedAt")) as? Date else {
      return false
    }
    return now.timeIntervalSince(touched) < viewLifetime
  }

  private static func key(_ slot: String, _ name: String) -> String {
    "widget.view.\(slot).\(name)"
  }

  // MARK: Pending task ticks

  static func pendingToggles() -> [PendingTaskToggle] {
    guard let json = defaults?.string(forKey: pendingTogglesKey),
      let data = json.data(using: .utf8),
      let toggles = try? JSONDecoder().decode([PendingTaskToggle].self, from: data)
    else { return [] }
    return toggles
  }

  /// The latest tick per task, for drawing a checkbox before the app has sent it.
  static func pendingCompletion() -> [String: Bool] {
    var latest: [String: Bool] = [:]
    for toggle in pendingToggles() { latest[toggle.id] = toggle.completed }
    return latest
  }

  /// Records a tick. One entry per task: a later tick replaces an earlier one.
  static func recordToggle(taskId: String, completed: Bool) {
    var toggles = pendingToggles().filter { $0.id != taskId }
    toggles.append(
      PendingTaskToggle(id: taskId, completed: completed, at: Date().timeIntervalSince1970))
    guard let data = try? JSONEncoder().encode(toggles),
      let json = String(data: data, encoding: .utf8)
    else { return }
    defaults?.set(json, forKey: pendingTogglesKey)
  }
}
