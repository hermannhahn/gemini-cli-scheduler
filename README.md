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
