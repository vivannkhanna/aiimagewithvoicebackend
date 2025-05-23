const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { OpenAI } = require('openai');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.static(path.join(__dirname, 'www')));

const openai = new OpenAI({ apiKey: process.env.API_KEY });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.post('/upload', upload.single('audio'), async (req, res) => {
  let audioPath = req.file.path;

  try {
    let convertedPath = audioPath.replace(path.extname(audioPath), '.wav');

    if (path.extname(audioPath).toLowerCase() !== '.wav') {
      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .audioCodec('pcm_s16le')
          .format('wav')
          .save(convertedPath)
          .on('end', resolve)
          .on('error', reject);
      });
      fs.unlinkSync(audioPath);
    } else {
      convertedPath = audioPath;
    }

    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(convertedPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration);
      });
    });

    console.log(`Audio duration: ${duration}s`);

    if (duration < 1) {
      fs.unlinkSync(convertedPath);
      return res.status(400).json({ error: 'Audio too short or silent. Please try again with a longer or clearer recording.' });
    }

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(convertedPath),
      response_format: 'text',
      language: 'en', // Ensure consistent language detection
      temperature: 0,
      prompt: 'Please transcribe the spoken words in the audio clearly and accurately.'
    });

    const transcriptText = transcription.trim();
    console.log('Transcription:', transcriptText);

    // Filter out known hallucination phrases
    const hallucinationIndicators = [
      'Transcription by ESO',
      'Translation by',
      'This is an audio recording of the sound',
      'You'
    ];

    const isHallucination = hallucinationIndicators.some(phrase =>
      transcriptText.toLowerCase().includes(phrase.toLowerCase())
    );

    if (!transcriptText || isHallucination || transcriptText.length < 10) {
      fs.unlinkSync(convertedPath);
      return res.status(400).json({ error: 'Transcription failed or seems incorrect. Try speaking clearly or recording again.' });
    }

    const dalleRes = await openai.images.generate({
      prompt: transcriptText,
      n: 1,
      size: "1024x1024"
    });

    const imageUrl = dalleRes.data[0].url;

    fs.unlinkSync(convertedPath);

    res.json({
      transcription: transcriptText,
      imageUrl: imageUrl
    });

  } catch (error) {
    console.error('Error:', error);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(audioPath.replace(path.extname(audioPath), '.wav')))
      fs.unlinkSync(audioPath.replace(path.extname(audioPath), '.wav'));
    res.status(500).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'www/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('index.html not found');
  }
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});