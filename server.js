const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { OpenAI } = require('openai');
const ffmpeg = require('fluent-ffmpeg'); // For converting MP3 to compatible format
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'www')));

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.API_KEY });

// Multer config for accepting audio files including mp3
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Save with original extension
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // Max file size of 25MB
});

// Upload route for MP3 and other formats
app.post('/upload', upload.single('audio'), async (req, res) => {
  const audioPath = req.file.path;

  try {
    // Check if the uploaded file is MP3, and if so, convert it to a compatible format for Whisper (e.g., OGG)
    const convertedPath = audioPath.replace(path.extname(audioPath), '.ogg');
    
    if (path.extname(audioPath).toLowerCase() === '.mp3') {
      // Convert MP3 to OGG using ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(audioPath)
          .audioCodec('libopus') // For compatibility with Whisper
          .toFormat('ogg')
          .save(convertedPath)
          .on('end', resolve)
          .on('error', reject);
      });
      fs.unlinkSync(audioPath); // Remove the original MP3 file
    } else {
      convertedPath = audioPath; // No conversion needed for other formats
    }

    // Transcribe audio to text using Whisper model
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: fs.createReadStream(convertedPath),
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
    fs.unlinkSync(convertedPath);  // Cleanup the converted audio file

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