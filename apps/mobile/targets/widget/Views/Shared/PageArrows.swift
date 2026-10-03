import AppIntents
import SwiftUI

/// ‹ › for paging months or weeks in place, with a dot between them to jump
/// back once the view has left the current one.
struct PageArrows: View {
  let entry: CalendarEntry
  let canGoBack: Bool
  let canGoForward: Bool
  /// "month" or "week", for the accessibility labels.
  let unit: String

  var body: some View {
    HStack(spacing: 2) {
      arrow("chevron.left", delta: -1, enabled: canGoBack)
      if entry.pageOffset != 0 {
        Button(intent: ShiftPageIntent(delta: 0, mode: entry.mode, slot: entry.slot)) {
          Circle().fill(Theme.accent).frame(width: 6, height: 6)
            .frame(width: 18, height: 22)
        }
        .buttonStyle(.plain)
        .widgetAccentable()
        .accessibilityLabel("Back to this \(unit)")
      }
      arrow("chevron.right", delta: 1, enabled: canGoForward)
    }
    .fixedSize()
  }

  @ViewBuilder
  private func arrow(_ symbol: String, delta: Int, enabled: Bool) -> some View {
    let glyph = Image(systemName: symbol)
      .font(.system(size: 11, weight: .bold))
      .frame(width: 22, height: 22)
      .background(SurfaceFill(color: Theme.surface))

    if enabled {
      Button(intent: ShiftPageIntent(delta: delta, mode: entry.mode, slot: entry.slot)) {
        glyph.foregroundStyle(Theme.textSecondary)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(delta < 0 ? "Previous \(unit)" : "Next \(unit)")
    } else {
      glyph.foregroundStyle(Theme.textTertiary.opacity(0.4))
    }
  }
}
