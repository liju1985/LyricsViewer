const { fork } = require('child_process');
const path = require('path');

const userData = `${process.env.HOME}/Library/Application Support/lyricsviewer`;
const workerPath = path.join(__dirname, '../dist-electron/speechWorker.js');

const worker = fork(workerPath, [], {
  execPath: '/usr/local/bin/node',
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
});

worker.stderr?.on('data', (d) => process.stderr.write(d));
worker.on('message', (m) => console.log('MSG', m));
worker.on('exit', (code) => console.log('exit', code));

worker.send({ type: 'init', userDataPath: userData });

setTimeout(() => {
  worker.send({ type: 'start', grammar: [] });
  const silence = Buffer.alloc(32000, 0);
  worker.send({ type: 'audio', data: silence });
  setTimeout(() => worker.kill(), 1500);
}, 4000);
