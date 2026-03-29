import { Task, Config } from "./types";
import schedule from "node-schedule";

export let tasks: Task[] = [];
export let config: Config = { julesDailyLimit: 50 };
export const activeJobs = new Map<string, schedule.Job>();

export function setTasks(newTasks: Task[]) {
	tasks = newTasks;
}

export function setConfig(newConfig: Config) {
	config = newConfig;
}
