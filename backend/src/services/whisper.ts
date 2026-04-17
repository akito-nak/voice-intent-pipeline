import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);

const WHISPER_CLI   = 'whisper-cli';
const FFMPEG        = 'ffmpeg';
const WHISPER_MODEL = `${process.env.HOME}/whisper-models/ggml-base.en.bin`;

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const id         = Date.now();
  const webmPath   = join(tmpdir(), `whisper-in-${id}.webm`);
  const wavPath    = join(tmpdir(), `whisper-in-${id}.wav`);
  const outputPath = join(tmpdir(), `whisper-out-${id}`);

  try {
    // Step 1 — write the raw WebM buffer from the browser to a temp file
    await writeFile(webmPath, audioBuffer);

    // Step 2 — convert WebM/Opus → WAV (16kHz mono 16-bit PCM)
    // whisper-cli only accepts: flac, mp3, ogg, wav
    // -ar 16000 sets sample rate to 16kHz (what Whisper expects)
    // -ac 1     converts to mono
    // -y        overwrite output without asking
    await execFileAsync(FFMPEG, [
      '-i',    webmPath,
      '-ar',   '16000',
      '-ac',   '1',
      '-y',    wavPath,
    ]);

    // Step 3 — run whisper-cli on the WAV file
    await execFileAsync(WHISPER_CLI, [
      '--model',       WHISPER_MODEL,
      '--file',        wavPath,
      '--language',    'en',
      '--output-txt',
      '--output-file', outputPath,
      '--no-prints',
    ]);

    // Step 4 — read the transcript whisper wrote
    const transcript = await readFile(`${outputPath}.txt`, 'utf-8');
    return transcript.trim();

  } finally {
    // Clean up all temp files regardless of success or failure
    await unlink(webmPath).catch(() => {});
    await unlink(wavPath).catch(() => {});
    await unlink(`${outputPath}.txt`).catch(() => {});
  }
}
