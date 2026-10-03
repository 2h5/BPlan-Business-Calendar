import SwiftUI

/// Shown before the app has written a snapshot, or after sign-out.
struct SignedOutView: View {
  var body: some View {
    VStack(spacing: 8) {
      Image(systemName: "calendar.badge.clock")
        .font(.system(size: 26, weight: .medium))
        .foregroundStyle(Theme.accent)
        .widgetAccentable()
      Text("Open BPlan to see your calendar")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Theme.textPrimary)
        .multilineTextAlignment(.center)
      Text("Your day and month will appear here.")
        .font(.system(size: 11))
        .foregroundStyle(Theme.textSecondary)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .widgetURL(DeepLink.today)
  }
}

/// A quiet line for a day or list with nothing in it.
struct QuietNote: View {
  let symbol: String
  let text: String

  var body: some View {
    HStack(spacing: 6) {
      Image(systemName: symbol)
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(Theme.accent)
        .widgetAccentable()
      Text(text)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(Theme.textSecondary)
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}
