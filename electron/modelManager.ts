import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';

// Indian English — better for Indian accents than the US small model.
const MODEL_DIR_NAME = 'vosk-model-small-en-in-0.4';
const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-in-0.4.zip';

export function getModelDir(userDataPath: string): string {
  return path.join(userDataPath, MODEL_DIR_NAME);
}

export function isModelInstalled(userDataPath: string): boolean {
  const modelDir = getModelDir(userDataPath);
  return fs.existsSync(path.join(modelDir, 'am'));
}

async function downloadFile(url: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        pipeline(response, file).then(resolve).catch(reject);
      })
      .on('error', reject);
  });
}

export async function ensureVoskModel(
  userDataPath: string,
  onStatus?: (message: string) => void,
): Promise<string> {
  const modelDir = getModelDir(userDataPath);
  if (isModelInstalled(userDataPath)) {
    return modelDir;
  }

  onStatus?.('Downloading Indian English speech model (~40 MB, one-time)...');
  const zipPath = path.join(userDataPath, `${MODEL_DIR_NAME}.zip`);
  fs.mkdirSync(userDataPath, { recursive: true });

  await downloadFile(MODEL_URL, zipPath);

  onStatus?.('Extracting speech model...');
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(userDataPath, true);
  fs.unlinkSync(zipPath);

  if (!isModelInstalled(userDataPath)) {
    throw new Error('Speech model extraction failed.');
  }

  onStatus?.('Indian English speech model ready.');
  return modelDir;
}
