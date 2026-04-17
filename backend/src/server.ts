import express from 'express';
import cors from 'cors';
import healthRouter  from './routes/health.js';
import correctRouter from './routes/correct.js';
import whisperRouter from './routes/whisper.js';

const app = express();
const PORT = 3001;

app.use(cors({
  origin: /^http:\/\/localhost(:\d+)?$/,
  methods: ['GET', 'POST'],
}));

app.use(express.json());

app.use('/api', healthRouter);
app.use('/api', correctRouter);
app.use('/api', whisperRouter);

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});