import AppIntents
import WidgetKit

/// The widget's settings, under Edit Widget: which view it opens on. The
/// switcher still moves between all of them; this is where it settles back.
struct CalendarWidgetIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "Calendar"
  static let description = IntentDescription("Choose the view this widget opens on.")

  @Parameter(title: "Default View", default: .today)
  var defaultView: WidgetMode

  init() {}

  init(defaultView: WidgetMode) {
    self.defaultView = defaultView
  }
}

extension WidgetMode: AppEnum {
  static var typeDisplayRepresentation: TypeDisplayRepresentation { "View" }

  static var caseDisplayRepresentations: [WidgetMode: DisplayRepresentation] {
    [
      .today: DisplayRepresentation(title: "Today", image: .init(systemName: "sun.max")),
      .week: DisplayRepresentation(title: "Week", image: .init(systemName: "rectangle.split.3x1")),
      .month: DisplayRepresentation(title: "Month", image: .init(systemName: "calendar")),
      .agenda: DisplayRepresentation(title: "Agenda", image: .init(systemName: "list.bullet")),
    ]
  }
}
