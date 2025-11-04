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

// --- Enhanced career detection and comprehensive response system ---
function checkIfCareerRelated(message) {
    if (!message || typeof message !== 'string') return false;
    
    const messageLower = message.toLowerCase();
    
    // Comprehensive career keywords
    const careerKeywords = [
        // Core career terms
        'career', 'job', 'work', 'profession', 'occupation', 'employment', 'workplace', 'vocation',
        'resume', 'cv', 'interview', 'hiring', 'recruitment', 'application', 'portfolio',
        
        // Skills and development
        'skill', 'skills', 'training', 'education', 'learning', 'course', 'certification', 'certificate',
        'experience', 'qualification', 'competency', 'expertise', 'development', 'upskill', 'reskill',
        'bootcamp', 'workshop', 'seminar', 'degree', 'diploma', 'license', 'accreditation',
        
        // Industry and roles
        'industry', 'company', 'business', 'role', 'position', 'title', 'responsibility', 'duties',
        'manager', 'engineer', 'developer', 'analyst', 'consultant', 'specialist', 'coordinator',
        'director', 'executive', 'supervisor', 'lead', 'senior', 'junior', 'intern', 'apprentice',
        
        // Career guidance terms
        'advice', 'guidance', 'recommendation', 'suggest', 'help', 'path', 'opportunity', 'options',
        'growth', 'promotion', 'salary', 'benefits', 'transition', 'change', 'switch', 'pivot',
        'advancement', 'progression', 'future', 'goals', 'planning', 'strategy',
        
        // Professional terms
        'professional', 'corporate', 'freelance', 'remote', 'office', 'team', 'project', 'client',
        'leadership', 'management', 'networking', 'mentor', 'colleague', 'coworker', 'boss',
        'startup', 'enterprise', 'nonprofit', 'government', 'public', 'private', 'sector',
        
        // Job search and application
        'apply', 'application', 'jobsearch', 'linkedin', 'indeed', 'glassdoor', 'headhunter',
        'recruiter', 'hr', 'human resources', 'onboarding', 'probation', 'contract', 'fulltime',
        'parttime', 'temporary', 'permanent', 'seasonal', 'gig', 'freelancing',
        
        // Compensation and benefits
        'wage', 'income', 'compensation', 'bonus', 'commission', 'equity', 'stock', 'options',
        'healthcare', 'insurance', 'retirement', '401k', 'pension', 'pto', 'vacation', 'sick leave',
        
        // Work environment
        'culture', 'environment', 'atmosphere', 'values', 'mission', 'vision', 'diversity',
        'inclusion', 'worklife', 'balance', 'flexibility', 'hybrid', 'onsite', 'wfh',
        
        // Performance and evaluation
        'performance', 'review', 'evaluation', 'feedback', 'goals', 'kpi', 'metrics', 'achievement',
        'recognition', 'award', 'accomplishment', 'success', 'failure', 'improvement',
        
        // Specific fields and technologies
        'technology', 'software', 'programming', 'coding', 'data', 'analytics', 'marketing',
        'sales', 'finance', 'accounting', 'design', 'creative', 'healthcare', 'education',
        'research', 'science', 'engineering', 'manufacturing', 'retail', 'hospitality',
        'construction', 'agriculture', 'transportation', 'logistics', 'legal', 'law'
    ];
    
    // Career-related phrases and questions
    const careerPhrases = [
        'what should i do', 'what can i do', 'how do i', 'how can i', 'where do i start',
        'i want to', 'i need to', 'help me', 'advice on', 'guidance on', 'tips for',
        'recommend', 'suggest', 'best way to', 'how to become', 'how to get into',
        'career path', 'job market', 'work from home', 'find a job', 'get a job',
        'change careers', 'switch jobs', 'new field', 'different industry',
        'improve my', 'develop my', 'learn about', 'study for', 'prepare for',
        'interview tips', 'resume help', 'cover letter', 'job application',
        'salary negotiation', 'pay raise', 'promotion', 'advancement',
        'work experience', 'internship', 'entry level', 'graduate program',
        'professional development', 'skill building', 'certification program',
        'industry trends', 'job outlook', 'employment opportunities',
        'networking tips', 'professional network', 'career fair', 'job fair',
        'work culture', 'company culture', 'workplace', 'office environment',
        'remote work', 'freelancing', 'consulting', 'entrepreneurship',
        'side hustle', 'passive income', 'career goals', 'professional goals'
    ];
    
    // Check for career keywords
    const hasCareerKeywords = careerKeywords.some(keyword => 
        messageLower.includes(keyword)
    );
    
    // Check for career-related phrases
    const hasCareerPhrases = careerPhrases.some(phrase => 
        messageLower.includes(phrase)
    );
    
    // Additional context-based detection
    const questionWords = ['what', 'how', 'where', 'when', 'why', 'which', 'who'];
    const hasQuestionWord = questionWords.some(word => messageLower.includes(word));
    
    // If it's a question and mentions any work-related context, likely career-related
    const workContext = ['study', 'learn', 'become', 'get', 'find', 'choose', 'decide', 'start'];
    const hasWorkContext = workContext.some(word => messageLower.includes(word));
    
    return hasCareerKeywords || hasCareerPhrases || (hasQuestionWord && hasWorkContext);
}

