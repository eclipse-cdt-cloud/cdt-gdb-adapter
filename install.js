const os = require('os');
var spawn = require('cross-spawn');

if (os.platform() === 'linux') {
    spawn.sync('npm', ['run', 'nativebuild'], {
        input: 'linux detected. Build native module.',
        stdio: 'inherit'
    });
}
