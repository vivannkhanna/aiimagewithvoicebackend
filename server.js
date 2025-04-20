const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(express.static(path.join(__dirname, 'www')));

const openai = new OpenAI({ apiKey: process.env.API_KEY });

const upload = multer({
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['audio/ogg', 'audio/webm', 'audio/mpeg', 'audio/wav', 'audio/mp3'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  },
  limits: { fileSize: 25 * 1024 * 1024 }, // Limit size
});

// Upload route
app.post('/upload', upload.single('audio'), async (req, res) => {
  console.log('Received file:', req.file); // Debugging stuff
  const audioPath = req.file.path;

  try {
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(audioPath),
      response_format: 'text',
    });

    const dalleRes = await openai.images.generate({
      prompt: transcription.text,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = dalleRes.data[0].url;
    fs.unlinkSync(audioPath); // Cleanup uploaded audio file

    res.json({
      transcription: transcription.text,
      imageUrl,
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
  console.log(`Server running at http://localhost:${port}`);
});