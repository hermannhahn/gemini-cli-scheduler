import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { Task, ScheduleTaskArgs, SetJulesLimitArgs, CancelTaskArgs, ViewTaskLogArgs } from "./types";
import { LOGS_DIR } from "./constants";
import { tasks, config } from "./state";
import { logToFile, parseDateTime, detectEnabledExtensions } from "./utils";
import { loadTasks, loadConfig, saveTasks, saveConfig } from "./persistence";
import { getDailyJulesUsage, scheduleTask, waitForTaskCompletion, cancelTask } from "./scheduler";

const server = new Server(
	{
		name: "gemini-cli-scheduler",
		version: "0.8.42",
	},

	{
		capabilities: {
			tools: {},
		},
	},
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [
			{
				name: "schedule_task",
				description: `Schedule a task to be executed at a specific date and time.

MANDATORY: Use this tool ONLY to DELEGATE work to a separate process or a different agent.
- If you do NOT set 'wait_for_completion' to true, you will NOT see the results of this task in this conversation.

Use the 'executor' parameter to control which agent or model executes the task:
- **"jules"**: ONLY for extremely complex, multi-step engineering tasks (e.g., refactoring). DO NOT use for simple monitoring or scripts. Wastes daily quota.
- **"gemini"**: For simple, atomic tasks using the default system model.
- **"shell"**: For direct OS commands that don't need AI analysis.`,
				inputSchema: {
					type: "object",
					properties: {
						datetime: {
							type: "string",
							description:
								"Execution date/time. Supports: 'YYYY-MM-DD HH:mm:ss', 'HH:mm:ss' (for today), and relative intervals like 'in 5 minutes', 'in 1 hour', 'in 30 seconds'.",
						},
						message: {
							type: "string",
							description: "The prompt or command to execute.",
						},
						name: {
							type: "string",
							description: "Unique identifier for the task.",
						},
						extensions: {
							type: "array",
							items: { type: "string" },
							description:
								"Optional: Extensions to enable for this specific task execution.",
						},
						wait_for_completion: {
							type: "boolean",
							description:
								"MANDATORY TRUE if you need the task result to decide your next step NOW. If false, the task runs in the background and you won't see its output.",
							default: false,
						},
						executor: {
							type: "string",
							description:
								"Execution engine. 'jules' (complex/expensive), 'gemini' (simple/standard), 'shell' (direct command).",
							default: "gemini",
						},					},
						required: ["datetime", "message", "name"],
						},
						},
			{
				name: "view_task_log",
				description: "Read results from a completed task.",
				inputSchema: {
					type: "object",
					properties: {
						taskName: {
							type: "string",
							description: "Name of the task to view.",
						},
					},
					required: ["taskName"],
				},
			},
			{
				name: "list_tasks",
				description:
					"List all tasks with status and log info. Also returns current system time.",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
			{
				name: "get_system_time",
				description: "Returns the current system time.",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
			{
				name: "cancel_task",
				description: "Cancel a pending task.",
				inputSchema: {
					type: "object",
					properties: {
						idOrName: {
							type: "string",
							description: "ID or Name to cancel.",
						},
					},
					required: ["idOrName"],
				},
			},
			{
				name: "set_jules_limit",
				description:
					"Set the daily limit for Jules sub-agent usage. Useful for managing plan quotas.",
				inputSchema: {
					type: "object",
					properties: {
						limit: {
							type: "number",
							description: "New daily limit for Jules tasks.",
						},
					},
					required: ["limit"],
				},
			},
		],
	};
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	switch (name) {
		case "schedule_task": {
			let {
				datetime,
				message,
				name: taskName,
				extensions,
				wait_for_completion,
				executor,
			} = args as unknown as ScheduleTaskArgs;

			// Check daily limit if using Jules
			if (executor === "jules") {
				const executeAt = parseDateTime(datetime);
				const usage = getDailyJulesUsage(executeAt);
				if (usage >= config.julesDailyLimit) {
					return {
						content: [
							{
								type: "text",
								text: `Daily Jules limit reached (${config.julesDailyLimit}). You have already scheduled ${usage} Jules tasks for this day. Reduce the frequency or increase the limit using 'set_jules_limit'.`,
							},
						],
						isError: true,
					};
				}
			}

			const id = Math.random().toString(36).substring(2, 9);

			let taskExtensions = extensions;
			if (!Array.isArray(taskExtensions) || taskExtensions.length === 0) {
				taskExtensions = detectEnabledExtensions();
			}

			const task: Task = {
				id,
				datetime,
				message,
				name: taskName,
				status: "pending",
				logFile: path.join(LOGS_DIR, `${taskName}.log`),
				extensions: taskExtensions,
				executor: executor || "gemini",
			};

			tasks.push(task);
			saveTasks();
			scheduleTask(task);
			logToFile(
				`SYSTEM: Task "${task.name}" scheduled for ${datetime} (Executor: ${task.executor})`,
			);

			if (wait_for_completion) {
				const result = await waitForTaskCompletion(taskName, 600);
				if (result.success) {
					return {
						content: [
							{
								type: "text",
								text: `Task "${taskName}" completed by ${task.executor}.\n\nLogs:\n${result.logs}`,
							},
						],
					};
				} else {
					return {
						content: [
							{
								type: "text",
								text: result.error || "Unknown error",
							},
						],
						isError: true,
					};
				}
			}

			return {
				content: [
					{
						type: "text",
						text: `📅 Task "${taskName}" scheduled. Executor: ${task.executor}.`,
					},
				],
			};
		}
		case "set_jules_limit": {
			const { limit } = args as unknown as SetJulesLimitArgs;
			config.julesDailyLimit = limit;
			saveConfig();
			return {
				content: [
					{
						type: "text",
						text: `Daily Jules limit updated to ${limit}.`,
					},
				],
			};
		}
		case "list_tasks": {
			const now = new Date();
			const currentTime = now.toLocaleString("pt-BR", { hour12: false });
			const todayUsage = getDailyJulesUsage(now);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								systemTime: currentTime,
								julesQuota: {
									limit: config.julesDailyLimit,
									todayUsage: todayUsage,
									remaining: Math.max(
										0,
										config.julesDailyLimit - todayUsage,
									),
								},
								tasks,
							},
							null,
							2,
						),
					},
				],
			};
		}
		case "get_system_time": {
			return {
				content: [
					{
						type: "text",
						text: `🕒 ${new Date().toLocaleString()}`,
					},
				],
			};
		}
		case "cancel_task": {
			const { idOrName } = args as unknown as CancelTaskArgs;
			const cancelled = cancelTask(idOrName);
			if (cancelled) {
				return {
					content: [
						{ type: "text", text: `Task ${idOrName} cancelled.` },
					],
				};
			} else {
				return {
					content: [
						{
							type: "text",
							text: `Task ${idOrName} not found or already processed.`,
						},
					],
					isError: true,
				};
			}
		}

		case "view_task_log": {
			const { taskName } = args as unknown as ViewTaskLogArgs;
			const taskLogPath = path.join(LOGS_DIR, `${taskName}.log`);

			if (fs.existsSync(taskLogPath)) {
				const content = fs.readFileSync(taskLogPath, "utf8");
				return {
					content: [
						{
							type: "text",
							text: `Logs for task "${taskName}":\n\n${content}`,
						},
					],
				};
			} else {
				return {
					content: [
						{
							type: "text",
							text: `Log file for task "${taskName}" not found.`,
						},
					],
					isError: true,
				};
			}
		}
		default:
			throw new Error(`Tool not found: ${name}`);
	}
});

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	loadTasks();
	loadConfig();
	logToFile("SYSTEM: Gemini CLI Scheduler MCP server started.");
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
