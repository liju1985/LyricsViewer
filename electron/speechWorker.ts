import vosk from 'vosk';
import { ensureVoskModel } from './modelManager';

type WorkerMessage =
  | { type: 'init'; userDataPath: string }
  | { type: 'start'; grammar: string[] }
  | { type: 'audio'; data: unknown }
  | { type: 'stop' };

let model: vosk.Model | null = null;
let recognizer: vosk.Recognizer | null = null;

function send(message: Record<string, unknown>): void {
  if (process.send) {
    process.send(message);
  }
}

function stopRecognizer(): void {
  if (recognizer) {
    recognizer.free();
    recognizer = null;
  }
}

function toAudioBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  if (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    (data as { type: string }).type === 'Buffer' &&
    'data' in data
  ) {
    return Buffer.from((data as { data: number[] }).data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  throw new Error('Unsupported audio chunk format.');
}

process.on('message', async (message: WorkerMessage) => {
  try {
    if (message.type === 'init') {
      const modelPath = await ensureVoskModel(message.userDataPath, (status) => {
        send({ type: 'status', message: status });
      });
      vosk.setLogLevel(0);
      model = new vosk.Model(modelPath);
      send({ type: 'ready' });
      return;
    }

    if (message.type === 'start') {
      if (!model) {
        send({ type: 'error', message: 'Speech model is not loaded.' });
        return;
      }

      stopRecognizer();
      const grammar = message.grammar.filter(Boolean);

      recognizer =
        grammar.length > 0
          ? new vosk.Recognizer({ model, sampleRate: 16000, grammar })
          : new vosk.Recognizer({ model, sampleRate: 16000 });

      send({ type: 'started' });
      return;
    }

    if (message.type === 'audio') {
      if (!recognizer) return;

      const chunk = toAudioBuffer(message.data);
      if (chunk.length === 0) return;

      if (recognizer.acceptWaveform(chunk)) {
        const result = recognizer.result() as { text?: string };
        if (result.text?.trim()) {
          send({ type: 'transcript', text: result.text.trim(), final: true });
        }
      } else {
        const partial = recognizer.partialResult() as { partial?: string };
        if (partial.partial?.trim()) {
          send({ type: 'transcript', text: partial.partial.trim(), final: false });
        }
      }
      return;
    }

    if (message.type === 'stop') {
      stopRecognizer();
      send({ type: 'stopped' });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Speech worker failed.';
    send({ type: 'error', message: msg });
  }
});
