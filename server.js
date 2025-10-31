// server.js

// --- Import all the necessary libraries ---
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// --- Initialize the app and set the port ---
const app = express();
const port = process.env.PORT || 5001;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Helper: Auth middleware to protect routes ---
function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ')
            ? authHeader.substring('Bearer '.length)
            : null;
        if (!token) return res.status(401).json({ error: 'Authorization token missing' });
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded; // { userId, email }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

// --- Connect to your MongoDB Database ---
const mongoUri = process.env.MONGO_URI;
if (!mongoUri || typeof mongoUri !== 'string' || !mongoUri.trim()) {
    console.error('[Config] MONGO_URI is missing in environment. Create Backend/.env with MONGO_URI=mongodb://localhost:27017/careerion (or your Atlas URI).');
    process.exit(1);
}

mongoose
    .connect(mongoUri)
    .then(() => {
        console.log('MongoDB connected successfully.');
        startServer();
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// --- Define the User Schema and Model ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Profile fields expected by frontend
    profile: {
        educationLevel: String,
        fieldOfStudy: String,
        institution: String,
        yearOfCompletion: String,
        currentStatus: String,
        workExperience: String,
        skills: [String],
        interests: [String],
        careerGoals: String,
        preferredWorkEnvironment: String,
        preferredWorkLocation: String,
        salaryExpectations: String,
        willingToRelocate: Boolean,
    },
    profileComplete: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    passwordResetToken: String,
    passwordResetExpires: Date,
});

// --- Current user (auth check) ---
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error('Error in /api/auth/me:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- Logout (stateless JWT; client should discard token) ---
app.post('/api/auth/logout', (req, res) => {
    res.json({ message: 'Logged out' });
});

const User = mongoose.model('User', userSchema);

// --- Define Job Schema and Model ---
const jobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, required: true },
    status: { type: String, enum: ['active', 'closed', 'draft'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.model('Job', jobSchema);

// --- Define Company Schema and Model ---
const companySchema = new mongoose.Schema({
    name: { type: String, required: true },
    industry: { type: String, required: true },
    size: { type: String, enum: ['startup', 'small', 'medium', 'large'], default: 'medium' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const Company = mongoose.model('Company', companySchema);

// --- Define Application Schema and Model ---
const applicationSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'reviewed', 'accepted', 'rejected'], default: 'pending' },
    appliedAt: { type: Date, default: Date.now }
});

const Application = mongoose.model('Application', applicationSchema);

// --- Set up the Google Gemini AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Helper to mask sensitive keys in logs
function maskKey(key) {
    if (!key || typeof key !== 'string') return null;
    if (key.length <= 8) return key.replace(/.(?=..)/g, '*');
    return key.slice(0, 6) + key.slice(6, -2).replace(/./g, '*') + key.slice(-2);
}

if (!process.env.GEMINI_API_KEY) {
    console.error('[Config] GEMINI_API_KEY is MISSING. /api/chat will fail until it is set.');
} else {
    console.log(`[Config] GEMINI_API_KEY detected: ${maskKey(process.env.GEMINI_API_KEY)}`);
}

// ✅ Use valid model IDs for the SDK; normalize env by stripping 'models/' prefix if present
const _configuredModel = process.env.GEMINI_MODEL || '';
const _normalizedModel = _configuredModel.replace(/^models\//, '');
// Recommend a modern, stable model as the default
const GEMINI_MODEL = _normalizedModel || 'gemini-1.5-flash' || 'gemini-1.5-flash-latest';
console.log(`Using Gemini model: ${GEMINI_MODEL}${_configuredModel && _configuredModel !== GEMINI_MODEL ? ` (normalized from ${_configuredModel})` : ''}`);

// Warn if JWT secret is not configured
if (!process.env.JWT_SECRET) {
    console.warn('[Config] JWT_SECRET is not set. Falling back to an insecure default. Set JWT_SECRET in your .env for production.');
}

// --- User Authentication Routes ---
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();

        const token = jwt.sign(
            { userId: newUser._id, email: newUser.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            user: { _id: newUser._id, name: newUser.name, email: newUser.email, createdAt: newUser.createdAt },
            token
        });

    } catch (error) {
        console.error('Error in signup:', error);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) return res.status(401).json({ error: 'Invalid email or password' });

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            user: { _id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
            token
        });
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// --- Health Check ---
app.get('/api/health', (req, res) => {
    const hasKey = Boolean(process.env.GEMINI_API_KEY);
    res.json({
        status: 'ok',
        geminiKeyPresent: hasKey,
        modelConfigured: GEMINI_MODEL,
    });
});

