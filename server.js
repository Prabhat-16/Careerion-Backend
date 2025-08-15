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

// --- Connect to your MongoDB Database ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected successfully.'))
    .catch(err => console.error('MongoDB connection error:', err));

// --- NEW: Define the User Schema and Model ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // In a real app, this would be hashed
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// --- NEW: Define Job Schema and Model ---
const jobSchema = new mongoose.Schema({
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, required: true },
    status: { type: String, enum: ['active', 'closed', 'draft'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.model('Job', jobSchema);

// --- NEW: Define Company Schema and Model ---
const companySchema = new mongoose.Schema({
    name: { type: String, required: true },
    industry: { type: String, required: true },
    size: { type: String, enum: ['startup', 'small', 'medium', 'large'], default: 'medium' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const Company = mongoose.model('Company', companySchema);

// --- NEW: Define Application Schema and Model ---
const applicationSchema = new mongoose.Schema({
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'reviewed', 'accepted', 'rejected'], default: 'pending' },
    appliedAt: { type: Date, default: Date.now }
});

const Application = mongoose.model('Application', applicationSchema);

// --- Set up the Google Gemini AI ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- NEW: User Authentication Routes ---

/**
 * @route   POST /api/auth/signup
 * @desc    User registration endpoint
 */
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ 
                error: 'All fields are required' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                error: 'Password must be at least 6 characters long' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                error: 'User with this email already exists' 
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create new user
        const newUser = new User({
            name,
            email,
            password: hashedPassword
        });

        await newUser.save();

        // Create JWT token
        const token = jwt.sign(
            { userId: newUser._id, email: newUser.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        // Return user data (without password) and token
        const userResponse = {
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            createdAt: newUser.createdAt
        };

        res.status(201).json({
            message: 'User created successfully',
            user: userResponse,
            token
        });

    } catch (error) {
        console.error('Error in signup:', error);
        res.status(500).json({ 
            error: 'Server error during signup' 
        });
    }
});

/**
 * @route   POST /api/auth/login
 * @desc    User login endpoint
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Email and password are required' 
            });
        }

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                error: 'Invalid email or password' 
            });
        }

        // Create JWT token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '7d' }
        );

        // Return user data (without password) and token
        const userResponse = {
            _id: user._id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt
        };

        res.json({
            message: 'Login successful',
            user: userResponse,
            token
        });

    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ 
            error: 'Server error during login' 
        });
    }
});

// --- API Endpoints ---

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

// --- NEW: Admin Panel API Routes ---

// Note: In a real application, you would add authentication middleware here
// to ensure only authorized admins can access these routes.

/**
 * @route   GET /api/admin/stats
 * @desc    Get basic statistics for the admin dashboard.
 */
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalJobs = await Job.countDocuments();
        const totalCompanies = await Company.countDocuments();
        const totalApplications = await Application.countDocuments();
        
        res.json({
            totalUsers: totalUsers,
            totalJobs: totalJobs,
            totalCompanies: totalCompanies,
            totalApplications: totalApplications
        });
    } catch (error) {
        console.error('Error fetching admin stats:', error);
        res.status(500).json({ error: 'Server error fetching stats.' });
    }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get a list of all users for the admin panel.
 */
app.get('/api/admin/users', async (req, res) => {
    try {
        const users = await User.find().select('-password'); // Find all users, exclude password
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Server error fetching users.' });
    }
});

/**
 * @route   GET /api/admin/jobs
 * @desc    Get a list of all jobs for the admin panel.
 */
app.get('/api/admin/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }); // Sort by newest first
        res.json(jobs);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Server error fetching jobs.' });
    }
});

/**
 * @route   GET /api/admin/companies
 * @desc    Get a list of all companies for the admin panel.
 */
app.get('/api/admin/companies', async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 });
        res.json(companies);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Server error fetching companies.' });
    }
});

/**
 * @route   GET /api/admin/applications
 * @desc    Get a list of all applications for the admin panel.
 */
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

// --- NEW: Sample Data Creation for Testing ---
// This will create some sample data when the server starts (only if collections are empty)

async function createSampleData() {
    try {
        // Check if we already have data
        const userCount = await User.countDocuments();
        const jobCount = await Job.countDocuments();
        const companyCount = await Company.countDocuments();

        if (userCount === 0) {
            // Create sample users
            await User.create([
                { name: 'John Doe', email: 'john@example.com', password: 'password123' },
                { name: 'Jane Smith', email: 'jane@example.com', password: 'password123' },
                { name: 'Bob Johnson', email: 'bob@example.com', password: 'password123' }
            ]);
            console.log('Sample users created');
        }

        if (companyCount === 0) {
            // Create sample companies
            await Company.create([
                { name: 'TechCorp', industry: 'Technology', size: 'large' },
                { name: 'StartupXYZ', industry: 'Software', size: 'startup' },
                { name: 'Global Solutions', industry: 'Consulting', size: 'medium' }
            ]);
            console.log('Sample companies created');
        }

        if (jobCount === 0) {
            // Create sample jobs
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

// --- Start the server and listen for requests ---
app.listen(port, () => {
    console.log(`Backend server is running on http://localhost:${port}`);
    console.log('Admin panel available at: http://localhost:5001/api/admin/*');
    console.log('Auth endpoints available at: http://localhost:5001/api/auth/*');
    
    // Create sample data after server starts
    createSampleData();
});
