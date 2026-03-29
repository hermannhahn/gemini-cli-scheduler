import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import os from "os";
import schedule from "node-schedule";
import { spawn, execSync } from "child_process";

// Persistent directory for all users/environments
const HOME_DIR = os.homedir();
const PERSISTENT_GEMINI_DIR = path.join(HOME_DIR, ".gemini", "extensions", "gemini-cli-scheduler");
const PERSISTENCE_PATH = process.env.SCHEDULER_PATH || path.join(PERSISTENT_GEMINI_DIR, "tasks.json");
const LOGS_DIR = path.join(PERSISTENT_GEMINI_DIR, "logs");
const SYSTEM_LOG_PATH = path.join(PERSISTENT_GEMINI_DIR, "scheduler.log");
const CONFIG_PATH = path.join(PERSISTENT_GEMINI_DIR, "config.json");

// Ensure the persistent directory and logs directory exist
if (!fs.existsSync(LOGS_DIR)) {
	fs.mkdirSync(LOGS_DIR, { recursive: true });
}

interface Task {
	id: string;
	datetime: string;
	message: string;
	name: string;
	status: "pending" | "completed" | "missed" | "cancelled";
	logFile: string;
	extensions: string[];
	useJules: boolean;
}

interface Config {
	julesDailyLimit: number;
}

let tasks: Task[] = [];
let config: Config = { julesDailyLimit: 50 };
const activeJobs = new Map<string, schedule.Job>();

function logToFile(message: string, specificLogPath = SYSTEM_LOG_PATH) {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}\n`;
	fs.appendFileSync(specificLogPath, logMessage);
}

function loadConfig() {
	if (fs.existsSync(CONFIG_PATH)) {
		try {
			const data = fs.readFileSync(CONFIG_PATH, "utf8");
			config = JSON.parse(data);
		} catch (e) {
			console.error("Error loading config:", e);
		}
	} else {
		saveConfig();
	}
}

function saveConfig() {
	try {
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
	} catch (e) {
		console.error("Error saving config:", e);
	}
}

function getDailyJulesUsage(executeAt: Date): number {
	const dateString = executeAt.toISOString().split("T")[0];
	return tasks.filter((t) => {
		if (!t.useJules) return false;
		// Check if the task is scheduled for the same day
		const taskDate = new Date(t.datetime).toISOString().split("T")[0];
		return taskDate === dateString && t.status !== "cancelled";
	}).length;
}

function detectEnabledExtensions(): string[] {
	try {
		const output = execSync("gemini extensions list", { encoding: "utf8" });
		const sections = output.split("✓ ");
		const enabledExtensions: string[] = [];

		for (const section of sections) {
			if (!section.trim()) continue;

			const lines = section.split("\n");
			const firstLine = lines[0].trim();
			const nameMatch = firstLine.match(/^([^\s(]+)/);
			if (!nameMatch) continue;

			const extName = nameMatch[1];

			const isEnabled =
				section.includes("Enabled (User): true") ||
				section.includes("Enabled (Workspace): true");

			if (isEnabled && extName !== "gemini-cli-scheduler") {
				enabledExtensions.push(extName);
			}
		}
		return enabledExtensions;
	} catch (e) {
		console.error("Error detecting extensions:", e);
		return [];
	}
}

function loadTasks() {
	if (fs.existsSync(PERSISTENCE_PATH)) {
		try {
			const data = fs.readFileSync(PERSISTENCE_PATH, "utf8");
			tasks = JSON.parse(data);
			const now = new Date();

			tasks.forEach((task) => {
				if (task.status === "pending") {
					const executeAt = new Date(task.datetime);
					if (executeAt > now) {
						scheduleTask(task);
					} else {
						task.status = "missed";
					}
				}
			});
			saveTasks();
		} catch (e) {
			console.error("Error loading tasks:", e);
		}
	}
}

function saveTasks() {
	try {
		fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(tasks, null, 2));
	} catch (e) {
		console.error("Error saving tasks:", e);
	}
}

function scheduleTask(task: Task) {
	let executeAt = new Date(task.datetime);

	// If datetime is just HH:mm:ss, assume today at that time
	if (task.datetime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
		const [hours, minutes, seconds] = task.datetime.split(":").map(Number);
		executeAt = new Date();
		executeAt.setHours(hours || 0, minutes || 0, seconds || 0, 0);
	}

	const now = new Date();
	if (isNaN(executeAt.getTime()) || executeAt <= now) {
		logToFile(
			`SYSTEM: Skipping task "${task.name}" because it is invalid or in the past (Scheduled: ${task.datetime}, System Now: ${now.toISOString()}).`,
		);
		task.status = "missed";
		saveTasks();
		return;
	}

	logToFile(`SYSTEM: Scheduling task "${task.name}" for ${executeAt.toISOString()} (Local: ${executeAt.toLocaleString()})`);

	const job = schedule.scheduleJob(executeAt, function () {
		logToFile(`SYSTEM: Starting task "${task.name}"`);
		executeHeadless(task);
		activeJobs.delete(task.id);
	});

	if (job) {
		activeJobs.set(task.id, job);
	}
}

function executeHeadless(task: Task) {
	const taskLogPath = path.join(LOGS_DIR, `${task.name}.log`);
	task.logFile = taskLogPath;
	const logStream = fs.createWriteStream(taskLogPath, { flags: "w" });
	const timestamp = new Date().toISOString();

	logStream.write(`--- START TASK: ${task.name} (${timestamp}) ---