// --- Google OAuth (accepts access_token or id_token) ---
app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'token is required' });

        if (typeof fetch === 'undefined') {
            return res.status(500).json({ error: 'Global fetch is unavailable. Use Node.js v18+ or install node-fetch.' });
        }

        let profile = null;
        let lastError = null;
        
        // Try as access_token with Google UserInfo
        try {
            const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (resp.ok) {
                profile = await resp.json();
                console.log('Google OAuth: Successfully verified access token');
            } else {
                lastError = `UserInfo API returned ${resp.status}: ${resp.statusText}`;
            }
        } catch (error) {
            lastError = `UserInfo API error: ${error.message}`;
        }

        // If not access_token, try as id_token via tokeninfo endpoint
        if (!profile) {
            try {
                const resp2 = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
                if (resp2.ok) {
                    const data = await resp2.json();
                    profile = {
                        sub: data.sub,
                        email: data.email,
                        name: data.name || (data.email ? data.email.split('@')[0] : 'Google User'),
                        picture: data.picture,
                    };
                    console.log('Google OAuth: Successfully verified ID token');
                } else {
                    lastError = `TokenInfo API returned ${resp2.status}: ${resp2.statusText}`;
                }
            } catch (error) {
                lastError = `TokenInfo API error: ${error.message}`;
            }
        }

        if (!profile || !profile.email) {
            console.error('Google OAuth verification failed:', lastError);
            return res.status(400).json({ 
                error: 'Unable to verify Google token',
                details: lastError 
            });
        }

        let user = await User.findOne({ email: profile.email });
        if (!user) {
            const randomPass = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
            user = new User({
                name: profile.name || 'Google User',
                email: profile.email,
                password: randomPass,
            });
            await user.save();
        }

        const jwtToken = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Google login successful',
            user: { _id: user._id, name: user.name, email: user.email, createdAt: user.createdAt, avatar: profile.picture },
            token: jwtToken,
        });
    } catch (error) {
        console.error('Error in /api/auth/google:', error);
        res.status(500).json({ error: 'Server error during Google auth' });
    }
});

// --- User Profile Routes (protected) ---
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ profile: user.profile || {}, profileComplete: !!user.profileComplete });
    } catch (error) {
        console.error('Error in GET /api/user/profile:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const allowedFields = ['educationLevel','fieldOfStudy','institution','yearOfCompletion','currentStatus','workExperience','skills','interests','careerGoals','preferredWorkEnvironment','preferredWorkLocation','salaryExpectations','willingToRelocate'];
        const payload = req.body || {};
        const profile = {};
        for (const key of allowedFields) {
            if (payload[key] !== undefined) profile[key] = payload[key];
        }
        const profileComplete = Boolean(
            profile.educationLevel && profile.fieldOfStudy && profile.institution && profile.currentStatus && (Array.isArray(profile.skills) ? profile.skills.length > 0 : !!profile.skills) && (Array.isArray(profile.interests) ? profile.interests.length > 0 : !!profile.interests) && profile.careerGoals
        );

        const updated = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: { profile, profileComplete } },
            { new: true }
        ).select('-password');

        if (!updated) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'Profile updated', profile: updated.profile || {}, profileComplete: !!updated.profileComplete });
    } catch (error) {
        console.error('Error in POST /api/user/profile:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- AI Chat Route (Fixed) ---
app.post('/api/chat', async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
        }
        
        const { history, message, systemPrompt, expectJson } = req.body || {};
        console.log('Received chat request:', { message, systemPrompt, expectJson });
        
        // Helper to extract first JSON object/array from text
        const extractJsonSnippet = (text) => {
            if (!text || typeof text !== 'string') return null;
            // Strip fenced code blocks if present
            let cleaned = text.replace(/```json[\s\S]*?```/gi, (m) => m.replace(/```json|```/gi, ''))
                              .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
                              .trim();
            // Find first [{ or { then match until last ]} plausibly
            const startIdx = cleaned.search(/[\[{]/);
            if (startIdx === -1) return null;
            cleaned = cleaned.slice(startIdx);
            // Try progressively to parse by trimming to last closing brace/bracket
            for (let i = cleaned.length; i > 0; i--) {
                const candidate = cleaned.slice(0, i).trim();
                try {
                    const parsed = JSON.parse(candidate);
                    return parsed;
                } catch (_) { /* keep shrinking */ }
            }
            return null;
        };

        console.log(`[AI] Using model: ${GEMINI_MODEL}`);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        // Build the prompt with system instructions
        let fullPrompt = message;
        if (systemPrompt) {
            fullPrompt = `${systemPrompt}\n\n${message}`;
        }
        if (expectJson) {
            fullPrompt = `You are a strict JSON generator. Reply with ONLY valid minified JSON matching the request. No prose, no markdown, no code fences.\n\n${fullPrompt}`;
        }

        // For chat with history, use the chat session
        if (Array.isArray(history) && history.length > 0) {
            // Filter and validate chat history
            const validHistory = history
                .filter(msg => msg && msg.sender && msg.text) // Remove invalid messages
                .map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                }));
            
            // Ensure the first message is from user (Gemini requirement)
            if (validHistory.length > 0 && validHistory[0].role !== 'user') {
                console.warn('[AI] First message in history is not from user, using generateContent instead');
                // Fall back to generateContent if history doesn't start with user
                const result = await model.generateContent(fullPrompt);
                const text = result.response.text();
                
                let json = null;
                if (expectJson) {
                    json = extractJsonSnippet(text);
                    if (!json) {
                        console.warn(`[AI] Failed to parse JSON from model response: ${text}`);
                    }
                }

                return res.json({ response: text, modelUsed: GEMINI_MODEL, json });
            }
            
            try {
                const chat = model.startChat({ history: validHistory });
                const result = await chat.sendMessage(fullPrompt);
                const text = result.response.text();
                
                let json = null;
                if (expectJson) {
                    json = extractJsonSnippet(text);
                    if (!json) {
                        console.warn(`[AI] Failed to parse JSON from model response: ${text}`);
                    }
                }

                return res.json({ response: text, modelUsed: GEMINI_MODEL, json });
            } catch (historyError) {
                console.warn('[AI] Chat history error, falling back to generateContent:', historyError.message);
                // Fall back to generateContent if chat history fails
                const result = await model.generateContent(fullPrompt);
                const text = result.response.text();
                
                let json = null;
                if (expectJson) {
                    json = extractJsonSnippet(text);
                    if (!json) {
                        console.warn(`[AI] Failed to parse JSON from model response: ${text}`);
                    }
                }

                return res.json({ response: text, modelUsed: GEMINI_MODEL, json });
            }
        } else {
            // For single message, use generateContent
            const result = await model.generateContent(fullPrompt);
            const text = result.response.text();
            
            let json = null;
            if (expectJson) {
                json = extractJsonSnippet(text);
                if (!json) {
                    console.warn(`[AI] Failed to parse JSON from model response: ${text}`);
                }
            }

            return res.json({ response: text, modelUsed: GEMINI_MODEL, json });
        }

    } catch (error) {
        console.error(`Error in /api/chat with model ${GEMINI_MODEL}:`, error);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to get response from AI. Check server logs.';
        if (error.message?.includes('API_KEY')) {
            errorMessage = 'Invalid API key. Please check your Gemini API key configuration.';
        } else if (error.message?.includes('quota')) {
            errorMessage = 'API quota exceeded. Please try again later.';
        } else if (error.message?.includes('model')) {
            errorMessage = 'Invalid model specified. Please check the model configuration.';
        }
        
        res.status(500).json({ error: errorMessage });
    }
});


