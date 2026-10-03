import SwiftUI
import WidgetKit

/// One day's column on the Week grid: its timed events as blocks, side by
/// side where they overlap, and the "now" line when it is today.
struct WeekDayLane: View {
  let day: WidgetDay
  let window: HourWindow
  let isToday: Bool
  let isPast: Bool
  let now: Date
  let nowMinute: Int
  let detailed: Bool

  var body: some View {
    GeometryReader { geometry in
      let hourHeight = geometry.size.height / CGFloat(window.hours)
      let width = geometry.size.width

      ZStack(alignment: .topLeading) {
        if isToday {
          RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(Theme.accent.opacity(0.07))
        }

        ForEach(LaneLayout.place(day.events.filter { !$0.allDay && window.shows($0) })) { placed in
          let top = window.offset(of: placed.event.startMinute, hourHeight: hourHeight)
          let bottom = window.offset(of: placed.event.endMinute, hourHeight: hourHeight)
          let laneWidth = width / CGFloat(placed.lanes)
          let height = max(bottom - top - 1, 5)

          EventBlock(event: placed.event, height: height, detailed: detailed)
            .frame(width: max(laneWidth - 1, 3), height: height)
            .opacity(placed.event.isPast(at: now) && !isPast ? 0.5 : 1)
            .offset(x: laneWidth * CGFloat(placed.lane), y: top)
        }

        if isToday, (window.start * 60)...(window.end * 60) ~= nowMinute {
          NowLine()
            .frame(width: width)
            .offset(y: window.offset(of: nowMinute, hourHeight: hourHeight) - 2.5)
        }
      }
    }
    .opacity(isPast ? 0.45 : 1)
  }
}

/// An event on the grid: a wash of its colour with a solid edge, and the
/// title when there is room for a line of it.
private struct EventBlock: View {
  let event: WidgetEvent
  let height: CGFloat
  let detailed: Bool

  @Environment(\.widgetRenderingMode) private var renderingMode

  var body: some View {
    let color = Color(hex: event.color)

    ZStack(alignment: .topLeading) {
      if renderingMode == .fullColor {
        color.opacity(0.26)
      } else {
        SurfaceFill(color: .clear, cornerRadius: 0, glassOpacity: 0.18)
      }
      ColorMark(color: color, form: .bar).frame(width: 2)

      if height >= 9.5 {
        VStack(alignment: .leading, spacing: 0) {
          FadingText(text: event.title, size: 8)
          if height >= (detailed ? 20 : 26), !event.startLabel.isEmpty {
            FadingText(
              text: event.startLabel, size: 7, weight: .medium, color: Theme.textSecondary)
          }
        }
        .padding(.leading, 4)
        .padding(.top, height >= 12 ? 1.5 : 0)
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
  }
}

/// A dot and a hairline in the "now" colour.
private struct NowLine: View {
  var body: some View {
    HStack(spacing: 0) {
      Circle().fill(Theme.now).frame(width: 5, height: 5)
      Rectangle().fill(Theme.now).frame(height: 1.2)
    }
    .frame(height: 5)
  }
}

/// Side-by-side placement for overlapping events: each event takes the first
/// lane that is free when it starts, and everything in a run of overlaps
/// shares that run's lane count, so the blocks line up.
enum LaneLayout {
  struct Placed: Identifiable {
    let event: WidgetEvent
    let lane: Int
    var lanes: Int
    var id: String { event.id }
  }

  static func place(_ events: [WidgetEvent]) -> [Placed] {
    let sorted = events.sorted {
      ($0.startMinute, -$0.endMinute) < ($1.startMinute, -$1.endMinute)
    }
    var placed: [Placed] = []
    var run: [Int] = []  // indexes into `placed` for the current run
    var laneEnds: [Int] = []
    var runEnd = -1

    func closeRun() {
      for index in run { placed[index].lanes = laneEnds.count }
      run = []
      laneEnds = []
    }

    for event in sorted {
      // A short event still takes up a block's worth of height on screen.
      let end = max(event.endMinute, event.startMinute + 20)
      if event.startMinute >= runEnd { closeRun() }

      let lane = laneEnds.firstIndex { $0 <= event.startMinute } ?? laneEnds.count
      if lane == laneEnds.count { laneEnds.append(end) } else { laneEnds[lane] = end }
      placed.append(Placed(event: event, lane: lane, lanes: 1))
      run.append(placed.count - 1)
      runEnd = max(runEnd, end)
    }
    closeRun()
    return placed
  }
}
