import fs from "fs";
import path from "path";
import schedule from "node-schedule";
import { spawn } from "child_process";
import { Task } from "./types";
import { LOGS_DIR } from "./constants";
import { tasks, activeJobs } from "./state";
import { logToFile, parseDateTime } from "./utils";
import { saveTasks } from "./persistence";

export function getDailyJulesUsage(executeAt: Date): number {
	if (isNaN(executeAt.getTime())) return 0;
	const dateString = executeAt.toLocaleDateString("en-CA");
	return tasks.filter((t) => {
		if (t.executor !== "jules") return false;
		const taskDateObj = parseDateTime(t.datetime);
		if (isNaN(taskDateObj.getTime())) return false;
		const taskDate = taskDateObj.toLocaleDateString("en-CA");
		return taskDate === dateString && t.status !== "cancelled";
	}).length;
}

export function scheduleTask(task: Task) {
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

	logToFile(
		`SYSTEM: Scheduling task "${task.name}" for ${executeAt.toISOString()} (Local: ${executeAt.toLocaleString()})`,
	);

	const job = schedule.scheduleJob(executeAt, function () {
		logToFile(`SYSTEM: Starting task "${task.name}"`);
		executeHeadless(task);
		activeJobs.delete(task.id);
	});

	if (job) {
		activeJobs.set(task.id, job);
	}
}

export function executeHeadless(task: Task) {
	const taskLogPath = path.join(LOGS_DIR, `${task.name}.log`);
	task.logFile = taskLogPath;
	const logStream = fs.createWriteStream(taskLogPath, { flags: "w" });
	const timestamp = new Date().toISOString();

	logStream.write(`--- START TASK: ${task.name} (${timestamp}) ---
`);

	let finalPrompt = task.message;
	const finalExtensions = task.extensions || [];
	let modelName: string | null = null;

	if (task.executor === "jules") {
		logStream.write(`Executor: Jules (Sub-agent)\n`);
		finalPrompt = `Act as the Jules sub-agent and execute the following task: ${task.message}`;
		if (!finalExtensions.includes("gemini-cli-jules")) {
			finalExtensions.push("gemini-cli-jules");
		}
	} else if (task.executor === "gemini") {
		logStream.write(`Executor: Gemini (Standard)\n`);
	} else if (task.executor.startsWith("gemini/")) {
		modelName = task.executor.split("/")[1];
		logStream.write(`Executor: Gemini (Model: ${modelName})\n`);
	} else if (task.executor.startsWith("ollama/")) {
		modelName = task.executor;
		logStream.write(`Executor: Ollama (Model: ${modelName})\n`);
	} else {
		modelName = task.executor;
		logStream.write(`Executor: ${task.executor}\n`);
	}

	logStream.write(`Prompt: ${finalPrompt}\n`);

	if (finalExtensions.length > 0) {
		logStream.write(
			`Enabled Extensions: ${finalExtensions.join(", ")}\n\n`,
		);
	} else {
		logStream.write(`Enabled Extensions: NONE (Restricted mode)\n\n`);
	}

	const args = ["--yolo"];

	if (modelName) {
		args.push("--model", modelName);
	}

	if (finalExtensions.length > 0) {
		finalExtensions.forEach((ext) => {
			args.push("-e", ext);
		});
	} else {
		args.push("-e", "none_active");
	}

	args.push("--prompt", finalPrompt);

	const child = spawn("gemini", args, { env: process.env });

	child.stdout.on("data", (data) => {
		logStream.write(data);
	});

	child.stderr.on("data", (data) => {
		logStream.write(`[STDERR] ${data}`);
	});

	child.on("close", (code) => {
		const endTimestamp = new Date().toISOString();
		logStream.write(
			`\n--- END TASK: ${task.name} (Exit Code: ${code}) at ${endTimestamp} ---\n`,
		);
		logStream.end();

		task.status = "completed";
		saveTasks();
		logToFile(`SYSTEM: Task "${task.name}" completed with code ${code}.`);
	});
}

export async function waitForTaskCompletion(
	taskName: string,
	timeout: number,
): Promise<{ success: boolean; logs?: string; error?: string }> {
	const taskLogPath = path.join(LOGS_DIR, `${taskName}.log`);
	const endMarker = `--- END TASK: ${taskName}`;

	return new Promise((resolve) => {
		const startTime = Date.now();

		const checkInterval = setInterval(() => {
			if (fs.existsSync(taskLogPath)) {
				const stats = fs.statSync(taskLogPath);
				const fd = fs.openSync(taskLogPath, "r");
				const buffer = Buffer.alloc(stats.size);
				fs.readSync(fd, buffer, 0, stats.size, 0);
				fs.closeSync(fd);

				const content = buffer.toString();
				if (content.includes(endMarker)) {
					clearInterval(checkInterval);
					resolve({
						success: true,
						logs: content,
					});
				}
			}

			if (Date.now() - startTime > timeout * 1000) {
				clearInterval(checkInterval);
				resolve({
					success: false,
					error: `TIMEOUT: Task "${taskName}" did not complete within ${timeout} seconds.`,
				});
			}
		}, 1000); // Poll every second
	});
}

export function cancelTask(idOrName: string) {
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
