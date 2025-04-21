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
  limits: { fileSize: 25 * 1024 * 1024 }, // Limit file size to 25MB
});

// Upload route
app.post('/upload', upload.single('audio'), async (req, res) => {
  const audioPath = req.file.path;
  const fileExtension = path.extname(req.file.originalname).toLowerCase();

  try {
    // Ensure we are passing the correct MIME type based on file extension
    let fileStream = fs.createReadStream(audioPath);
    if (fileExtension === '.mp3') {
      fileStream.name = 'file.mp3';  // Set name for .mp3
    } else if (fileExtension === '.ogg') {
      fileStream.name = 'file.ogg';  // Set name for .ogg
    } else {
      fileStream.name = 'file.webm';  // Default to .webm if no other option
    }

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fileStream, // Provide the file stream
      response_format: 'text'
    });

    const dalleRes = await openai.images.generate({
      prompt: transcription.text,
      n: 1,
      size: "1024x1024"
    });

    const imageUrl = dalleRes.data[0].url;
    fs.unlinkSync(audioPath); // cleanup

    res.json({
      transcription: transcription.text,
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