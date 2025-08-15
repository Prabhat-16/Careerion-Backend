// setup.js - Backend setup and testing script
const mongoose = require('mongoose');
require('dotenv').config();

async function setupBackend() {
    console.log('🚀 Setting up Careerion Backend...\n');

    // Check environment variables
    console.log('📋 Checking environment variables...');
    if (!process.env.MONGO_URI) {
        console.log('❌ MONGO_URI not found in .env file');
        console.log('   Please create a .env file with MONGO_URI=mongodb://localhost:27017/careerion');
        return;
    }
    
    if (!process.env.GEMINI_API_KEY) {
        console.log('⚠️  GEMINI_API_KEY not found in .env file');
        console.log('   AI features will not work without this key');
        console.log('   Get one from: https://makersuite.google.com/app/apikey');
    }

    console.log('✅ Environment variables checked\n');

    // Test MongoDB connection
    console.log('🗄️  Testing MongoDB connection...');
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB connected successfully!');
        
        // Test database operations
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`📊 Found ${collections.length} collections in database`);
        
        await mongoose.disconnect();
        console.log('✅ Database connection test completed\n');
        
    } catch (error) {
        console.log('❌ MongoDB connection failed:', error.message);
        console.log('\n🔧 Troubleshooting tips:');
        console.log('   1. Make sure MongoDB is running');
        console.log('   2. Check if the connection string is correct');
        console.log('   3. Try: mongodb://localhost:27017/careerion');
        console.log('   4. Or use MongoDB Atlas for cloud hosting');
        return;
    }

    console.log('🎉 Setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Open admin panel: http://localhost:5001');
    console.log('   3. Test endpoints: http://localhost:5001/api/admin/stats');
}

// Run setup if this file is executed directly
if (require.main === module) {
    setupBackend().catch(console.error);
}

module.exports = { setupBackend };
