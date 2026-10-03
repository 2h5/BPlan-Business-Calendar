import AppIntents
import SwiftUI

/// The Today / Week / Month / Agenda switcher. Each segment is a button that
/// runs `SetModeIntent`; WidgetKit redraws the widget when it returns.
///
/// Icons only: the header's title already names the view, and four labels
/// would crowd out a long month name. Rounded-rect track and thumb like the
/// app's calendar view switcher — deliberately not capsules.
struct ModeSwitcher: View {
  let entry: CalendarEntry
  /// The medium widget's slightly smaller segments.
  var compact = false

  var body: some View {
    HStack(spacing: 1) {
      ForEach(WidgetMode.allCases, id: \.self) { mode in
        segment(mode)
      }
    }
    .padding(2)
    .background(SurfaceFill(color: Theme.surface))
    // The switcher keeps its size; the title beside it gives way instead.
    .fixedSize()
  }

  private func segment(_ target: WidgetMode) -> some View {
    let selected = target == entry.mode
    return Button(intent: SetModeIntent(target, slot: entry.slot)) {
      Image(systemName: selected ? target.selectedSymbol : target.symbol)
        .font(.system(size: compact ? 9.5 : 10.5, weight: .semibold))
        .foregroundStyle(selected ? Theme.accent : Theme.textTertiary)
        .widgetAccentable(selected)
        .frame(width: compact ? 23 : 26, height: compact ? 20 : 22)
        .background {
          if selected {
            SurfaceFill(
              color: Theme.surfaceRaised, cornerRadius: Theme.controlRadius - 2,
              glassOpacity: 0.3
            )
            .shadow(color: .black.opacity(0.1), radius: 1.5, y: 0.5)
          }
        }
    }
    .buttonStyle(.plain)
    .accessibilityLabel(target.title)
  }
}

extension WidgetMode {
  var title: String {
    switch self {
    case .month: "Month"
    case .week: "Week"
    case .today: "Today"
    case .agenda: "Agenda"
    }
  }

  var symbol: String {
    switch self {
    case .month: "calendar"
    case .week: "rectangle.split.3x1"
    case .today: "sun.max"
    case .agenda: "list.bullet"
    }
  }

  var selectedSymbol: String {
    switch self {
    case .month: "calendar"
    case .week: "rectangle.split.3x1.fill"
    case .today: "sun.max.fill"
    case .agenda: "list.bullet"
    }
  }
}
