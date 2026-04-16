import { Router } from 'express';
import { listModels, DEFAULT_MODEL } from '../services/ollama.js';
import type { HealthResponse } from '../types.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const models = await listModels();
  const ollama = models.length > 0;

  const body: HealthResponse = {
    ollama,
    models,
    default_model: DEFAULT_MODEL,
  };

  res.json(body);
});

export default router;
