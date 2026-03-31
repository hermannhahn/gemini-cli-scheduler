# Gemini CLI Scheduler Extension

An MCP extension for Gemini CLI that allows scheduling reminders and automated tasks.

## 🚀 Features

- **Flexible Scheduling:** Schedule prompts or commands for the future using `schedule_task`.
- **Executor Selection:** Choose between `gemini` (standard), `jules` (complex tasks), or `shell` (direct commands).
- **Monitoring & Quotas:** Real-time task monitoring and Jules daily usage limits.
- **Local Persistence:** Tasks and configuration are saved in the extension directory, ensuring persistence across sessions.
- **Autonomous Execution:** When the time is reached, the scheduler executes the task using the specified executor and enabled extensions.

## 🛠️ Available Tools

- **`schedule_task`**: Schedule a task at a specific date/time or relative interval.
- **`view_task_log`**: Read the execution logs and results of a completed task.
- **`list_tasks`**: List all tasks (pending, completed, cancelled) and view system status.
- **`get_system_time`**: Check the current system time to coordinate scheduling.
- **`cancel_task`**: Cancel a pending task by its ID or Name.
- **`set_jules_limit`**: Configure the daily quota for the `jules` executor.

## 📖 How to Use

### Schedule a Task

> Schedule a reminder for the 23rd at 8 AM with the message "Review scheduler code" using name "review_code"

### List Tasks

> List all scheduled tasks in the scheduler

### View Task Results

> View the results of the task "review_code" using view_task_log

### Cancel a Task

> Cancel the task with name "review_code"

## 💡 Best Practices

To use this extension efficiently and save resources, follow these guidelines:

### 1. Delegation
- **`schedule_task`**: Use this to **DELEGATE** work. It runs independently. Use it for long-running tasks or background jobs.

### 2. Choosing the Right Executor
- **`gemini` (Default)**: Best for most tasks. Fast and efficient.
- **`jules`**: ONLY for extremely complex, multi-step engineering tasks. It is expensive and has daily limits.
- **`shell`**: Best for simple scripts or OS commands that don't need AI analysis.

### 3. Monitoring
In `schedule_task`, set `wait_for_completion: true` only if you need the output **immediately** to continue the current conversation. Otherwise, let it run in the background.
