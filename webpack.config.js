const path = require("path");

module.exports = {
	mode: "production",
	entry: "./src/tool_code.ts",
	target: "node",
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: "ts-loader",
				exclude: [/node_modules/],
			},
		],
	},
	resolve: {
		extensions: [".ts", ".js"],
	},
	output: {
		filename: "tool_code.js",
		path: path.resolve(__dirname),
		libraryTarget: "commonjs",
		clean: false, // Clean the dist folder before each build
	},
	optimization: {
		minimize: true,
	},
};
