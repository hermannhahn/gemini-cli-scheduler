const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = pkg.version;

function run(command, ignoreError = false) {
    console.log(`Executing: ${command}`);
    try {
        execSync(command, { stdio: 'inherit' });
        return true;
    } catch (error) {
        if (ignoreError) {
            console.log(`Command failed (ignored): ${command}`);
            return false;
        }
        console.error(`Error executing command: ${command}`);
        process.exit(1);
    }
}

console.log(`Starting deploy process for v${version}...`);

// 1. Prepare main branch
run('git checkout main');
run('git pull origin main');

// 2. Build and verify
run('npm run lint');
run('npm run build');

// 3. Commit build artifacts
run('git add dist/tool_code.js');
// Ignore error if nothing to commit (already up to date)
run(`git commit -m "chore: build tool_code.js for release v${version}"`, true);

// 4. Push and Tag
run('git push origin main');
run(`git tag -f v${version}`);
run(`git push origin -f v${version}`);

// 5. Create Distribution Package
console.log('Creating distribution package...');
const releaseDir = 'release_tmp';
if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.mkdirSync(releaseDir);

// Copy necessary files/folders
const assets = ['dist', 'gemini-extension.json', 'package.json', 'README.md', 'LICENSE'];
assets.forEach(asset => {
    const src = path.join(__dirname, '..', asset);
    const dest = path.join(releaseDir, asset);
    if (fs.existsSync(src)) {
        if (fs.lstatSync(src).isDirectory()) {
            fs.cpSync(src, dest, { recursive: true });
        } else {
            fs.copyFileSync(src, dest);
        }
    }
});

const archiveName = `gemini-cli-scheduler-v${version}.tar.gz`;
// Use tar to create the archive from the contents of release_tmp
run(`tar -czf ${archiveName} -C ${releaseDir} .`);

// 6. Create GitHub Release with Asset
console.log('Creating GitHub release with asset...');
run(`gh release create v${version} ${archiveName} --generate-notes`, true);

// Cleanup
fs.rmSync(releaseDir, { recursive: true, force: true });
if (fs.existsSync(archiveName)) {
    fs.unlinkSync(archiveName);
}

console.log(`Deploy of v${version} completed successfully! 🚀✨`);
