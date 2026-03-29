import fs from "fs";
import { execSync } from "child_process";
import { SYSTEM_LOG_PATH } from "./constants";

export function logToFile(message: string, specificLogPath = SYSTEM_LOG_PATH) {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}\n`;
	fs.appendFileSync(specificLogPath, logMessage);
}

export function parseDateTime(datetime: string): Date {
	let date = new Date(datetime);

	// If datetime is just HH:mm:ss, assume today at that time
	if (datetime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
		const [hours, minutes, seconds] = datetime.split(":").map(Number);
		date = new Date();
		date.setHours(hours || 0, minutes || 0, seconds || 0, 0);
	}
	return date;
}

export function detectEnabledExtensions(): string[] {
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
