const fs = require('fs');

const telegram = require('./lib/telegram');
const isYoutubeLink = require('./lib/utils/isYoutubeLink');
const toMP3 = require('./lib/utils/toMP3');

const config = require('./lib/telegram/config');

let markedPost = new Set();

function getUpdates(prev = [], options = {limit: 100, allowed_updates: ['channel_post']}) {
    return telegram.getUpdates(options)
        .then(updates => {
            if (updates.result && Array.isArray(updates.result)) {
                const results = [...prev, ...updates.result];
                if (updates.result.length === 100) {
                    return getUpdates(results, {
                        ...options,
                        offset: updates.result[updates.result.length - 1].update_id + 1
                    });
                }
                return results;
            }
            return prev;
        });
}

function uploadAudio(audioName, chatId) {
    return telegram.sendAudio({chat_id: chatId}, `${__dirname}/${audioName}`);
}

function removeAudio(audioName) {
    fs.unlinkSync(audioName);
}

function getMessageText(elem) {
    return elem.channel_post ? elem.channel_post.text : elem.message.text;
}

function getChatId(elem) {
    return elem.channel_post ? elem.channel_post.chat.id : elem.message.chat.id;
}

function downloadYoutubeVideo(elem, options = '') {
    const {exec} = require("child_process");
    return new Promise((resolve, reject) => {
        exec(`youtube-dl ${options} ${getMessageText(elem)}`, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }
            if (stderr) {
                return reject(stderr);
            }
            resolve(stdout);
        });
    });
}

function checkYoutubeLink(elem) {
    return (elem.channel_post && isYoutubeLink(elem.channel_post.text)) ||
        (elem.message && isYoutubeLink(elem.message.text));
}

function process() {
    getUpdates().then(res => {
        const tmpMarkedPost = new Set();
        res.forEach(elem => {
            tmpMarkedPost.add(elem.update_id);
            if (checkYoutubeLink(elem) && !markedPost.has(elem.update_id)) {
                downloadYoutubeVideo(elem, '-x --audio-format mp3 --audio-quality 7 -q')
                    .then(() => downloadYoutubeVideo(elem, '--get-filename'))
                    .then(fileName => {
                        fileName = toMP3(fileName);
                        console.log(fileName);
                        return uploadAudio(fileName, getChatId(elem)).then(() => fileName);
                    })
                    .then(fileName => removeAudio(`${__dirname}/${fileName}`));
            }
        });
        markedPost = tmpMarkedPost;
    });
    setTimeout(process, config.updateInterval);
}

getUpdates().then(res => {
    res.forEach(elem => {
        if (checkYoutubeLink(elem)) {
            markedPost.add(elem.update_id);
        }
    });
    setTimeout(process, config.updateInterval);
});
