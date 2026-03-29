# Gemini CLI Scheduler Extension

An MCP extension for Gemini CLI that allows scheduling reminders and automated tasks.

## 🚀 Features

- **Flexible Scheduling:** Schedule messages for the future using `schedule_task`.
- **Continuous Monitoring:** Request continuous monitoring to await the result of the scheduled task.
- **Local Persistence:** Tasks are saved to a `tasks.json` file in your current project's root, allowing for independent lists per workspace.
- **Autonomous Execution:** When the time is reached, the scheduler executes `gemini --prompt "your message"`, allowing the model to take actions and use other installed extensions.

## 📖 How to Use

### Schedule a Task

> Schedule a reminder for the 23rd at 8 AM with the message "Review scheduler code"

### List Tasks

> List all scheduled tasks in the scheduler

### Cancel a Task

> Cancel the task with ID 'abc1234'

### Monitoring and Decision Making

> Monitor google.com every 5 minutes and report any downtime.

## 💡 Best Practices

To use this extension efficiently and save resources, follow these guidelines:

### 1. Tasks
- **`schedule_task`**: Use this to **DELEGATE** work to someone else. It runs independently. Use it for long-running tasks, background jobs, or when you don't need to stay "awake" waiting for the result.

### 2. Choosing the Right Executor
When using `schedule_task`, choose the `executor` wisely:
- **`gemini` (Default)**: Best for most tasks. Fast and efficient.
- **`jules`**: ONLY for complex, multi-step engineering tasks (e.g., "Refactor this entire module"). It is expensive and has daily limits.
- **`shell`**: Best for simple scripts or commands that don't need AI analysis (e.g., `npm run build`).

### 3. Continuity with `wait_for_completion`
In `schedule_task`, set `wait_for_completion: true` only if the current agent needs the output of that task to decide the very next step in the same conversation. Otherwise, let it run in the background and check the logs later with `view_task_log`.
