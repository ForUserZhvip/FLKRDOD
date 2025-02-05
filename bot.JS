// --- bot.js (Heroku - Webhooks - Kurdish) ---
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const LocalSession = require('telegraf-session-local');  // For Heroku session
const express = require('express'); // Required for webhook server
const pino = require('pino'); // Use pino directly

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEVELOPER_NAME = process.env.DEVELOPER_NAME;
const BOT_NAME = process.env.BOT_NAME;
const PORT = process.env.PORT || 3000; // Get port from environment
const WEBHOOK_PATH = '/secret-webhook-path'; // Choose a secret path
const WEBHOOK_URL = process.env.HEROKU_APP_URL + WEBHOOK_PATH; // Your Heroku app URL
const DEVELOPER_TELEGRAM = "@shaho0000o"; // Developer's Telegram handle


// Initialize Pino logger
const logging = pino({
    level: process.env.LOG_LEVEL || 'info', // Set log level from environment or default to 'info'
    transport: {
        target: 'pino-pretty', // Use pino-pretty for better console output
        options: {
            colorize: true,
        }
    },
});


if (!TELEGRAM_TOKEN || !GEMINI_API_KEY || !process.env.HEROKU_APP_URL) {
    logging.fatal('Missing environment variables (TELEGRAM_TOKEN, GEMINI_API_KEY, or HEROKU_APP_URL)');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });
const bot = new Telegraf(TELEGRAM_TOKEN);

// Use telegraf-session-local for Heroku.
const localSession = new LocalSession({ database: 'sessions.json' });
bot.use(localSession.middleware());

// --- Function generateResponse (Kurdish) ---
async function generateResponse(prompt, user_data) {
    if (!model) {
        return "ببورە، Gemini API ڕێک نەخراوە.";
    }

    if (prompt.toLowerCase().includes("kê to drust krduy") ||
        prompt.toLowerCase().includes("who created you") ||
        prompt.toLowerCase().includes("کێ دروستی کردی")) {
        return `I was created by developer ${DEVELOPER_NAME}. Contact: ${DEVELOPER_TELEGRAM}`;
    }

    let geminiPrompt = `تکایە وەڵامی ئەم پرسیارە بە کوردی سۆرانی بدەرەوە:\n\n`;

    if (user_data.conversation_history) {
        geminiPrompt += user_data.conversation_history.map(entry => {
            // No need to check prefixes, Gemini handles context well.  Just use the whole entry.
            return entry;
        }).join("\n") + "\n";
    }

    geminiPrompt += "بەکارهێنەر: " + prompt;  // Always add the current user prompt

    try {
        const result = await model.generateContent(geminiPrompt);
        const response = result.response.text();
        return response;
    } catch (error) {
        logging.error(`Error generating content: ${error}`);
        if (error.response && error.response.status === 429) {
            return "ببورە، زۆر داواکاریت ناردووە.  تکایە کەمێکی تر هەوڵ بدەوە.";
        }
        return "هەڵەیەک ڕوویدا لەکاتی پرۆسێسکردنی داواکارییەکەت.";
    }
}

// --- Handlers (Kurdish) ---

bot.start(async (ctx) => {
    const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('یارمەتی', 'help'),
        Markup.button.callback('دەربارە', 'about'),
        Markup.button.callback('دەستپێکردنی کویز', 'start_quiz')
    ]);
    // Use optional chaining and nullish coalescing for safety
    await ctx.reply(`سڵاو ${ctx.from?.first_name ?? 'بەڕێز'}، من ${BOT_NAME}م. چۆن ئەتوانم یارمەتیت بدەم؟`, keyboard);
});

bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    // Use a consistent message format.
    await ctx.editMessageText("ئەتوانم وەڵامی پرسیارەکانت بدەمەوە، زانیاریت پێبدەم، یان کویزێک دەستپێبکەم.", { parse_mode: 'Markdown' });
});

bot.action('about', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`من ${BOT_NAME}م، دروستکراوم بۆ یارمەتیدانت.  گەشەپێدەر: ${DEVELOPER_NAME} \n Telegram: ${DEVELOPER_TELEGRAM}`, { parse_mode: 'Markdown' });
});

bot.action('start_quiz', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText("ئامادەیت بۆ کویزێک؟ (بەڵێ/نەخێر)", { parse_mode: 'Markdown' });
    ctx.session.quizState = 'waiting_for_response';
});

bot.on('text', async (ctx) => {
    const userMessage = ctx.message.text;
    // Initialize session if it doesn't exist
    ctx.session ??= {};

    if (ctx.session.quizState === 'waiting_for_response') {
        if (userMessage.toLowerCase() === 'بەڵێ' || userMessage.toLowerCase() === 'yes') {
            await ctx.reply("پرسیاری یەکەم: ناوت چییە؟", { parse_mode: 'Markdown' });
            ctx.session.quizState = 'waiting_for_name';
        } else {
            await ctx.reply("باشە، ئاگادارم بکەرەوە کە ئامادە بوویت.", { parse_mode: 'Markdown' });
            delete ctx.session.quizState;
        }
        return;
    }

    if (ctx.session.quizState === 'waiting_for_name') {
        const name = userMessage;
        await ctx.reply(`خۆشحاڵ بووم بە ناسینت، ${name}!`, { parse_mode: 'Markdown' });
        delete ctx.session.quizState;
        return;
    }

    // Initialize conversation history if it doesn't exist
    ctx.session.conversation_history ??= [];


    const response = await generateResponse(userMessage, ctx.session);
    ctx.session.conversation_history.push(`بەکارهێنەر: ${userMessage}`);
    ctx.session.conversation_history.push(`${BOT_NAME}: ${response}`);
    // Limit conversation history to the last 20 entries (10 user, 10 bot) to avoid context length issues
    if (ctx.session.conversation_history.length > 20) {
        ctx.session.conversation_history = ctx.session.conversation_history.slice(-20);
    }

    await ctx.reply(response, { parse_mode: 'Markdown' });
});

bot.catch((err, ctx) => {
    logging.error(`Ooops, encountered an error for ${ctx.updateType}`, err);
    ctx.reply("داوای لێبوردن دەکەم، هەڵەیەک ڕوویدا.  تکایە دواتر هەوڵبدەرەوە.").catch(e => logging.error("Failed to send error message", e)); // Catch errors when sending the message
});

// --- Heroku Webhook Setup ---
const app = express();
app.use(express.json());

app.post(WEBHOOK_PATH, async (req, res) => {
    try {
        await bot.handleUpdate(req.body, res);
    } catch (err) {
        logging.error('Error handling update:', err);
        res.status(500).send('Internal Server Error'); // Send a 500 response
    }
});

app.get('/', (req, res) => {  // Add a simple health check
    res.send('Bot is running!');
});

app.listen(PORT, async () => { // Make this async
    logging.info(`Bot listening on port ${PORT}`);
    try {
        await bot.telegram.setWebhook(WEBHOOK_URL);
        logging.info('Webhook set successfully');
    } catch (err) {
        logging.error('Error setting webhook:', err);
    }
});

process.on('SIGINT', () => { bot.stop('SIGINT'); process.exit() });
process.on('SIGTERM', () => { bot.stop('SIGTERM'); process.exit() });