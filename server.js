// server.js

// --- Import all the necessary libraries ---
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // This loads the variables from your .env file

// --- Initialize the app and set the port ---
const app = express();
const port = process.env.PORT || 5001;

// --- Middleware ---
// This allows your frontend (running on a different port) to make requests to this backend.
app.use(cors()); 
// This allows the server to understand JSON data sent in requests.
app.use(express.json()); 

// --- Connect to your MongoDB Database ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- Set up the Google Gemini AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Set up Multer for handling file uploads (like resumes) ---
// We'll store the uploaded file in the server's memory temporarily.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- API Endpoints (The URLs your frontend will call) ---

/**
 * @route   POST /api/chat
 * @desc    Handles text-based conversations with the AI.
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { history, message } = req.body;

        const chat = model.startChat({ history: history || [] });
        const result = await chat.sendMessage(message);
        const response = await result.response;
        const text = response.text();
        
        res.json({ response: text });

    } catch (error) {
        console.error('Error in /api/chat:', error);
        res.status(500).json({ error: 'Failed to get response from AI.' });
    }
});

/**
 * @route   POST /api/analyze-resume
 * @desc    Handles resume file uploads and analysis.
 */
app.post('/api/analyze-resume', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Resume file is required.' });
        }

        // NOTE: This is a simplified text extraction. For a real-world app,
        // you would use a library like 'pdf-parse' to get text from a PDF.
        const resumeText = `Analyze the resume content from the file named: ${req.file.originalname}`;
        
        const prompt = `
            Based on the following resume text, provide a concise analysis. 
            1. Identify the top 3 skills.
            2. Suggest 3 potential career paths that align with the resume.
            3. Give one piece of actionable advice for improvement.

            Resume Text: "${resumeText}"
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.json({ response: text });

    } catch (error) {
        console.error('Error in /api/analyze-resume:', error);
        res.status(500).json({ error: 'Failed to analyze resume.' });
    }
});


// --- Start the server and listen for requests ---
app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
});
