import AppIntents

/// The ‹ › arrows on the Month and Week views. A delta of zero returns to the
/// current month or week.
struct ShiftPageIntent: AppIntent {
  static let title: LocalizedStringResource = "Page Calendar Widget"
  static var isDiscoverable: Bool { false }

  @Parameter(title: "Pages")
  var delta: Int

  @Parameter(title: "View")
  var mode: String

  /// Which widget is paging (`SharedStore.slot`).
  @Parameter(title: "Widget")
  var slot: String

  init() {}

  init(delta: Int, mode: WidgetMode, slot: String) {
    self.delta = delta
    self.mode = mode.rawValue
    self.slot = slot
  }

  func perform() async throws -> some IntentResult {
    SharedStore.shiftPage(by: delta, mode: WidgetMode(rawValue: mode) ?? .month, slot: slot)
    return .result()
  }
}
