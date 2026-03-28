const fs = require("fs");
const path = require("path");

// Get the new version from package.json
const packageJson = JSON.parse(
	fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"),
);
const newVersion = packageJson.version;

console.log(`Updating other files to version ${newVersion}...`);

// Update gemini-extension.json
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

// Update tool_code.js serverInfo version
const toolCodePath = path.join(__dirname, "../tool_code.js");
if (fs.existsSync(toolCodePath)) {
	let content = fs.readFileSync(toolCodePath, "utf8");
	content = content.replace(
		/"version":\s*".*?"/,
		`"version": "${newVersion}"`,
	);
	fs.writeFileSync(toolCodePath, content);
	console.log("- tool_code.js updated.");
}
