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
    let convertedPath = audioPath.replace(path.extname(audioPath), '.ogg');

    if (path.extname(audioPath).toLowerCase() === '.mp3') {
      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .audioCodec('libopus')
          .toFormat('ogg')
          .save(convertedPath)
          .on('end', resolve)
          .on('error', reject);
      });
      fs.unlinkSync(audioPath);
    } else {
      convertedPath = audioPath;
    }

    // Get plain text transcription
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(convertedPath),
      response_format: 'text'
    });

    const transcriptText = transcription; // it's already plain text

    console.log('Transcription:', transcriptText);

    // Generate image using the transcription text
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