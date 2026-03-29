# Gemini CLI Scheduler Extension

An MCP extension for Gemini CLI that allows scheduling reminders and automated tasks.

## 🚀 Features

- **Flexible Scheduling:** Schedule messages for the future using `schedule_task`.
- **Integrated Wait:** Request the model to wait (block) until the task is completed to return the result immediately using `wait_for_completion`.
- **Local Persistence:** Tasks are saved to a `tasks.json` file in your current project's root, allowing for independent lists per workspace.
- **Autonomous Execution:** When the time is reached, the scheduler executes `gemini --prompt "your message"`, allowing the model to take actions and use other installed extensions.

## 📖 How to Use

### Schedule a Task

> Schedule a reminder for the 23rd at 8 AM with the message "Review scheduler code"

### Wait for Completion (Synchronous Execution)

> Schedule a task to "Run all tests" for in 2 minutes and wait for completion to report the result.

### List Tasks

> List all scheduled tasks in the scheduler

### Cancel a Task

> Cancel the task with ID 'abc1234'

### Monitoring and Decision Making

> Schedule a task to "Monitor google.com and report any downtime" to run in 1 minute, with `wait_for_completion` enabled.
