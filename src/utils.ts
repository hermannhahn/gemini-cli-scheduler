import fs from "fs";
import { execSync } from "child_process";
import { SYSTEM_LOG_PATH } from "./constants";

export function logToFile(message: string, specificLogPath = SYSTEM_LOG_PATH) {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}\n`;
	fs.appendFileSync(specificLogPath, logMessage);
}

export function parseDateTime(datetime: string): Date {
	const now = new Date();
	let date = new Date(datetime);

	// Relative time: "in 5 minutes", "in 1 hour", etc.
	const relativeMatch = datetime.match(/in (\d+) (second|minute|hour|day)s?/i);
	if (relativeMatch) {
		const amount = parseInt(relativeMatch[1]);
		const unit = relativeMatch[2].toLowerCase();
		date = new Date(now);

		if (unit.startsWith("second")) date.setSeconds(now.getSeconds() + amount);
		if (unit.startsWith("minute")) date.setMinutes(now.getMinutes() + amount);
		if (unit.startsWith("hour")) date.setHours(now.getHours() + amount);
		if (unit.startsWith("day")) date.setDate(now.getDate() + amount);
		return date;
	}

	// If datetime is just HH:mm:ss, assume today at that time
	if (datetime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
		const [hours, minutes, seconds] = datetime.split(":").map(Number);
		date = new Date(now);
		date.setHours(hours || 0, minutes || 0, seconds || 0, 0);
		
		// If the time has already passed today, assume tomorrow
		if (date <= now) {
			date.setDate(date.getDate() + 1);
		}
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
