import { Router, Request, Response } from 'express';
import multer from 'multer';
import { transcribeAudio } from '../services/whisper.js';
import type { WhisperResponse, ErrorResponse } from '../types.js';

const router  = Router();

// memoryStorage keeps the uploaded file in memory as a Buffer
// rather than writing it to disk — we handle the temp file ourselves
// in the whisper service
const upload = multer({ storage: multer.memoryStorage() });

router.post('/whisper', upload.single('audio'), async (req: Request, res: Response) => {
  if (!req.file) {
    const err: ErrorResponse = { error: 'No audio file provided', code: 'INVALID_INPUT' };
    res.status(400).json(err);
    return;
  }

  const start = Date.now();

  try {
    const transcript = await transcribeAudio(req.file.buffer);

    if (!transcript) {
      const err: ErrorResponse = { error: 'No speech detected', code: 'NO_SPEECH' };
      res.status(422).json(err);
      return;
    }

    const body: WhisperResponse = {
      transcript,
      latency_ms: Date.now() - start,
    };

    res.json(body);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const body: ErrorResponse = { error: message, code: 'WHISPER_ERROR' };
    res.status(500).json(body);
  }
});

export default router;
