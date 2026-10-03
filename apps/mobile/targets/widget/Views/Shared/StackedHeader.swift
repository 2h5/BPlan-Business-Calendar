import SwiftUI

/// The two-line header the Today, Week, and Agenda views share: a small
/// accent eyebrow over a bold title, with controls on the right.
struct StackedHeader<Trailing: View>: View {
  let eyebrow: String
  let title: String
  var compact = false
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(alignment: .center, spacing: 8) {
      VStack(alignment: .leading, spacing: 0) {
        Text(eyebrow.uppercased())
          .font(.system(size: 9.5, weight: .heavy))
          .tracking(0.8)
          .foregroundStyle(Theme.accent)
          .widgetAccentable()
          .lineLimit(1)
        Text(title)
          .font(.system(size: compact ? 15 : 17, weight: .bold))
          .foregroundStyle(Theme.textPrimary)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
      }
      // The title keeps its width before the spacer gives way.
      .layoutPriority(1)

      Spacer(minLength: 4)
      trailing()
    }
  }
}
