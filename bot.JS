const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Load environment variables
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Set these values in your code
const DEVELOPER_NAME = "Zana Farooq";
const BOT_NAME = "FLKRD AI";

// Initialize Gemini Model
let model;
if (GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-pro" });
} else {
    console.error("Gemini API key not found.  Please set the GEMINI_API_KEY environment variable.");
}

// ---  Gemini API Interaction  ---
async function generateResponse(prompt, user_data) {
    if (!model) {
        return "The Gemini API is not configured. Please check the logs for errors.";
    }

    if (prompt.toLowerCase().includes("who made you") || prompt.toLowerCase().includes("کێتۆی دروستکردوە")) {
        return `من درووستکراوم لەلایەن زانا فارۆق`;
    }

    // Add conversation history (and make it more robust)
    let fullPrompt = "";
    if (user_data && user_data.conversation_history && Array.isArray(user_data.conversation_history)) {
        fullPrompt = user_data.conversation_history.join('\n') + "\nUser: " + prompt;
    } else {
        fullPrompt = prompt; // If no history, just use the prompt
        //Initialize if it does not exit
        if(!user_data.conversation_history) user_data.conversation_history = [];
    }



    try {
        // Show processing message *before* the API call
        const processingMessage = await bot.sendMessage(user_data.chatId, "جاوەروانبە بۆ وەلام داناوە....."); // Store message for later editing

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();


        // Update the "Processing..." message with the actual response
        await bot.editMessageText(text, {
            chat_id: user_data.chatId,
            message_id: processingMessage.message_id,
        });


        return text; // Return the text for internal use (e.g., logging)

    } catch (error) {
        console.error("Error generating content with Gemini API:", error);
        //Also edit processing message if error occurs
        await bot.editMessageText(`Error: ${error.message}`, {
            chat_id: user_data.chatId,
            message_id: processingMessage.message_id,
        });
        return `Error: ${error.message}`; // Consistent error return
    }
}


// ---  Telegram Handler Functions ---

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// --- Start Command ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        inline_keyboard: [
            [{ text: "Help", callback_data: 'help' }],
            [{ text: "About", callback_data: 'about' }],
            [{ text: "Start Quiz", callback_data: 'start_quiz' }]
        ]
    };
    bot.sendMessage(chatId, `Hello ${msg.from.first_name}, I am ${BOT_NAME}. How can I assist you today?`, { reply_markup: keyboard });
});


// --- Callback Query Handler (Buttons) ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const user_data = bot.user_data || (bot.user_data = {}); // Initialize if not existing
    const chatUserData = user_data[chatId] || (user_data[chatId] = {});


    if (query.data === 'help') {
        bot.editMessageText("I can answer your questions, provide information, or start a quiz.", { chat_id: chatId, message_id: messageId });
    } else if (query.data === 'about') {
        bot.editMessageText(`I am ${BOT_NAME}, a bot created to help you.  My developer is ${DEVELOPER_NAME}.`, { chat_id: chatId, message_id: messageId });
    } else if (query.data === 'start_quiz') {
        bot.editMessageText("Are you ready for a quiz? (yes/no)", { chat_id: chatId, message_id: messageId });
        chatUserData.state = 'waiting_for_quiz_response';
    } else {
        bot.editMessageText("Invalid callback data.", { chat_id: chatId, message_id: messageId });
    }
    bot.answerCallbackQuery(query.id);
});



// --- Conversation Handler (Quiz) and General Message Handling ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const user_data = bot.user_data || (bot.user_data = {});
    const chatUserData = user_data[chatId] || (user_data[chatId] = {});

    // Store chatId for later use in generateResponse
    chatUserData.chatId = chatId;

    // Check if msg.text exists before accessing its properties
    if (msg.text) {
        // --- Quiz Logic ---
        if (chatUserData.state === 'waiting_for_quiz_response') {
            if (msg.text.toLowerCase() === 'yes') {
                bot.sendMessage(chatId, "First question: What is your name?");
                chatUserData.state = 'waiting_for_name';
            } else {
                bot.sendMessage(chatId, "Okay, let me know when you're ready.");
                delete chatUserData.state;
            }
        } else if (chatUserData.state === 'waiting_for_name') {
            chatUserData.name = msg.text;
            bot.sendMessage(chatId, `Nice to meet you, ${msg.text}!`);
            delete chatUserData.state;
        }
        // --- Command Handling (Ignore) ---
        else if (msg.text.startsWith('/')) {
            return;  // Already handled by specific command listeners
        }
        // --- General Message Handling (Gemini) ---
        else {
            if (!chatUserData.conversation_history) {
                chatUserData.conversation_history = [];
            }
            chatUserData.conversation_history.push(`User: ${msg.text}`);

            const response = await generateResponse(msg.text, chatUserData);

            if (response) {
                chatUserData.conversation_history.push(`${BOT_NAME}: ${response}`);
            }
        }
    } else {
        // Handle cases where msg.text is undefined (e.g., stickers, photos)
         console.log("Received a message without text:", msg);
         // You might want to send a message back to the user:
          bot.sendMessage(chatId, "I can only process text messages. Please send me text.");
    }
});


// --- Creator Command ---
bot.onText(/\/creator/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `I was created by developer ${DEVELOPER_NAME}.`);
});

// --- Error Handling (General) ---
bot.on("polling_error", (error) => {
    console.error("Polling error:", error);
});


console.log("Bot is running...");
