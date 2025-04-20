const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'www')));

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.API_KEY });

// Multer config
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Upload route
app.post('/upload', upload.single('audio'), async (req, res) => {
  const audioPath = req.file.path;

  try {
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(audioPath),
      response_format: 'text'
    });

    const dalleRes = await openai.images.generate({
      prompt: transcription,
      n: 1,
      size: "1024x1024"
    });

    const imageUrl = dalleRes.data[0].url;
    fs.unlinkSync(audioPath); // cleanup

    res.json({
      transcription,
      imageUrl
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fallback route (for SPA support on Render)
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