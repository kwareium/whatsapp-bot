const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const Groq = require('groq-sdk');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.get('/api/chat', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === 'my_secret_token_123') {
        res.send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});
setInterval(() => console.log("Bot is awake..."), 10000); // 10 sec me bot ko jagayega
app.use(cors());
app.use(express.json());

// GROQ AI SETUP
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.log('❌ DB Error:', err.message));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
    phone: String,
    products: [{ name: String, price: Number, keywords: [String] }]
});
const CustomerSchema = new mongoose.Schema({
    phone: String,
    ownerPhone: String,
    messages: [{ text: String, sender: String, time: Date }]
});

const User = mongoose.model('User', UserSchema);
const Customer = mongoose.model('Customer', CustomerSchema);

// --- BOT LOGIC ---
// META WEBHOOK VERIFICATION
app.get('/api/chat', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === 'rituraj_bot_123') {
        console.log('✅ Webhook Verified by Meta!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});
app.post('/api/chat', async (req, res) => {
    try {
        const ownerPhone = "9999999999";
        const customerPhone = "8888888888";
        const originalMessage = req.body.message;
        const userMessage = originalMessage.toLowerCase();

        // 1. Database me Owner ke products dhundho
        let ownerData = await User.findOne({ phone: ownerPhone });

        // 2. Keyword Check (Normal Bot - Turbo Fast)
        let keywordMatch = null;
        if (ownerData && ownerData.products.length > 0) {
            for (let prod of ownerData.products) {
                if (prod.keywords.some(kw => userMessage.includes(kw))) {
                    keywordMatch = prod;
                    break;
                }
            }
        }

        let botReply = "";

        if (keywordMatch) {
            // Keyword match hua -> Direct Database se jawab do
            botReply = `Aapne pucha hai ${keywordMatch.name}. Iska price hai ₹${keywordMatch.price}. Kya aap isko order karna chahte hain?`;
        } else {
            // Keyword nahi mila -> Groq AI ko bhejo
            let contextData = "Koi product nahi mila.";
            if (ownerData && ownerData.products.length > 0) {
                contextData = JSON.stringify(ownerData.products);
            }

            const aiPrompt = `Tu ek sales bot hai. Customer ne ye pucha: "${originalMessage}". Tere paas sirf ye products hain: ${contextData}. Agar customer kisi aur product ke baare me pooche jo list me nahi hai, toh politely bata ki "Sorry humare paas ye nahi hai". Sirf 1-2 lines me jawab de.`;

            const chatCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: aiPrompt }],
                model: "llama-3.3-70b-versatile"
            });
            
            botReply = chatCompletion.choices[0].message.content;
        }

        // 3. Customer ka data save karo
        let customerData = await Customer.findOne({ phone: customerPhone });
        if (!customerData) {
            customerData = new Customer({ phone: customerPhone, ownerPhone: ownerPhone, messages: [] });
        }
        customerData.messages.push({ text: originalMessage, sender: "customer", time: new Date() });
        customerData.messages.push({ text: botReply, sender: "bot", time: new Date() });
        await customerData.save();

        console.log(`💬 Cust: ${originalMessage} | 🤖 Bot: ${botReply}`);

        res.status(200).json({ reply: botReply });

    } catch (error) {
        console.error("Error: " + error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- PRODUCT ADD API ---
app.post('/api/add-product', async (req, res) => {
    try {
        const { ownerPhone, name, price, keywords } = req.body;
        let user = await User.findOne({ phone: ownerPhone });
        if (!user) user = new User({ phone: ownerPhone, products: [] });
        
        user.products.push({ name, price, keywords });
        await user.save();
        res.status(200).json({ message: "Product add ho gaya!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('🚀 Groq Hybrid Bot chal raha hai port ' + PORT + ' par'));