const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = pkg.version;

function run(command) {
    console.log(`Executing: ${command}`);
    try {
        execSync(command, { stdio: 'inherit' });
    } catch (error) {
        console.error(`Error executing command: ${command}`);
        process.exit(1);
    }
}

console.log(`Pushing version ${version} to development branch...`);

run('git add .');
run(`git commit -m "chore: bump version to ${version}"`);
run('git push origin development');

console.log('Version push complete! 🚀');
