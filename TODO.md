# gemini-cli-scheduler - Action Plan

## 🎯 Objective

Professional MCP extension for autonomous task scheduling in Gemini CLI, with individual logs, execution history, and support for multiple executors (Gemini/Jules).

## 🛠️ Architecture (v0.8.0)

1. **Persistence:** Tasks saved to `tasks.json` in the extension's directory.
2. **Individual Logging:** Logs for each task saved to `logs/[taskName].log`.
3. **System Logging:** General server log in `scheduler.log`.
4. **Executors:** Support for `Gemini` (default) and `Jules` (specialized sub-agent).
5. **Status Tracking:** States `pending`, `completed`, `cancelled`, and `missed`.

## 📋 Completed Tasks

### Phase 1: Infrastructure and Configuration

- [x] Isolated persistence in the extension directory (`EXTENSION_DIR`).
- [x] Individual logging system for each task.
- [x] Data isolation: all files remain within the extension's folder.

### Phase 2: MCP Tools (v0.8.0)

- [x] **schedule_task**: Support for `monitor` (integrated wait) and `executor` (agent/model selection).
- [x] **list_tasks**: Displays complete history with status and log paths.
- [x] **cancel_task**: Support for cancelling pending tasks.
- [x] **monitor_task**: Intelligent real-time monitoring (waits for completion).
- [x] **check_task_results**: Reading logs of finished tasks.

### Phase 3: Execution Engine and Security

- [x] Headless execution via `spawn` with log redirection.
- [x] **Extension Control:** Automatic snapshotting of enabled extensions or explicit control.
- [x] **Restricted Mode by Default:** Tasks without extensions do not access external tools for security.
- [x] **Jules Integration:** Ability to delegate tasks to the specialized sub-agent.

## 🚀 Next Steps (Roadmap)

- [ ] **Automatic Cleanup:** Tool to clear old logs or completed tasks.
- [ ] **History Interface:** Improve the display of the completed task list.
- [ ] **Retry Logic:** Option to re-execute tasks that failed or were missed.
- [ ] **Listing Filters:** List only `completed` or `pending` tasks.
- [x] **Timezone Handling:** Improve automatic detection of local timezone.
