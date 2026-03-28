const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
	StdioServerTransport,
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const path = require("path");
const schedule = require("node-schedule");
const { spawn, execSync } = require("child_process");

const EXTENSION_DIR = __dirname;
const PERSISTENCE_PATH =
	process.env.SCHEDULER_PATH || path.join(EXTENSION_DIR, "tasks.json");
const LOGS_DIR = path.join(EXTENSION_DIR, "logs");
const SYSTEM_LOG_PATH = path.join(EXTENSION_DIR, "scheduler.log");

// Ensure the logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
	fs.mkdirSync(LOGS_DIR, { recursive: true });
}

let tasks = [];
const activeJobs = new Map();

function logToFile(message, specificLogPath = SYSTEM_LOG_PATH) {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}
`;
	fs.appendFileSync(specificLogPath, logMessage);
}

function detectEnabledExtensions() {
	try {
		const output = execSync("gemini extensions list", { encoding: "utf8" });
		const sections = output.split("✓ ");
		const enabledExtensions = [];

		for (const section of sections) {
			if (!section.trim()) continue;

			const lines = section.split("
");
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

function scheduleTask(task) {
	let executeAt = new Date(task.datetime);

	if (isNaN(executeAt.getTime())) {
		const [hours, minutes, seconds] = task.datetime.split(":").map(Number);
		executeAt = new Date();
		executeAt.setHours(hours || 0, minutes || 0, seconds || 0, 0);
	}

	if (executeAt < new Date()) {
		logToFile(
			`SYSTEM: Skipping task "${task.name}" because it's in the past.`,
		);
		task.status = "missed";
		saveTasks();
		return;
	}

	const job = schedule.scheduleJob(executeAt, function () {
		logToFile(`SYSTEM: Starting task "${task.name}"`);
		executeHeadless(task);
		activeJobs.delete(task.id);
		if (job) job.cancel();
	});

	if (job) {
		activeJobs.set(task.id, job);
	}
}

function executeHeadless(task) {
	const taskLogPath = path.join(LOGS_DIR, `${task.name}.log`);
	task.logFile = taskLogPath;
	const logStream = fs.createWriteStream(taskLogPath, { flags: "w" });
	const timestamp = new Date().toISOString();

	logStream.write(`--- START TASK: ${task.name} (${timestamp}) ---
`);

	let finalPrompt = task.message;
	let finalExtensions = task.extensions || [];

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
			`Enabled Extensions: ${finalExtensions.join(", ")}

`,
		);
	} else {
		logStream.write(`Enabled Extensions: NONE (Restricted mode)

`);
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

async function waitForTaskCompletion(taskName, timeout) {
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
			let timeoutId;

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

function cancelTask(idOrName) {
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
		version: "0.8.5",
	},
	{
		capabilities: {
			tools: {
				supported: true,
				description:
					"Provides task scheduling and management capabilities within Gemini CLI.",
			},
		},
	},
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
	return {
		tools: [
			{
				name: "schedule_task",
				description:
					"Schedule a task. If 'monitor' is true, wait and return logs. If 'useJules' is true, the task will be executed by the Jules sub-agent.",
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
				description: "List all tasks with status and log info.",
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
		],
	};
});

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
			} = args;
			const id = Math.random().toString(36).substring(2, 9);

			let taskExtensions = extensions;
			if (!taskExtensions || taskExtensions.length === 0) {
				taskExtensions = detectEnabledExtensions();
			}

			const task = {
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
						content: [{ type: "text", text: result.error }],
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
		case "list_tasks": {
			return {
				content: [
					{ type: "text", text: JSON.stringify(tasks, null, 2) },
				],
			};
		}
		case "cancel_task": {
			const { idOrName } = args;
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
			const { taskName } = args;
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
	logToFile("SYSTEM: Gemini CLI Scheduler MCP server started.");
}

main().catch((error) => {
	console.error("Fatal error in main():", error);
	process.exit(1);
});
