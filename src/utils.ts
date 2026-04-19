import fs from "fs";
import { execSync } from "child_process";
import { SYSTEM_LOG_PATH } from "./constants";

export function logToFile(message: string, specificLogPath = SYSTEM_LOG_PATH) {
	const timestamp = new Date().toISOString();
	const logMessage = `[${timestamp}] ${message}\n`;
	fs.appendFileSync(specificLogPath, logMessage);
}

export function sanitizeFilename(name: string): string {
	return name.replace(/[<>:"/\\|?*]/g, "_");
}

export function parseDateTime(datetime: string): Date {
	const now = new Date();
	let date: Date;

	// Trim and lowercase for easier matching
	const input = datetime.trim().toLowerCase();

	// Relative time: "in 5 minutes", "in 1 hour", etc.
	// Allow variants: "in 1 minute", "in 5 mins", "in 1 hr", etc.
	const relativeMatch = input.match(/^in (\d+) (second|sec|minute|min|hour|hr|day)s?$/i);
	if (relativeMatch) {
		const amount = parseInt(relativeMatch[1]);
		const unit = relativeMatch[2].toLowerCase();
		date = new Date(now);

		if (unit.startsWith("sec")) date.setSeconds(now.getSeconds() + amount);
		else if (unit.startsWith("min")) date.setMinutes(now.getMinutes() + amount);
		else if (unit.startsWith("hr") || unit.startsWith("hour")) date.setHours(now.getHours() + amount);
		else if (unit.startsWith("day")) date.setDate(now.getDate() + amount);
		return date;
	}

	// Direct relative time: "10 minutes", "5 hours" (assuming "in X")
	const directRelativeMatch = input.match(/^(\d+) (second|sec|minute|min|hour|hr|day)s?$/i);
	if (directRelativeMatch) {
		const amount = parseInt(directRelativeMatch[1]);
		const unit = directRelativeMatch[2].toLowerCase();
		date = new Date(now);

		if (unit.startsWith("sec")) date.setSeconds(now.getSeconds() + amount);
		else if (unit.startsWith("min")) date.setMinutes(now.getMinutes() + amount);
		else if (unit.startsWith("hr") || unit.startsWith("hour")) date.setHours(now.getHours() + amount);
		else if (unit.startsWith("day")) date.setDate(now.getDate() + amount);
		return date;
	}

	// If datetime is just HH:mm:ss or HH:mm, assume today at that time
	const timeMatch = input.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
	if (timeMatch) {
		const hours = parseInt(timeMatch[1]);
		const minutes = parseInt(timeMatch[2]);
		const seconds = parseInt(timeMatch[3] || "0");
		
		date = new Date(now);
		date.setHours(hours, minutes, seconds, 0);
		
		// If the time has already passed today, assume tomorrow
		if (date <= now) {
			date.setDate(date.getDate() + 1);
		}
		return date;
	}

	// Try native Date parsing for absolute dates
	date = new Date(datetime);
	if (isNaN(date.getTime())) {
		throw new Error(`Invalid date format: "${datetime}". Please use 'in X minutes', 'HH:mm', or an ISO date string.`);
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