`);

	let finalPrompt = task.message;
	const finalExtensions = task.extensions || [];

	if (task.useJules) {
		logStream.write(`Executor: Jules (Sub-agent)
`);
		finalPrompt = `Act as the Jules sub-agent and execute the following task: ${task.message}`;
		if (!finalExtensions.includes("gemini-cli-jules")) {
			finalExtensions.push("gemini-cli-jules");
		}
	} else {
		logStream.write(`Executor: Gemini (Standard)
`);
	}

	logStream.write(`Prompt: ${finalPrompt}
`);

	if (finalExtensions.length > 0) {
		logStream.write(
			`Enabled Extensions: ${finalExtensions.join(", ")}\n\n`,
		);
	} else {
		logStream.write(`Enabled Extensions: NONE (Restricted mode)\n\n`);
	}

	const args = ["--yolo"];

	if (finalExtensions.length > 0) {
		finalExtensions.forEach((ext) => {
			args.push("-e", ext);
		});
	} else {
		args.push("-e", "none_active");
	}

	args.push("--prompt", finalPrompt);

	const child = spawn("gemini", args);

	child.stdout.on("data", (data) => {
		logStream.write(data);
	});

	child.stderr.on("data", (data) => {
		logStream.write(`[STDERR] ${data}`);
	});

	child.on("close", (code) => {
		const endTimestamp = new Date().toISOString();
		logStream.write(
			`
--- END TASK: ${task.name} (Exit Code: ${code}) at ${endTimestamp} ---
`,
		);
		logStream.end();

		task.status = "completed";
		saveTasks();
		logToFile(`SYSTEM: Task "${task.name}" completed with code ${code}.`);
	});
}

async function waitForTaskCompletion(taskName: string, timeout: number): Promise<{ success: boolean; logs?: string; error?: string }> {
	const taskLogPath = path.join(LOGS_DIR, `${taskName}.log`);
	const endMarker = `--- END TASK: ${taskName}`;

	return new Promise((resolve) => {
		const checkInterval = setInterval(() => {
			if (fs.existsSync(taskLogPath)) {
				clearInterval(checkInterval);
				startWatching();
			}
		}, 500);

		function startWatching() {
			let lastSize = 0;
			let accumulatedLogs = "";
			let timeoutId: NodeJS.Timeout;

			const watcher = fs.watch(taskLogPath, (eventType) => {
				if (eventType === "change") {
					const stats = fs.statSync(taskLogPath);
					const fd = fs.openSync(taskLogPath, "r");
					const bufferSize = stats.size - lastSize;
					if (bufferSize <= 0) {
						fs.closeSync(fd);
						return;
					}

					const buffer = Buffer.alloc(bufferSize);
					fs.readSync(fd, buffer, 0, bufferSize, lastSize);
					fs.closeSync(fd);

					const newContent = buffer.toString();
					accumulatedLogs += newContent;
					lastSize = stats.size;

					if (newContent.includes(endMarker)) {
						clearTimeout(timeoutId);
						watcher.close();
						resolve({
							success: true,
							logs: accumulatedLogs,
						});
					}
				}
			});

			timeoutId = setTimeout(() => {
				watcher.close();
				resolve({
					success: false,
					error: `TIMEOUT: Task "${taskName}" did not complete within ${timeout} seconds.`,
				});
			}, timeout * 1000);
		}
	});
}

function cancelTask(idOrName: string) {
	const taskIndex = tasks.findIndex(
		(t) => t.id === idOrName || t.name === idOrName,
	);
	if (taskIndex !== -1) {
		const task = tasks[taskIndex];
		if (task.status === "pending") {
			const job = activeJobs.get(task.id);
			if (job) {
				job.cancel();
				activeJobs.delete(task.id);
			}
			task.status = "cancelled";
			saveTasks();
			logToFile(`SYSTEM: Task "${task.name}" cancelled.`);
			return true;
		}
	}
	return false;
}

const server = new Server(
	{
		name: "gemini-cli-scheduler",
		version: "0.8.19",
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
				description:
					`Schedule a task to be executed at a specific date and time.

