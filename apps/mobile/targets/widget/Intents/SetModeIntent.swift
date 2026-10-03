import AppIntents

/// A segment of the view switcher at the top of the widget.
struct SetModeIntent: AppIntent {
  static let title: LocalizedStringResource = "Switch Calendar Widget View"
  static var isDiscoverable: Bool { false }

  @Parameter(title: "View")
  var mode: String

  /// Which widget is switching (`SharedStore.slot`).
  @Parameter(title: "Widget")
  var slot: String

  init() {}

  init(_ mode: WidgetMode, slot: String) {
    self.mode = mode.rawValue
    self.slot = slot
  }

  func perform() async throws -> some IntentResult {
    SharedStore.setMode(WidgetMode(rawValue: mode) ?? .today, slot: slot)
    return .result()
  }
}
