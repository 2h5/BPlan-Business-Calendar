import AppIntents

/// The checkbox on a task row.
///
/// The widget has no session and must not talk to the server, so the tick is
/// recorded in the shared App Group and drawn at once. The app sends it — via
/// the same mutation as an in-app tick — the next time it comes to the
/// foreground (`usePendingWidgetToggles`).
struct ToggleTaskIntent: AppIntent {
  static let title: LocalizedStringResource = "Complete Task"
  static var isDiscoverable: Bool { false }

  @Parameter(title: "Task")
  var taskId: String

  @Parameter(title: "Completed")
  var completed: Bool

  init() {}

  init(taskId: String, completed: Bool) {
    self.taskId = taskId
    self.completed = completed
  }

  func perform() async throws -> some IntentResult {
    SharedStore.recordToggle(taskId: taskId, completed: completed)
    return .result()
  }
}