Use the 'useJules' parameter to control which agent executes the task.

- **Gemini (useJules: false, default):** For simple, atomic tasks. Examples: running a single command ('git pull'), reading/writing a file, or tasks with low-volume output.
- **Jules (useJules: true):** For complex, multi-step tasks. Examples: code refactoring, bug investigation, running builds, tests, or linters that produce high-volume output.`,
				inputSchema: {
					type: "object",
					properties: {
						datetime: {
							type: "string",
							description: "Date/time for execution.",
						},
						message: {
							type: "string",
							description: "Prompt to execute.",
						},
						name: {
							type: "string",
							description: "Unique name for the task.",
						},
						extensions: {
							type: "array",
							items: { type: "string" },
							description:
								"Optional: List of extensions to include.",
						},
						monitor: {
							type: "boolean",
							description:
								"If true, wait for task completion and return logs.",
							default: false,
						},
						useJules: {
							type: "boolean",
							description:
								"If true, the task will be executed by the Jules sub-agent.",
							default: false,
						},
					},
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
				description: "List all tasks with status and log info. Also returns current system time.",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
			{
				name: "get_system_time",
				description: "Returns the current system time in YYYY-MM-DD HH:MM:SS format.",
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
				description: "Set the daily limit for Jules sub-agent usage. Useful for managing plan quotas.",
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

interface ScheduleTaskArgs {
	datetime: string;
	message: string;
	name: string;
	extensions?: string[];
	monitor?: boolean;
	useJules?: boolean;
}

interface SetJulesLimitArgs {
	limit: number;
}

interface CancelTaskArgs {
	idOrName: string;
}

interface ViewTaskLogArgs {
	taskName: string;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
	const { name, arguments: args } = request.params;

	switch (name) {
		case "schedule_task": {
			const {
				datetime,
				message,
				name: taskName,
				extensions,
				monitor,
				useJules,
			} = args as unknown as ScheduleTaskArgs;

			// Check daily limit if using Jules
			if (useJules) {
				let executeAt = new Date(datetime);
				if (datetime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
					executeAt = new Date();
				}
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
				useJules: useJules || false,
			};

			tasks.push(task);
			saveTasks();
			scheduleTask(task);
			logToFile(`SYSTEM: Task "${task.name}" scheduled for ${datetime} (Jules: ${task.useJules})`);

			if (monitor) {
				const result = await waitForTaskCompletion(taskName, 600);
				if (result.success) {
					return {
						content: [
							{
								type: "text",
								text: `Task "${taskName}" completed by ${task.useJules ? "Jules" : "Gemini"}.

Logs:
${result.logs}`,
							},
						],
					};
				} else {
					return {
						content: [{ type: "text", text: result.error || "Unknown error" }],
						isError: true,
					};
				}
			}

			return {
				content: [
					{
						type: "text",
						text: `Task "${taskName}" scheduled. Executor: ${task.useJules ? "Jules" : "Gemini"}.`,
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
						text: JSON.stringify({ 
							systemTime: currentTime,
							julesQuota: {
								limit: config.julesDailyLimit,
								todayUsage: todayUsage,
								remaining: Math.max(0, config.julesDailyLimit - todayUsage)
							},
							tasks 
						}, null, 2) 
					},
				],
			};
		}
		case "get_system_time": {
			const now = new Date();
			const localTime = now.toLocaleString("pt-BR", { hour12: false });
			const utcTime = now.toISOString();
			return {
				content: [
					{ type: "text", text: `Local system time: ${localTime}\nUTC time: ${utcTime}` },
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
							text: `Logs for task "${taskName}":

${content}`,
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
