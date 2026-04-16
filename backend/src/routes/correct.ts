import { Router, Request, Response } from 'express';
import { correctTranscript, DEFAULT_MODEL } from '../services/ollama.js';
import type { CorrectionRequest, ErrorResponse } from '../types.js';

const router = Router();

router.post('/correct', async (req: Request, res: Response) => {
  const body = req.body as CorrectionRequest;

  if (!body.transcript || typeof body.transcript !== 'string') {
    const err: ErrorResponse = { error: 'transcript is required', code: 'INVALID_INPUT' };
    res.status(400).json(err);
    return;
  }

  const transcript = body.transcript.trim();
  if (transcript.length === 0) {
    const err: ErrorResponse = { error: 'transcript is empty', code: 'INVALID_INPUT' };
    res.status(400).json(err);
    return;
  }

  const model = typeof body.model === 'string' ? body.model : DEFAULT_MODEL;

  try {
    const result = await correctTranscript(transcript, model);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message === 'OLLAMA_UNAVAILABLE') {
      const body: ErrorResponse = {
        error: 'Ollama is not running. Start it with: ollama serve',
        code: 'OLLAMA_UNAVAILABLE',
      };
      res.status(503).json(body);
      return;
    }

    const body: ErrorResponse = { error: message, code: 'LLM_ERROR' };
    res.status(500).json(body);
  }
});

export default router;
