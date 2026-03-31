# Gemini CLI Scheduler Extension

[![Version](https://img.shields.io/github/v/release/hermannhahn/gemini-cli-scheduler)](https://github.com/hermannhahn/gemini-cli-scheduler/releases)
[![License](https://img.shields.io/github/license/hermannhahn/gemini-cli-scheduler)](https://github.com/hermannhahn/gemini-cli-scheduler/blob/main/LICENSE)
[![GitHub Topics](https://img.shields.io/github/topics/hermannhahn/gemini-cli-scheduler)](https://github.com/hermannhahn/gemini-cli-scheduler/topics)

An MCP extension for Gemini CLI that provides a powerful task scheduler system.

## 🛠️ Professional Architecture

- **Modular TypeScript**: Built with strong typing for maximum reliability and ease of maintenance.
- **Optimized Bundling**: Uses `webpack` to generate a high-performance, self-contained `tool_code.js`.
- **Linting & Quality**: Enforced by `ESLint` and `TypeScript-ESLint` to maintain clean, idiomatic code.
- **Task Management**: Powered by the robust `node-schedule` library for precise cron-like or date-based execution.
- **Local Persistence**: Full state recovery across sessions via local JSON storage.

## 🚀 Features

- **Flexible Scheduling:** Schedule prompts or commands for the future using `schedule_task`.
- **Executor Selection:** Choose between `gemini` (standard), `jules` (complex tasks), or `shell` (direct commands).
- **Monitoring & Quotas:** Real-time task monitoring and Jules daily usage limits.
- **Autonomous Execution:** Tasks execute using the specified model and context, even when you're not interacting.

## 📋 Prerequisites

1. **Node.js 20+**
2. **npm**
3. **Git**

## 🔧 Installation and Setup

To set up the development environment:

```bash
npm install
npx webpack
```

### Installation in Gemini CLI

```bash
gemini extensions install https://github.com/hermannhahn/gemini-cli-scheduler.git
```

## 🛠️ Available Tools

- **`schedule_task`**: Schedule a task at a specific date/time or relative interval (e.g., "in 5 minutes").
- **`view_task_log`**: Read the execution results of a completed task.
- **`list_tasks`**: List all tasks (pending, completed, cancelled) and system status.
- **`get_system_time`**: Check current system time to coordinate scheduling.
- **`cancel_task`**: Cancel a pending task by its ID or Name.
- **`set_jules_limit`**: Configure the daily quota for the `jules` executor.

## 📖 Best Practices

- **Delegation**: Use `schedule_task` for background work. It runs independently.
- **Executor Choice**: Use `gemini` (fast), `jules` (complex tasks), or `shell` (simple OS commands).
- **Monitoring**: Set `wait_for_completion: false` for background tasks and check them later with `list_tasks`.

## 🤝 Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](./CONTRIBUTING.md) guide for instructions on our development workflow.

## 📜 License

This project is licensed under the **ISC License**. See the [LICENSE](./LICENSE) file for details.
