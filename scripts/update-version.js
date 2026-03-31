const fs = require("fs");
const path = require("path");

// Get the new version from package.json
const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const newVersion = packageJson.version;

console.log(`Synchronizing version ${newVersion} across all configuration files...`);

// 1. Update gemini-extension.json
const geminiExtensionPath = path.join(__dirname, "../gemini-extension.json");
if (fs.existsSync(geminiExtensionPath)) {
	let content = fs.readFileSync(geminiExtensionPath, "utf8");
	content = content.replace(
		/"version":\s*".*?"/,
		`"version": "${newVersion}"`,
	);
	fs.writeFileSync(geminiExtensionPath, content);
	console.log("- gemini-extension.json updated.");
}

// 2. Update src/tool_code.ts (MCP Server version)
const toolCodePath = path.join(__dirname, "../src/tool_code.ts");
if (fs.existsSync(toolCodePath)) {
	let content = fs.readFileSync(toolCodePath, "utf8");
	// Precisely target the version inside the Server constructor object
	content = content.replace(
		/name:\s*"gemini-cli-scheduler",\s*version:\s*".*?"/,
		`name: "gemini-cli-scheduler",\n		version: "${newVersion}"`,
	);
	fs.writeFileSync(toolCodePath, content);
	console.log("- src/tool_code.ts updated.");
}

console.log("Version synchronization complete.");
