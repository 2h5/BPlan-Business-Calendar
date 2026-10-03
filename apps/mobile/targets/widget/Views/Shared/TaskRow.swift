import AppIntents
import SwiftUI

/// A task with a working checkbox. The box runs `ToggleTaskIntent`; the title
/// opens the task in the app.
struct TaskRow: View {
  let task: WidgetTask
  let completed: Bool
  var dense = false

  var body: some View {
    HStack(spacing: 8) {
      Button(intent: ToggleTaskIntent(taskId: task.id, completed: !completed)) {
        checkbox
      }
      .buttonStyle(.plain)
      .accessibilityLabel(completed ? "Mark \(task.title) not done" : "Complete \(task.title)")

      Link(destination: DeepLink.task(task.id)) {
        HStack(spacing: 4) {
          Text(task.title)
            .font(.system(size: dense ? 12 : 13, weight: .medium))
            .foregroundStyle(completed ? Theme.textTertiary : Theme.textPrimary)
            .strikethrough(completed, color: Theme.textTertiary)
            .lineLimit(1)
          Spacer(minLength: 4)
          trailing
        }
      }
    }
    .frame(height: dense ? 24 : 28)
  }

  private var checkbox: some View {
    ZStack {
      RoundedRectangle(cornerRadius: 5, style: .continuous)
        .strokeBorder(completed ? Theme.accent : boxColor, lineWidth: 1.5)
        .background {
          if completed { SurfaceFill(color: Theme.accent, cornerRadius: 5, glassOpacity: 0.35) }
        }
      if completed {
        Image(systemName: "checkmark")
          .font(.system(size: 9, weight: .heavy))
          .foregroundStyle(Theme.onAccent)
      }
    }
    .frame(width: 17, height: 17)
    .widgetAccentable()
    // A bigger target than the box itself; fingers are not 17 points wide.
    .frame(width: 22, height: 24)
    .contentShape(Rectangle())
  }

  private var boxColor: Color {
    if task.overdue { return Theme.now }
    return task.flagged ? Theme.warning : Theme.textTertiary
  }

  @ViewBuilder private var trailing: some View {
    if completed {
      EmptyView()
    } else if task.overdue && !dense {
      // Dense rows let the red box say it; the title needs the room.
      Text("Overdue")
        .font(.system(size: 10, weight: .semibold))
        .foregroundStyle(Theme.now)
    } else if let due = task.dueLabel {
      Text(due)
        .font(.system(size: 10.5, weight: .medium).monospacedDigit())
        .foregroundStyle(Theme.textTertiary)
    } else if task.flagged {
      Image(systemName: "flag.fill")
        .font(.system(size: 9))
        .foregroundStyle(Theme.warning)
    }
  }
}
