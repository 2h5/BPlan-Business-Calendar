import SwiftUI

/// The six-week month grid. Every day is a link that opens it in the app.
struct MonthGrid: View {
  enum Style {
    /// Medium widget: numbers and a single busy dot.
    case compact
    /// Large widget: numbers and up to three colour dots.
    case regular
    /// Extra-large widget: numbers and the first event titles as chips.
    case expanded
  }

  let month: WidgetMonth
  let weekdayLabels: [String]
  let todayKey: String
  let style: Style

  /// The medium widget has no height to spare, so it drops a final week that
  /// lies wholly in the next month; the larger grids keep all six.
  private var weeks: [[WidgetMonthCell]] {
    guard style == .compact else { return month.weeks }
    return month.weeks.filter { week in week.contains(where: \.inMonth) }
  }

  var body: some View {
    VStack(spacing: style == .compact ? 1 : 2) {
      HStack(spacing: style == .expanded ? 3 : 0) {
        ForEach(Array(weekdayLabels.enumerated()), id: \.offset) { _, label in
          Text(label)
            .font(.system(size: style == .compact ? 8.5 : 10, weight: .semibold))
            .foregroundStyle(Theme.textTertiary)
            // Expanded cells lead with their number, so the initials sit over it.
            .frame(width: style == .expanded ? 22 : nil)
            .frame(maxWidth: .infinity, alignment: style == .expanded ? .leading : .center)
        }
      }
      .padding(.bottom, style == .compact ? 1 : 3)

      ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
        HStack(spacing: style == .expanded ? 3 : 0) {
          ForEach(week) { cell in
            Link(destination: DeepLink.day(cell.key)) {
              MonthCell(
                cell: cell, isToday: cell.key == todayKey, style: style, tight: weeks.count > 5)
            }
          }
        }
        .frame(maxHeight: .infinity)
      }
    }
  }
}

private struct MonthCell: View {
  let cell: WidgetMonthCell
  let isToday: Bool
  let style: MonthGrid.Style
  /// Six weeks in the medium grid: shave the cell a little more.
  var tight = false

  var body: some View {
    Group {
      switch style {
      case .compact, .regular: numberAndDots
      case .expanded: numberAndChips
      }
    }
    .frame(
      maxWidth: .infinity, maxHeight: .infinity,
      alignment: style == .expanded ? .topLeading : .center
    )
    .opacity(cell.inMonth ? 1 : 0.35)
  }

  private var numberSize: CGFloat { style == .compact ? 9.5 : 12 }
  private var badgeSize: CGFloat { style == .compact ? (tight ? 12.5 : 14) : 22 }

  private var number: some View {
    Text("\(cell.day)")
      .font(.system(size: numberSize, weight: isToday ? .bold : .medium).monospacedDigit())
      .foregroundStyle(isToday ? Theme.onAccent : Theme.textPrimary)
      .frame(width: badgeSize, height: badgeSize)
      .background {
        if isToday {
          SurfaceFill(
            color: Theme.accent, cornerRadius: style == .compact ? 4 : 6, glassOpacity: 0.32)
        }
      }
      .widgetAccentable(isToday)
  }

  private var numberAndDots: some View {
    VStack(spacing: style == .compact ? 0.5 : 2) {
      number
      HStack(spacing: 2) {
        ForEach(Array(dotColors.enumerated()), id: \.offset) { _, color in
          ColorMark(color: Color(hex: color), form: .dot)
            .frame(width: dotSize, height: dotSize)
        }
      }
      .frame(height: dotSize)
    }
  }

  private var dotSize: CGFloat { style == .compact ? (tight ? 2.5 : 3) : 4 }

  /// The medium grid has room for one dot; it just says "something's on".
  private var dotColors: [String] {
    style == .compact ? Array(cell.colors.prefix(1)) : cell.colors
  }

  private var numberAndChips: some View {
    VStack(alignment: .leading, spacing: 2) {
      number
      ForEach(Array(cell.chips.enumerated()), id: \.offset) { _, chip in
        Text(chip.title)
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(Theme.textPrimary)
          .lineLimit(1)
          .padding(.horizontal, 3)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(
            RoundedRectangle(cornerRadius: 3, style: .continuous)
              .fill(Color(hex: chip.color).opacity(0.22))
          )
      }
      if cell.count > cell.chips.count {
        Text("+\(cell.count - cell.chips.count)")
          .font(.system(size: 8.5, weight: .semibold))
          .foregroundStyle(Theme.textTertiary)
      }
      Spacer(minLength: 0)
    }
  }
}
