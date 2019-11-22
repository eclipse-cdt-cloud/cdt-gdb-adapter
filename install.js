const os = require('os');
const { spawnSync } = require('child_process');

if (os.platform() === 'linux') {
    const {status} = spawnSync('npm', ['run', 'nativebuild'], {
        stdio: 'inherit'
    });
    process.exitCode = status;
}
