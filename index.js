require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

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
    return res.send({...response.data, Webhook_Url: WEBHOOK_URL});
})

// Store last update for each chat (to prevent duplicate)
let last_update = 0;

// app.get('/matches', async (req, res) => {
//     let matches = await getMatches();
//     return res.send(matches);
// })


// Receive messages
app.post(URI, async (req, res) => {
    console.log(req.body, last_update);

    // Check if update is a message
    if (!req.body.message || !req.body.message.text) return res.send();

    const updateId = req.body.update_id;
    const chatId = req.body.message.chat.id;
    const messageText = req.body.message.text;

    // Check if update is repeated
    if(parseInt(updateId) > parseInt(last_update)){
        last_update = updateId;
    }
    else{
        return res.send();
    }

    let response_message = '';
    
    if (isBotCommand(req.body.message)) {
        if(messageText != '/start' && messageText != '/matches') response_message = 'Please enter a valid bot command.';
        if(messageText === '/matches'){
            // Send "Please wait while we get todays matches..." message to user
            axios.post(`${TELEGRAM_API}/sendMessage`, {
                chat_id: chatId,
                text: 'Please wait while we fetch today\'s matches...'
            })

            let matches = await getMatches();
            response_message = formatMatchesDetails(matches);
        }
    }
    
    //Respond to user
    if(response_message != ''){
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: response_message
        })
    }
    
    // Respond to Telegram server
    return res.send();
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


function formatMatchesDetails(matches){
    let message = '';
    matches.forEach(match => {
        message += `${match['time']}\n${match['team1']} -- ${match['team2']}\n\n`;
    });
    return message;
}