require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Telegram bot
const { TOKEN, SERVER_URL } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const URI = `/webhook/${TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;

const app = express();
app.use(bodyParser.json());


// MongoDB
const DB_URI = "mongodb+srv://vercel-admin-user:dKkJWnHudcEg8Q5c@cluster0.teexhmd.mongodb.net/test";
const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


// Receive messages
app.post(URI, async (req, res) => {
    console.log(req.body);

    // Check if update is a message
    if (!req.body.message || !req.body.message.text) return res.send();

    const updateId = req.body.update_id;
    const chatId = req.body.message.chat.id;
    const messageText = req.body.message.text;

    // Check if update is repeated
    let db = await client.connect();
    let collection = db.db('kooora').collection('updates');
    let result = await collection.findOne();
    if (parseInt(updateId) > parseInt(result.last_update)) {
        await collection.updateOne({ last_update: result.last_update }, { $set: { last_update: updateId } });
    }
    else {
        // repeated
        return res.send()
    }

    let response_message = '';

    if (isBotCommand(req.body.message)) {
        if (messageText != '/start' && messageText != '/matches') response_message = 'Please enter a valid bot command.';
        if (messageText === '/matches') {
            // Send "Please wait while we get todays matches..." message to user
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: 'Please wait while we fetch today\'s matches...'
            })

            res.send();

            let matches = await getMatches();
            response_message = formatMatchesDetails(matches);
        }
    }

    //Respond to user
    if (response_message != '') {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: response_message
        })
    }

    // Respond to Telegram server
    return res.send();
})


app.listen(process.env.PORT || 5000, async () => {
    console.log('App is listening on port', process.env.PORT || 5000);
    const response = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
    console.log({...response.data, webhook: WEBHOOK_URL});
});


function isBotCommand(msg) {
    if (msg.text.startsWith('/') && msg.entities) {
        for (let entity of msg.entities) {
            return entity.type === "bot_command";
        }
    }
    return false;
}


async function getMatches() {
    let matches = [];

    const res = await axios.get('https://www.kooora.com');

    const { document } = (new JSDOM(res.data)).window;
    let matchesScript = [...document.querySelectorAll('script')].filter(el => el.innerHTML.includes('match_box'))[0];
    let matchesIDs = matchesScript.innerHTML.split('var match_box = new Array (')[1].split(')')[0].split('\n').map(el => el.length < 10 ? null : el.split(',')[1]).filter(e => e != null);
    for (let matchId of matchesIDs) {
        let match = await getMatch(matchId);
        matches.push(match);
    }

    return matches;
}


async function getMatch(id) {
    let res = await axios.get('https://www.kooora.com/?m=' + id + '&ajax=true');
    let matchDetails = res.data.matches_list;
    let time = matchDetails[6].split('@')[0];
    let teamId1 = matchDetails[7];
    let teamId2 = matchDetails[12];
    let channels = matchDetails[19].split('~l|');
    // remove first element (referees and commentary details ...)
    channels.shift();
    channels = channels.map(channel => { return { id: channel.split('|')[0], name: channel.split('|')[1] } });
    let teamName1 = await getTeam(teamId1);
    let teamName2 = await getTeam(teamId2);

    const match = {
        time: time,
        team1: teamName1,
        team2: teamName2,
        channels: channels
    };

    return match;
}


async function getTeam(id) {
    let res = await axios.get('https://www.kooora.com/?team=' + id);
    let team = res.data.match(/var team_name_en = "(.*?)"/)[1];
    return team;
}


function formatMatchesDetails(matches) {
    let message = '';
    matches.forEach(match => {
        let time = cleanUpTime(match['time']);
        message += `${time}\n${match['team1']} -- ${match['team2']}\n\n`;
    });
    return message;
}


function cleanUpTime(time){
    let cleanedUpTime;
    const allowed_chars = [":", "'"];
    let special_chars = time.match(/\D/g);
    if(special_chars){
        special_chars.forEach(char => { if(!allowed_chars.includes(char)) cleanedUpTime = time.replace(char, '').trim()});
    }
    return cleanedUpTime;
}