import Foundation

/// URLs into the app (scheme `calendarapp` in app.json). Each one lands on a
/// route that already reads the parameter.
enum DeepLink {
  static let today = URL(string: "calendarapp://today")!
  static let tasks = URL(string: "calendarapp://tasks")!

  /// Opens the calendar's day view (`useFocusDateFromParam`).
  static func day(_ dateKey: String) -> URL {
    URL(string: "calendarapp://calendar?date=\(dateKey)") ?? today
  }

  /// Opens the task editor (`useOpenTaskFromParam`).
  static func task(_ id: String) -> URL {
    URL(string: "calendarapp://tasks?taskId=\(id)") ?? today
  }
}
