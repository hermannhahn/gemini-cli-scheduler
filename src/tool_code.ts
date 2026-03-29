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
	executor: string;
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

function parseDateTime(datetime: string): Date {
	let date = new Date(datetime);

	// If datetime is just HH:mm:ss, assume today at that time
	if (datetime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
		const [hours, minutes, seconds] = datetime.split(":").map(Number);
		date = new Date();
		date.setHours(hours || 0, minutes || 0, seconds || 0, 0);
	}
	return date;
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
	const executeAt = parseDateTime(task.datetime);
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

	const job = schedule.scheduleJob(executeAt, async function () {
		logToFile(`SYSTEM: Starting task "${task.name}"`);
		await executeTask(task);
		activeJobs.delete(task.id);
	});
	if (job) {
		activeJobs.set(task.id, job);
	}
}

function executeTask(task: Task): Promise<void> {
	return new Promise((resolve) => {
		const taskLogPath = path.join(LOGS_DIR, `${task.name}.log`);
		task.logFile = taskLogPath;
		const logStream = fs.createWriteStream(taskLogPath, { flags: "w" });
		const timestamp = new Date().toISOString();

		logStream.write(`--- START TASK: ${task.name} (${timestamp}) ---
`);
		logStream.write(`Executor: ${task.executor}
`);

		let finalPrompt = task.message;
		const finalExtensions = task.extensions || [];
		let command = "gemini";
		const args = [];

		if (task.executor === "jules") {
			finalPrompt = `Act as the Jules sub-agent and execute the following task: ${task.message}`;
			if (!finalExtensions.includes("gemini-cli-jules")) {
				finalExtensions.push("gemini-cli-jules");
			}
			args.push("--yolo");
		} else if (task.executor.startsWith("ollama/")) {
			command = "ollama";
			const model = task.executor.split("/")[1];
			args.push("run", model);
		} else {
			// Default to gemini
			args.push("--yolo");
			if (task.executor !== "gemini") {
				args.push("--model", task.executor);
			}
		}

		logStream.write(`Prompt: ${finalPrompt}
`);

		if (command === "gemini" && finalExtensions.length > 0) {
			logStream.write(
				`Enabled Extensions: ${finalExtensions.join(", ")}\n\n`,
			);
			finalExtensions.forEach((ext) => {
				args.push("-e", ext);
			});
		} else if (command === "gemini") {
			logStream.write(`Enabled Extensions: NONE (Restricted mode)\n\n`);
			args.push("-e", "none_active");
		}

		args.push("--prompt", finalPrompt);

		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
			resolve();
		});
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
		version: "0.8.30",
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
						wait_for_completion: {
							type: "boolean",
							description:
								"If true, the model will wait (block) until the task is completed and return the resulting logs. Use this to see the outcome immediately or to use the scheduler as a 'sleep' (delay) before your next action.",
							default: false,
						},
						executor: {
							type: "string",
							description:
								"Optional: Specify the executor for the task. Examples: 'gemini-pro', 'jules', 'ollama/llama3'. Defaults to 'gemini' if not specified.",
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
	wait_for_completion?: boolean;
	executor?: string;
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
				wait_for_completion,
				executor,
			} = args as unknown as ScheduleTaskArgs;

			const id = Math.random().toString(36).substring(2, 9);

			let taskExtensions = extensions;
			if (!Array.isArray(taskExtensions) || taskExtensions.length === 0) {
				taskExtensions = detectEnabledExtensions();
			}

			// Create the task object first
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

			if (wait_for_completion) {
				// Execute immediately and wait
				logToFile(`SYSTEM: Task "${task.name}" starting immediate execution for wait_for_completion.`);
				await executeTask(task);

				// Now read the log file and return its content
				if (fs.existsSync(task.logFile)) {
					const logContent = fs.readFileSync(task.logFile, "utf8");
					return {
						content: [{ type: "text", text: `Task "${taskName}" completed.

Logs:
${logContent}` }],
					};
				} else {
					return {
						content: [{ type: "text", text: `Task "${taskName}" executed, but log file was not found.` }],
						isError: true,
					};
				}
			} else {
				// Schedule for later
				scheduleTask(task);
				logToFile(`SYSTEM: Task "${task.name}" scheduled for ${datetime} with executor ${task.executor}`);
				return {
					content: [
						{
							type: "text",
							text: `Task "${taskName}" scheduled for ${datetime}. Executor: ${task.executor}.`,
						},
					],
				};
			}
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
			const currentTime = now.toLocaleString();
			return {
				content: [
					{ 
						type: "text", 
						text: JSON.stringify({ 
							systemTime: currentTime,
							tasks 
						}, null, 2) 
					},
				],
			};
		}
		case "get_system_time": {
			const now = new Date();
			const localTime = now.toLocaleString();
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
