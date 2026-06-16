import { fork, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type TranscriptHandler = (text: string, isFinal: boolean) => void;
type StatusHandler = (message: string) => void;

type WorkerOutbound =
  | { type: 'ready' }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'status'; message: string }
  | { type: 'transcript'; text: string; final?: boolean }
  | { type: 'error'; message: string };

function resolveNodePath(): string {
  const candidates = [
    process.env.LYRICS_VIEWER_NODE,
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'node';
}

export class SpeechService {
  private worker: ChildProcess | null = null;
  private userDataPath = '';
  private modelReady = false;
  private onTranscript: TranscriptHandler | null = null;
  private onStatus: StatusHandler | null = null;
  private readyPromise: Promise<void> | null = null;

  setUserDataPath(userDataPath: string): void {
    this.userDataPath = userDataPath;
  }

  private spawnWorker(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'speechWorker.js');
      const childEnv = { ...process.env };
      delete childEnv.ELECTRON_RUN_AS_NODE;

      this.worker = fork(workerPath, [], {
        execPath: resolveNodePath(),
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: childEnv,
      });

      const timeout = setTimeout(() => {
        reject(new Error('Speech worker timed out while loading the model.'));
      }, 10 * 60 * 1000);

      this.worker.on('message', (message: WorkerOutbound) => {
        if (message.type === 'status') {
          this.onStatus?.(message.message);
        }

        if (message.type === 'ready') {
          clearTimeout(timeout);
          this.modelReady = true;
          resolve();
        }

        if (message.type === 'transcript' && this.onTranscript) {
          this.onTranscript(message.text, Boolean(message.final));
        }

        if (message.type === 'error') {
          clearTimeout(timeout);
          if (this.modelReady) {
            this.onStatus?.(`Speech error: ${message.message}`);
          } else {
            reject(new Error(message.message));
          }
        }
      });

      this.worker.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.worker.on('exit', (code) => {
        this.worker = null;
        this.modelReady = false;
        this.readyPromise = null;
        if (code && code !== 0) {
          reject(new Error(`Speech worker exited with code ${code}.`));
        }
      });

      this.worker.send({ type: 'init', userDataPath: this.userDataPath });
    });

    return this.readyPromise;
  }

  async ensureModel(onStatus?: StatusHandler): Promise<void> {
    if (!this.userDataPath) {
      throw new Error('Speech service is not configured.');
    }
    this.onStatus = onStatus ?? null;
    await this.spawnWorker();
  }

  start(grammarPhrases: string[], onTranscript: TranscriptHandler): void {
    if (!this.worker || !this.modelReady) {
      throw new Error('Speech model is not loaded.');
    }

    this.onTranscript = onTranscript;
    this.worker.send({
      type: 'start',
      grammar: grammarPhrases.map((phrase) => phrase.trim()).filter(Boolean),
    });
  }

  processChunk(chunk: Buffer): void {
    if (!this.worker || !this.modelReady) return;
    this.worker.send({ type: 'audio', data: chunk });
  }

  stop(): void {
    this.worker?.send({ type: 'stop' });
    this.onTranscript = null;
  }

  dispose(): void {
    this.stop();
    this.worker?.kill();
    this.worker = null;
    this.modelReady = false;
    this.readyPromise = null;
  }
}
