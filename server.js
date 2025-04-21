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
  let audioPath = req.file?.path;
  if (!audioPath) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  try {
    let convertedPath = audioPath.replace(path.extname(audioPath), '.wav');

    // Convert to WAV if necessary
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

    // Check audio duration
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

    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(convertedPath),
      response_format: 'text',
      language: 'en',
      temperature: 0
    });

    const transcriptText = transcription.trim();

    console.log('Transcription:', transcriptText);

    if (!transcriptText || transcriptText.length === 0) {
      fs.unlinkSync(convertedPath);
      return res.status(400).json({ error: 'Transcription failed or was empty. Try speaking clearly or recording again.' });
    }

    // Generate image from transcript
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
    return res.status(500).json({ error: error.message || 'Unexpected server error occurred.' });
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