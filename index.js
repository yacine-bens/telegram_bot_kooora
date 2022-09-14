require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

// Telegram bot
const { TOKEN, VERCEL_URL } = process.env;
const SERVER_URL = `https://${VERCEL_URL}`;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const URI = `/webhook/${TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;

const app = express();
app.use(bodyParser.json());


// Set webhook manually by visiting link
app.get(`/setWebhook`, async (req, res) => {
    const response = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
    return res.send(response.data);
})

// Receive messages
app.post(URI, async (req, res) => {

})

app.listen(process.env.PORT || 5000);

function isBotCommand(msg) {
    if (msg.text.startsWith('/') && msg.entities) {
        for (let entity of msg.entities) {
            return entity.type === "bot_command";
        }
    }
    return false;
}