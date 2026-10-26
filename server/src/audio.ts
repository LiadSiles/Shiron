import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';

/** Runs a command; kills it if it takes longer than `timeoutMs` so a bad file can't hang a request. */
function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with ${code}: ${stderr.split('\n').slice(-6).join('\n')}`));
    });
  });
}

export async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]);
    const d = Number.parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

/**
 * The audio chain from the design doc:
 *  1. trim silence at the start and end ("רגע… עכשיו" before the song starts),
 *  2. normalize loudness so quiet WhatsApp voice notes match professional mp3s (EBU R128, -16 LUFS),
 *  3. encode AAC in an .m4a container, which AVPlayer on iOS and ExoPlayer on Android both play.
 */
export const TRIM_FILTER = [
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3',
  'areverse',
].join(',');

export const LOUDNESS_FILTER = 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100';

/**
 * Two passes on purpose: with ffmpeg 6.x, areverse followed by loudnorm and a resampler in
 * one graph can deadlock at end of stream. Trimming to a WAV first avoids it.
 */
export async function normalizeAudio(input: string, output: string): Promise<void> {
  const trimmed = output.replace(/\.m4a$/, '') + '-trim.wav';
  try {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-nostdin',
      '-i', input, '-vn',
      '-af', TRIM_FILTER,
      '-c:a', 'pcm_s16le',
      trimmed,
    ]);
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-nostdin',
      '-i', trimmed,
      '-af', LOUDNESS_FILTER,
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      output,
    ]);
  } finally {
    await rm(trimmed, { force: true });
  }
}

/** A small mono file for the transcription API (keeps uploads well under size limits). */
export async function makeTranscriptionCopy(input: string, output: string, maxSeconds = 600): Promise<void> {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', input, '-vn', '-t', String(maxSeconds),
    '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k',
    output,
  ]);
}
