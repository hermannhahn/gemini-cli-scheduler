import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import {
	Task,
	ScheduleTaskArgs,
	SetJulesLimitArgs,
	CancelTaskArgs,
	ViewTaskLogArgs,
	ScheduleReminderArgs,
} from "./types";
import * as schedule from "node-schedule";
import {
	LOGS_DIR,
	DEFAULT_WAIT_FOR_COMPLETION_TIMEOUT,
} from "./constants";
import { tasks, config } from "./state";
import { logToFile, parseDateTime, detectEnabledExtensions } from "./utils";
import { loadTasks, loadConfig, saveTasks, saveConfig } from "./persistence";
import {
	getDailyJulesUsage,
	scheduleTask,
	waitForTaskCompletion,
	cancelTask,
} from "./scheduler";

const server = new Server(
	{
		name: "gemini-cli-scheduler",
		version: "1.0.5",
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
				description: "Schedule a task to be executed at a specific date and time. Use this tool ONLY to DELEGATE work to a separate process or a different agent.",
				inputSchema: {
					type: "object",
					properties: {
						datetime: {
							type: "string",
							description: "Execution date/time. Supports relative intervals like 'in 5 minutes'.",
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
							description: "Optional: Extensions to enable.",
						},
						wait_for_completion: {
							type: "boolean",
							description: "Set TRUE to wait for result. Max 5 minutes.",
							default: false,
						},
						executor: {
							type: "string",
							description: "Execution engine: 'jules', 'gemini', or 'shell'.",
							default: "gemini",
						},
					},
					required: ["datetime", "message", "name"],
				},
			},
			{
				name: "schedule_reminder",
				description: "Add a reminder. MANDATORY for delayed actions in a session to avoid timeout.",
				inputSchema: {
					type: "object",
					properties: {
						datetime: {
							type: "string",
							description: "When to remind (e.g., 'in 5 minutes', '14:30').",
						},
						message: {
							type: "string",
							description: "Message to receive upon reminder.",
						},
						targetTimestamp: {
							type: "number",
							description: "Internal use for fractional waiting.",
						},
						nonce: {
							type: "string",
							description: "Unique identifier for loop detection.",
						},
					},
					required: ["datetime", "message"],
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
				description: "List all tasks with status and log info.",
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
				description: "Set the daily limit for Jules sub-agent usage.",
				inputSchema: {
					type: "object",
					properties: {
						limit: {
							type: "number",
							description: "New daily limit.",
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
		case "schedule_reminder": {
			const { datetime, message, targetTimestamp, nonce } = args as unknown as ScheduleReminderArgs;
			try {
				const executeAt = targetTimestamp ? new Date(targetTimestamp) : parseDateTime(datetime);
				const now = new Date();
				const totalDelay = executeAt.getTime() - now.getTime();

				if (totalDelay <= 0) {
					return {
						content: [{ type: "text", text: `⚠️ Scheduled time passed: ${executeAt.toLocaleString("pt-BR", { hour12: false })}. REMINDER: ${message}` }],
					};
				}

				const MAX_WAIT_MS = 9 * 60 * 1000;
				const isFractional = totalDelay > MAX_WAIT_MS;
				const partialTarget = isFractional ? new Date(now.getTime() + MAX_WAIT_MS) : executeAt;

				await new Promise((resolve) => {
					console.error(`📅 Reminder scheduled: ${partialTarget.toLocaleString("pt-BR", { hour12: false })} (Target: ${executeAt.toLocaleString("pt-BR", { hour12: false })}, Nonce: ${nonce || "initial"})`);
					const heartbeat = setInterval(() => {
						console.error(`💓 Heartbeat: ${new Date().toLocaleString("pt-BR", { hour12: false })} - Waiting...
`);
					}, 60000);
					schedule.scheduleJob(partialTarget, () => {
						clearInterval(heartbeat);
						console.error(`🔔 Reminder triggered: ${new Date().toLocaleString("pt-BR", { hour12: false })}`);
						resolve(null);
					});
				});

				if (isFractional) {
					const remainingMs = executeAt.getTime() - new Date().getTime();
					const remainingMin = Math.round(remainingMs / 1000 / 60);
					const targetISO = executeAt.toISOString();
					const targetTs = executeAt.getTime();
					const newNonce = Math.random().toString(36).substring(7);

					const instructions = `MANDATORY: Call 'schedule_reminder' again IMMEDIATELY to resume waiting.
Use:
- datetime: "${targetISO}"
- message: "${message}"
- targetTimestamp: ${targetTs}
- nonce: "${newNonce}"`;

					return {
						content: [{ type: "text", text: `⏳ [CONTINUE_WAIT] | Remaining: ~${remainingMin} min | Target: ${targetISO}

🔄 [${Buffer.from(instructions).toString("base64")}]` }],
					};
				}

				return { content: [{ type: "text", text: `⏰ REMINDER: ${message}` }] };
			} catch (error) {
				return { content: [{ type: "text", text: `❌ Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
			}
		}
		case "schedule_task": {
			let { datetime, message, name: taskName, extensions, wait_for_completion, executor } = args as unknown as ScheduleTaskArgs;
			const executeAt = parseDateTime(datetime);

			if (wait_for_completion) {
				const now = new Date();
				const diffSeconds = (executeAt.getTime() - now.getTime()) / 1000;
				if (diffSeconds > DEFAULT_WAIT_FOR_COMPLETION_TIMEOUT) {
					return {
						content: [{ type: "text", text: `CRITICAL: 'wait_for_completion=true' not allowed for >5 minutes. Strategy: Use 'wait_for_completion=false' AND 'schedule_reminder'.` }],
						isError: true,
					};
				}
			}

			if (executor === "jules") {
				const usage = getDailyJulesUsage(executeAt);
				if (usage >= config.julesDailyLimit) {
					return {
						content: [{ type: "text", text: `Daily Jules limit reached (${config.julesDailyLimit}).` }],
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
			logToFile(`SYSTEM: Task "${task.name}" scheduled for ${datetime} (Executor: ${task.executor})`);

			if (wait_for_completion) {
				const result = await waitForTaskCompletion(taskName, DEFAULT_WAIT_FOR_COMPLETION_TIMEOUT);
				if (result.success) {
					return { content: [{ type: "text", text: `Task "${taskName}" completed by ${task.executor}.

Logs:
${result.logs}` }] };
				} else {
					return { content: [{ type: "text", text: result.error || "Unknown error" }], isError: true };
				}
			}

			return { content: [{ type: "text", text: `📅 Task "${taskName}" scheduled. Executor: ${task.executor}.` }] };
		}
		case "set_jules_limit": {
			const { limit } = args as unknown as SetJulesLimitArgs;
			config.julesDailyLimit = limit;
			saveConfig();
			return { content: [{ type: "text", text: `Daily Jules limit updated to ${limit}.` }] };
		}
		case "list_tasks": {
			const now = new Date();
			const currentTime = now.toLocaleString("pt-BR", { hour12: false });
			const todayUsage = getDailyJulesUsage(now);
			return { content: [{ type: "text", text: JSON.stringify({ systemTime: currentTime, julesQuota: { limit: config.julesDailyLimit, todayUsage: todayUsage, remaining: Math.max(0, config.julesDailyLimit - todayUsage) }, tasks }, null, 2) }] };
		}
		case "get_system_time": {
			return { content: [{ type: "text", text: `🕒 ${new Date().toLocaleString()}` }] };
		}
		case "cancel_task": {
			const { idOrName } = args as unknown as CancelTaskArgs;
			const cancelled = cancelTask(idOrName);
			if (cancelled) {
				return { content: [{ type: "text", text: `Task ${idOrName} cancelled.` }] };
			} else {
				return { content: [{ type: "text", text: `Task ${idOrName} not found.` }], isError: true };
			}
		}
		case "view_task_log": {
			const { taskName } = args as unknown as ViewTaskLogArgs;
			const taskLogPath = path.join(LOGS_DIR, `${taskName}.log`);
			if (fs.existsSync(taskLogPath)) {
				const content = fs.readFileSync(taskLogPath, "utf8");
				return { content: [{ type: "text", text: `Logs for "${taskName}":

${content}` }] };
			} else {
				return { content: [{ type: "text", text: `Log file for "${taskName}" not found.` }], isError: true };
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
