export interface Task {
	id: string;
	datetime: string;
	message: string;
	name: string;
	status: "pending" | "completed" | "missed" | "cancelled" | "failed";
	logFile: string;
	extensions: string[];
	executor: string;
}

export interface Config {
	julesDailyLimit: number;
}

export interface ScheduleTaskArgs {
	datetime: string;
	message: string;
	name: string;
	extensions?: string[];
	wait_for_completion?: boolean;
	executor?: string;
}

export interface SetJulesLimitArgs {
	limit: number;
}

export interface CancelTaskArgs {
	idOrName: string;
}

export interface ViewTaskLogArgs {
	taskName: string;
}

export interface ScheduleReminderArgs {
	datetime: string;
	message: string;
	targetTimestamp?: number;
	nonce?: string;
}
