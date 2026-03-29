import fs from "fs";
import { PERSISTENCE_PATH, CONFIG_PATH } from "./constants";
import { tasks, config, setConfig } from "./state";
import { Task } from "./types";
import { scheduleTask } from "./scheduler";

export function loadConfig() {
	if (fs.existsSync(CONFIG_PATH)) {
		try {
			const data = fs.readFileSync(CONFIG_PATH, "utf8");
			setConfig(JSON.parse(data));
		} catch (e) {
			console.error("Error loading config:", e);
		}
	} else {
		saveConfig();
	}
}

export function saveConfig() {
	try {
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
	} catch (e) {
		console.error("Error saving config:", e);
	}
}

export function loadTasks() {
	if (fs.existsSync(PERSISTENCE_PATH)) {
		try {
			const data = fs.readFileSync(PERSISTENCE_PATH, "utf8");
			const loadedTasks = JSON.parse(data);
			const now = new Date();

			tasks.length = 0;
			loadedTasks.forEach((task: unknown) => {
				const t = task as Task;
				tasks.push(t);

				if (t.status === "pending") {
					const executeAt = new Date(t.datetime);
					if (executeAt > now) {
						scheduleTask(t);
					} else {
						t.status = "missed";
					}
				}
			});
			saveTasks();
		} catch (e) {
			console.error("Error loading tasks:", e);
		}
	}
}

export function saveTasks() {
	try {
		fs.writeFileSync(PERSISTENCE_PATH, JSON.stringify(tasks, null, 2));
	} catch (e) {
		console.error("Error saving tasks:", e);
	}
}