// --- Enhanced career response generator with comprehensive knowledge base ---
function generateEnhancedCareerPrompt(message, userProfile = null) {
    const currentYear = new Date().getFullYear();
    
    const basePrompt = `You are Careerion AI, an expert career guidance assistant with comprehensive knowledge across all industries, career paths, and professional development strategies. You have access to current job market data, industry trends, and best practices as of ${currentYear}.

## Your Core Expertise Areas:

### 🎯 Career Exploration & Planning
- Career assessment and personality-career matching
- Industry analysis and job market forecasting
- Career path mapping and milestone planning
- Skills gap analysis and development roadmaps
- Career pivot and transition strategies

### 💼 Job Search & Application Strategy
- Modern resume optimization (ATS-friendly formats)
- Cover letter personalization techniques
- LinkedIn profile optimization
- Interview preparation (behavioral, technical, case studies)
- Salary research and negotiation tactics
- Job search automation and tracking systems

### 📈 Professional Development
- Skills assessment using industry frameworks
- Certification and training program recommendations
- Leadership development pathways
- Personal branding and thought leadership
- Professional networking strategies
- Mentorship and coaching guidance

### 🏢 Industry-Specific Guidance
- Technology: Software development, data science, cybersecurity, AI/ML
- Healthcare: Clinical roles, healthcare administration, telemedicine
- Finance: Banking, investment, fintech, accounting
- Marketing: Digital marketing, content strategy, brand management
- Education: Teaching, administration, educational technology
- Engineering: Civil, mechanical, electrical, software engineering
- Creative: Design, writing, media production, arts management
- Business: Consulting, project management, operations, strategy

### 💰 Compensation & Benefits
- Salary benchmarking by role, location, and experience
- Benefits package evaluation and negotiation
- Equity compensation understanding
- Freelance and contract rate setting
- Career ROI analysis for education and certifications

### 🌐 Modern Work Trends
- Remote work best practices and opportunities
- Hybrid work arrangements and productivity
- Gig economy and freelancing strategies
- Entrepreneurship and startup guidance
- Work-life balance and career sustainability
- Diversity, equity, and inclusion in the workplace

## Response Guidelines:
1. **COMPREHENSIVE**: Provide detailed, multi-faceted responses that cover all relevant aspects
2. **ACTIONABLE**: Include specific steps, timelines, and measurable goals
3. **CURRENT**: Reference ${currentYear} job market trends, salary data, and industry developments
4. **PERSONALIZED**: Tailor advice based on user's background, goals, and constraints
5. **RESOURCEFUL**: Suggest specific tools, platforms, courses, and resources
6. **REALISTIC**: Provide honest assessments of challenges and realistic timelines
7. **STRUCTURED**: Organize responses with clear headings, bullet points, and logical flow

${userProfile ? `## User Profile Analysis:
**Educational Background**: ${userProfile.educationLevel || 'Not specified'} in ${userProfile.fieldOfStudy || 'Not specified'} from ${userProfile.institution || 'Not specified'}
**Career Stage**: ${userProfile.currentStatus || 'Not specified'}
**Experience Level**: ${userProfile.workExperience || 'Not specified'}
**Core Skills**: ${Array.isArray(userProfile.skills) && userProfile.skills.length > 0 ? userProfile.skills.join(', ') : 'Not specified'}
**Interests**: ${Array.isArray(userProfile.interests) && userProfile.interests.length > 0 ? userProfile.interests.join(', ') : 'Not specified'}
**Career Objectives**: ${userProfile.careerGoals || 'Not specified'}
**Work Environment Preference**: ${userProfile.preferredWorkEnvironment || 'Not specified'}
**Location Flexibility**: ${userProfile.preferredWorkLocation || 'Not specified'} (Willing to relocate: ${userProfile.willingToRelocate ? 'Yes' : 'No'})
**Compensation Expectations**: ${userProfile.salaryExpectations || 'Not specified'}

**Personalization Instructions**: Use this profile to provide highly targeted recommendations that align with the user's background, goals, and preferences. Reference their specific skills and interests when suggesting career paths or development opportunities.` : ''}

## User Question: "${message}"

## Required Response Structure:
Provide a comprehensive response that includes:
1. **Direct Answer**: Address the specific question asked
2. **Detailed Analysis**: Break down the topic with in-depth explanations
3. **Actionable Steps**: Provide a clear roadmap with specific actions
4. **Resources & Tools**: Suggest relevant platforms, courses, books, or tools
5. **Timeline & Milestones**: Include realistic timeframes for achieving goals
6. **Potential Challenges**: Identify obstacles and how to overcome them
7. **Success Metrics**: Define how to measure progress and success

Make your response detailed, practical, and immediately useful for career advancement.`;

    return basePrompt;
}

// --- Enhanced Career Recommendations Route ---
app.post('/api/career-recommendations', authMiddleware, async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
        }

        const { query, category } = req.body || {};
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required for career recommendations' });
        }

        // Get user profile for personalized recommendations
        const user = await User.findById(req.user.userId).select('profile name email');
        const userProfile = user?.profile;

        console.log(`[Career Recommendations] Processing query for user: ${user?.email}`);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        // Enhanced prompt for comprehensive career recommendations
        const enhancedPrompt = `You are Careerion AI, providing comprehensive career recommendations. 

User Profile:
- Name: ${user?.name || 'User'}
- Education: ${userProfile?.educationLevel || 'Not specified'} in ${userProfile?.fieldOfStudy || 'Not specified'}
- Current Status: ${userProfile?.currentStatus || 'Not specified'}
- Experience: ${userProfile?.workExperience || 'Not specified'}
- Skills: ${Array.isArray(userProfile?.skills) ? userProfile.skills.join(', ') : 'Not specified'}
- Interests: ${Array.isArray(userProfile?.interests) ? userProfile.interests.join(', ') : 'Not specified'}
- Career Goals: ${userProfile?.careerGoals || 'Not specified'}
- Work Environment Preference: ${userProfile?.preferredWorkEnvironment || 'Not specified'}
- Location Preference: ${userProfile?.preferredWorkLocation || 'Not specified'}
- Salary Expectations: ${userProfile?.salaryExpectations || 'Not specified'}

Query Category: ${category || 'General Career Guidance'}
User Question: "${query}"

Provide an extremely comprehensive response (minimum 800 words) that includes:

1. **Personalized Analysis** (based on their profile)
2. **Detailed Recommendations** (specific to their situation)
3. **Step-by-Step Action Plan** (with timelines)
4. **Skill Development Roadmap** (specific skills to learn)
5. **Industry Insights** (current trends and opportunities)
6. **Networking Strategies** (specific to their field)
7. **Resource Recommendations** (courses, certifications, books, platforms)
8. **Salary and Compensation Guidance** (market rates and negotiation tips)
9. **Potential Career Paths** (multiple options with pros/cons)
10. **Success Metrics and Milestones** (how to track progress)

Make this response extremely detailed, actionable, and valuable for their career development.`;

        const result = await model.generateContent(enhancedPrompt);
        const response = result.response.text();

        res.json({ 
            response,
            modelUsed: GEMINI_MODEL,
            userProfile: userProfile ? 'Used for personalization' : 'No profile available',
            category: category || 'General Career Guidance'
        });

    } catch (error) {
        console.error('Error in /api/career-recommendations:', error);
        res.status(500).json({ error: 'Failed to generate career recommendations' });
    }
});

// --- AI Chat Route (Enhanced) ---
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

        // Check if the message is career-related with enhanced detection
        const isCareerRelated = checkIfCareerRelated(message);
        
        if (!isCareerRelated && !expectJson) {
            return res.json({ 
                response: `I'm Careerion AI, your dedicated career guidance assistant! I'm here to provide comprehensive advice on:

🎯 **Career Exploration & Planning**
- Discovering career paths that match your interests and skills
- Industry insights and job market trends
- Career goal setting and strategic planning

💼 **Job Search & Applications**
- Resume and cover letter optimization
- Interview preparation and techniques
- Job search strategies and networking tips

📈 **Professional Development**
- Skills assessment and development recommendations
- Certification and training programs
- Leadership and management guidance

💰 **Career Advancement**
- Salary negotiation strategies
- Promotion and advancement tactics
- Career transition and pivot guidance

🎓 **Education & Training**
- Educational pathway recommendations
- Professional certifications and courses
- Skill-building resources and programs

Whether you're just starting your career, looking to make a change, or aiming for advancement, I'm here to provide detailed, actionable guidance tailored to your unique situation.

What specific aspect of your career journey would you like to explore today?`,
                modelUsed: GEMINI_MODEL 
            });
        }

        console.log(`[AI] Using model: ${GEMINI_MODEL}`);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        // Get user profile for personalized recommendations
        let userProfile = null;
        if (req.user && req.user.userId) {
            try {
                const user = await User.findById(req.user.userId).select('profile');
                userProfile = user?.profile;
            } catch (error) {
                console.log('Could not fetch user profile for personalization:', error.message);
            }
        }

        // Generate enhanced career-focused prompt
        let fullPrompt = message;
        if (systemPrompt) {
            fullPrompt = `${generateEnhancedCareerPrompt(message, userProfile)}\n\nAdditional Context: ${systemPrompt}`;
        } else {
            fullPrompt = generateEnhancedCareerPrompt(message, userProfile);
        }
        
        if (expectJson) {
            fullPrompt = `You are a strict JSON generator for career recommendations. Reply with ONLY valid minified JSON matching the request. No prose, no markdown, no code fences.\n\n${fullPrompt}`;
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