// --- Admin Panel API Routes ---
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalJobs = await Job.countDocuments();
        const totalCompanies = await Company.countDocuments();
        const totalApplications = await Application.countDocuments();
        res.json({ totalUsers, totalJobs, totalCompanies, totalApplications });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ error: 'Server error fetching stats.' });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Server error fetching users.' });
    }
});

app.get('/api/admin/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.json(jobs);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Server error fetching jobs.' });
    }
});

app.get('/api/admin/companies', async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 });
        res.json(companies);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Server error fetching companies.' });
    }
});

app.get('/api/admin/applications', async (req, res) => {
    try {
        const applications = await Application.find()
            .populate('jobId', 'title company')
            .populate('userId', 'name email')
            .sort({ appliedAt: -1 });
        res.json(applications);
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Server error fetching applications.' });
    }
});

// --- Sample Data Creation ---
async function createSampleData() {
    try {
        const userCount = await User.countDocuments();
        const jobCount = await Job.countDocuments();
        const companyCount = await Company.countDocuments();

        if (userCount === 0) {
            const pw = await bcrypt.hash('password123', 10);
            await User.create([
                { name: 'John Doe', email: 'john@example.com', password: pw },
                { name: 'Jane Smith', email: 'jane@example.com', password: pw },
                { name: 'Bob Johnson', email: 'bob@example.com', password: pw }
            ]);
            console.log('Sample users created (with hashed passwords)');
        }

        if (companyCount === 0) {
            await Company.create([
                { name: 'TechCorp', industry: 'Technology', size: 'large' },
                { name: 'StartupXYZ', industry: 'Software', size: 'startup' },
                { name: 'Global Solutions', industry: 'Consulting', size: 'medium' }
            ]);
            console.log('Sample companies created');
        }

        if (jobCount === 0) {
            await Job.create([
                { title: 'Senior Developer', company: 'TechCorp', location: 'San Francisco, CA', status: 'active' },
                { title: 'Product Manager', company: 'StartupXYZ', location: 'New York, NY', status: 'active' },
                { title: 'Data Analyst', company: 'Global Solutions', location: 'Remote', status: 'draft' }
            ]);
            console.log('Sample jobs created');
        }

    } catch (error) {
        console.error('Error creating sample data:', error);
    }
}

// --- Start the server (after DB is ready) ---
function startServer() {
    app.listen(port, () => {
        console.log(`Backend server is running on http://localhost:${port}`);
        console.log('Admin panel available at: http://localhost:5001/api/admin/*');
        console.log('Auth endpoints available at: http://localhost:5001/api/auth/*');
        createSampleData();
    });
}