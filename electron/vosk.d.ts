declare module 'vosk' {
  export class Model {
    constructor(modelPath: string);
    free(): void;
  }

  export class Recognizer {
    constructor(param: {
      model: Model;
      sampleRate: number;
      grammar?: string[];
    });
    acceptWaveform(buffer: Buffer): boolean;
    result(): string;
    partialResult(): string;
    finalResult(): string;
    free(): void;
  }

  export function setLogLevel(level: number): void;
}
