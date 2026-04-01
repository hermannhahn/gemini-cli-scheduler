import path from "path";
import os from "os";
import fs from "fs";

export const HOME_DIR = os.homedir();
export const PERSISTENT_GEMINI_DIR = path.join(
	HOME_DIR,
	".gemini",
	"extensions",
	"gemini-cli-scheduler",
);
export const PERSISTENCE_PATH =
	process.env.SCHEDULER_PATH ||
	path.join(PERSISTENT_GEMINI_DIR, "tasks.json");
export const LOGS_DIR = path.join(PERSISTENT_GEMINI_DIR, "logs");
export const SYSTEM_LOG_PATH = path.join(PERSISTENT_GEMINI_DIR, "scheduler.log");
export const CONFIG_PATH = path.join(PERSISTENT_GEMINI_DIR, "config.json");
export const DEFAULT_WAIT_FOR_COMPLETION_TIMEOUT = 300; // 5 minutes in seconds

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) {
	fs.mkdirSync(LOGS_DIR, { recursive: true });
}
