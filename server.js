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

  try {
    // Transcribe audio to text using Whisper model
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(audioPath),
      response_format: 'text'
    });

    console.log('Transcription:', transcription.text);  // Log transcription to check

    // Generate image using the transcription text as the prompt
    const dalleRes = await openai.images.generate({
      prompt: transcription.text,  // Pass transcription text as prompt
      n: 1,
      size: "1024x1024"
    });

    const imageUrl = dalleRes.data[0].url;  // Extract the image URL from the response
    fs.unlinkSync(audioPath);  // Cleanup the uploaded audio file

    // Send back the transcription and image URL as a response
    res.json({
      transcription: transcription.text,  // Send the transcription as part of the response
      imageUrl: imageUrl  // Send the generated image URL
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