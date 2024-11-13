const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot is running!'));

app.listen(3000, () => console.log('Server is live!'));
const TelegramBot = 
require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const apiKey = '81fbce832e95946103d98af4'; 
// Replace 'YOUR_TELEGRAM_BOT_TOKEN' with your bot token
const bot = new TelegramBot('7260720134:AAFy1oJXLE7MbgGkbDPJvkoyDpvEB7nQBTI', { polling: true });

// Set up a list for tracking muted users
const mutedUsers = new Set();

// Anti-link feature variable
let antiLinkActive = false;

// Check if user is admin
const isAdmin = async (chatId, userId) => {
    try {
        const member = await bot.getChatMember(chatId, userId);
        return member.status === 'administrator' || member.status === 'creator';
    } catch (error) {
        return false;
    }
};

// Anti-link command
// Anti-link toggle commands (Admins only)
bot.onText(/\/antilink (on|off)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const action = match[1];

    // Check if the user is an admin
    if (await isAdmin(chatId, userId)) {
        if (action === 'on') {
            antiLinkActive = true;
            bot.sendMessage(chatId, "Anti-link is now activated!");
        } else if (action === 'off') {
            antiLinkActive = false;
            bot.sendMessage(chatId, "Anti-link is now deactivated!");
        }
    } else {
        bot.sendMessage(chatId, "You don't have permission to use this command.");
    }
});

// /dog command
bot.onText(/\/dog/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const response = await axios.get('https://dog.ceo/api/breeds/image/random');
        const dogUrl = response.data.message;
        bot.sendPhoto(chatId, dogUrl);
    } catch (error) {
        bot.sendMessage(chatId, 'Could not fetch a dog picture at the moment. Please try again later.');
    }
});

// Function to get currency conversion rate from ExchangeRate-API
async function getCurrencyConversion(amount, fromCurrency, toCurrency) {
  try {
    // Request currency conversion data from ExchangeRate-API
    const response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/${fromCurrency}`);

    const rates = response.data.conversion_rates;
    const conversionRate = rates[toCurrency];

    if (conversionRate) {
      const convertedAmount = (amount * conversionRate).toFixed(2);
      return `${amount} ${fromCurrency} = ${convertedAmount} ${toCurrency}`;
    } else {
      return `Sorry, I couldn't find the conversion rate for ${toCurrency}.`;
    }
  } catch (error) {
    console.error('Error fetching currency conversion:', error);
    return 'Oops! Something went wrong. Please try again later.';
  }
}

// Command handler for /currency
bot.onText(/\/currency (\d+\.?\d*) (\w+) to (\w+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const amount = parseFloat(match[1]);
  const fromCurrency = match[2].toUpperCase();
  const toCurrency = match[3].toUpperCase();

  // Validate the amount
  if (isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, 'Please provide a valid amount to convert. Example: /currency 100 USD to EUR');
    return;
  }

  const conversionResult = await getCurrencyConversion(amount, fromCurrency, toCurrency);
  bot.sendMessage(chatId, conversionResult);
});



// Flag to indicate when an admin has issued /setgrouppic
let awaitingGroupPic = new Map();

// /setgrouppic command (admins only)
bot.onText(/\/setgrouppic/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
        bot.sendMessage(chatId, 'This command can only be used in group chats.');
        return;
    }

    // Check if the user is an admin
    if (await isAdmin(chatId, userId)) {
        bot.sendMessage(chatId, 'Please send the new group picture as a photo.');
        awaitingGroupPic.set(chatId, userId); // Track the admin who issued the command
    } else {
        bot.sendMessage(chatId, "You don't have permission to use this command.");
    }
});

// Handle photo uploads for /setgrouppic
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Check if we are awaiting a photo from an admin
    if (awaitingGroupPic.get(chatId) === userId) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;

        try {
            const file = await bot.getFile(photoId);
            const downloadPath = await bot.downloadFile(photoId, './');

            await bot.setChatPhoto(chatId, fs.createReadStream(downloadPath));
            bot.sendMessage(chatId, 'Group picture updated successfully!');

            // Clean up
            fs.unlinkSync(downloadPath);
            awaitingGroupPic.delete(chatId); // Remove the flag after setting the picture
        } catch (error) {
            console.error('Error:', error);
            bot.sendMessage(chatId, 'Failed to update group picture. Make sure I have the required permissions.');
        }
    }
});

// Kick command
bot.onText(/\/kick/, async (msg) => {
    const chatId = msg.chat.id;

    if (msg.reply_to_message) {
        const userId = msg.reply_to_message.from.id; // User to kick must be mentioned in reply
        const requesterId = msg.from.id; // ID of the person issuing the command

        if (await isAdmin(chatId, requesterId)) {
            try {
                await bot.kickChatMember(chatId, userId);
                bot.sendMessage(chatId, "User has been kicked.");
                // Optionally, unban the user immediately to allow them to rejoin if necessary
                setTimeout(() => {
                    bot.unbanChatMember(chatId, userId);
                }, 1000);
            } catch (err) {
                console.error("Failed to kick user:", err);
                bot.sendMessage(chatId, "Failed to kick user. Ensure I have appropriate permissions.");
            }
        } else {
            bot.sendMessage(chatId, "You don't have permission to use this command.");
        }
    } else {
        bot.sendMessage(chatId, "Please reply to a user's message to kick them.");
    }
});

// Mute command
// Mute command
bot.onText(/\/mute/, async (msg) => {
    const chatId = msg.chat.id;
    const requesterId = msg.from.id;

    // Check if the user issuing the command is an admin
    if (await isAdmin(chatId, requesterId)) {
        if (msg.reply_to_message) {
            const userId = msg.reply_to_message.from.id; // User to mute must be mentioned in reply
            mutedUsers.add(userId);
            bot.sendMessage(chatId, `User has been muted.`);
        } else {
            bot.sendMessage(chatId, "Please reply to a user's message to mute them.");
        }
    } else {
        bot.sendMessage(chatId, "You don't have permission to use this command.");
    }
});

// Function to get anime details from Jikan API
async function getAnimeInfo(animeName) {
  try {
    const response = await axios.get(`https://api.jikan.moe/v4/anime?q=${animeName}&limit=1`);
    const anime = response.data.data[0];
    if (anime) {
      const title = anime.title;
      const synopsis = anime.synopsis;
      const rating = anime.rating;
      const imageUrl = anime.images.jpg.image_url;
      const url = anime.url;

      return {
        info: `*${title}*\n\n${synopsis}\n\n*Rating:* ${rating}\n\n[More Info](${url})`,
        imageUrl: imageUrl,
      };
    } else {
      return { info: 'No anime found with that name.', imageUrl: null };
    }
  } catch (error) {
    console.error('Error fetching anime info:', error);
    return { info: 'Oops! Something went wrong.', imageUrl: null };
  }
}

// Command handler for /anime
bot.onText(/\/anime (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const animeName = match[1];

  const { info, imageUrl } = await getAnimeInfo(animeName);

  // Send the information as a message
  bot.sendMessage(chatId, info, { parse_mode: 'Markdown' });

  // If an image URL is available, send the image
  if (imageUrl) {
    bot.sendPhoto(chatId, imageUrl);
  }
});



// Unmute command
bot.onText(/\/unmute/, (msg) => {
    const chatId = msg.chat.id;
    if (msg.reply_to_message) {
        const userId = msg.reply_to_message.from.id; // User to unmute must be mentioned in reply
        mutedUsers.delete(userId);
        bot.sendMessage(chatId, `User has been unmuted.`);
    } else {
        bot.sendMessage(chatId, "Please reply to a user's message to unmute them.");
    }
});

// Promote command
bot.onText(/\/promote/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.reply_to_message) {
        const userId = msg.reply_to_message.from.id; // User to promote must be mentioned in reply
        if (await isAdmin(chatId, msg.from.id)) {
            try {
                await bot.promoteChatMember(chatId, userId, {
                    can_change_info: true,
                    can_post_messages: true,
                    can_edit_messages: true,
                    can_delete_messages: true,
                    can_invite_users: true,
                    can_restrict_members: true,
                    can_pin_messages: true,
                    can_promote_members: true
                });
                bot.sendMessage(chatId, "User has been promoted to admin.");
            } catch (err) {
                bot.sendMessage(chatId, "Failed to promote user.");
            }
        } else {
            bot.sendMessage(chatId, "You don't have permission to use this command.");
        }
    } else {
        bot.sendMessage(chatId, "Please reply to a user's message to promote them.");
    }
});

// Demote command
bot.onText(/\/demote/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.reply_to_message) {
        const userId = msg.reply_to_message.from.id; // User to demote must be mentioned in reply
        if (await isAdmin(chatId, msg.from.id)) {
            try {
                await bot.promoteChatMember(chatId, userId, {
                    can_change_info: false,
                    can_post_messages: false,
                    can_edit_messages: false,
                    can_delete_messages: false,
                    can_invite_users: false,
                    can_restrict_members: false,
                    can_pin_messages: false,
                    can_promote_members: false
                });
                bot.sendMessage(chatId, "User has been demoted.");
            } catch (err) {
                bot.sendMessage(chatId, "Failed to demote user.");
            }
        } else {
            bot.sendMessage(chatId, "You don't have permission to use this command.");
        }
    } else {
        bot.sendMessage(chatId, "Please reply to a user's message to demote them.");
    }
});

// Set name command
bot.onText(/\/setname (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const newName = match[1];
    if (await isAdmin(chatId, msg.from.id)) {
        try {
            await bot.setChatTitle(chatId, newName);
            bot.sendMessage(chatId, `Group name has been changed to "${newName}".`);
        } catch (err) {
            bot.sendMessage(chatId, "Failed to change group name.");
        }
    } else {
        bot.sendMessage(chatId, "You don't have permission to use this command.");
    }
});

// /meme command
bot.onText(/\/meme/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const response = await axios.get('https://meme-api.herokuapp.com/gimme');
        const memeUrl = response.data.url;
        bot.sendPhoto(chatId, memeUrl);
    } catch (error) {
        bot.sendMessage(chatId, 'Could not retrieve a meme at the moment. Please try again later.');
    }
});

// /joke command
bot.onText(/\/joke/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
        const joke = `${response.data.setup} - ${response.data.punchline}`;
        bot.sendMessage(chatId, joke);
    } catch (error) {
        bot.sendMessage(chatId, 'Failed to fetch a joke. Please try again later.');
    }
});

// Tag all command
bot.onText(/\/tagall/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isAdmin(chatId, msg.from.id)) {
        const members = await bot.getChatAdministrators(chatId);
        const memberMentions = members.map(member => {
            return member.user.username ? `@${member.user.username}` : member.user.first_name;
        }).join(', ');
        
        bot.sendMessage(chatId, `Tagging all members:\n${memberMentions}`);
    } else {
        bot.sendMessage(chatId, "You don't have permission to use this command.");
    }
});

// Define the /Aza command
bot.onText(/\/Aza/, (msg) => {
    const chatId = msg.chat.id;
    const response = "8023846035 PALMPAY\nPlease support the YUNG B's-co-operation.";

    // Send the message
    bot.sendMessage(chatId, response);
});

// Define the /owner command
bot.onText(/\/owner/, (msg) => {
    const chatId = msg.chat.id;
    const response = "bow before the almighty ꧁༺KING YUNG ༻꧂🚼.";

    // Send the message
    bot.sendMessage(chatId, response);
});

// /setdescription command
bot.onText(/\/setdescription (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const description = match[1];

  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
    bot.sendMessage(chatId, 'This command can only be used in group chats.');
    return;
  }

  // Check if the user is an admin
  bot.getChatMember(chatId, msg.from.id).then(member => {
    if (member.status === 'administrator' || member.status === 'creator') {
      bot.setChatDescription(chatId, description)
        .then(() => {
          bot.sendMessage(chatId, 'Group description updated successfully!');
        })
        .catch((error) => {
          console.error('Error:', error);
          bot.sendMessage(chatId, 'Failed to update group description. Make sure I have the required permissions.');
        });
    } else {
      bot.sendMessage(chatId, 'Only group admins can use this command.');
    }
  }).catch(error => {
    console.error('Error fetching chat member:', error);
    bot.sendMessage(chatId, 'An error occurred while verifying your admin status.');
  });
});

// Get link command
bot.onText(/\/getlink/, async (msg) => {
    const chatId = msg.chat.id;
    if (await isAdmin(chatId, msg.from.id)) {
        try {
            const link = await bot.exportChatInviteLink(chatId);
            bot.sendMessage(chatId, `Here is your invite link: ${link}`);
        } catch (err) {
            bot.sendMessage(chatId, "Failed to get the invite link.");
        }
    } else {
        bot.sendMessage(chatId, "You don't have permission to use this command.");
    }
});

// Welcome and goodbye messages
bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    msg.new_chat_members.forEach(user => {
        bot.sendMessage(chatId, `Welcome ${user.first_name} to the group!`);
    });
});

bot.on('left_chat_member', (msg) => {
    const chatId = msg.chat.id;
    const user = msg.left_chat_member;
    bot.sendMessage(chatId, `${user.first_name} has left the group.`);
});

// Anti-link functionality
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    // Check if anti-link is active
    if (antiLinkActive && msg.entities) {
        msg.entities.forEach(entity => {
            if (entity.type === "url") {
                bot.deleteMessage(chatId, msg.message_id)
                    .then(() => {
                        bot.sendMessage(chatId, "Links are not allowed in this group.");
                    })
                    .catch(err => {
                        console.error("Failed to delete message:", err);
                    });
            }
        });
    }

    // Mute functionality
    if (mutedUsers.has(msg.from.id)) {
        bot.deleteMessage(chatId, msg.message_id)
            .catch(err => {
                console.error("Failed to delete muted user message:", err);
            });
    }
});

// Delete message command
bot.onText(/\/delete/, async (msg) => {
    const chatId = msg.chat.id;

    if (msg.reply_to_message) {
        const messageId = msg.reply_to_message.message_id;

        try {
            await bot.deleteMessage(chatId, messageId);
            await bot.deleteMessage(chatId, msg.message_id); // Optionally delete the /delete command message too
            bot.sendMessage(chatId, 'Message deleted successfully.', { reply_to_message_id: msg.message_id });
        } catch (error) {
            bot.sendMessage(chatId, 'Failed to delete the message. Ensure I have the necessary permissions.', { reply_to_message_id: msg.message_id });
        }
    } else {
        bot.sendMessage(chatId, 'Please reply to a message you want to delete.', { reply_to_message_id: msg.message_id });
    }
});

// Start the bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Hi this is YUNG B's group manager bot! Use /help for available commands.");
});

// Store the start time when the bot starts
const startTime = Date.now();

// Command to get bot runtime
bot.onText(/\/runtime/, (msg) => {
    const chatId = msg.chat.id;
  
    // Calculate runtime
    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;

    // Send back the bot runtime
    bot.sendMessage(chatId, `The bot has been running for ${hours} hours, ${minutes} minutes, and ${seconds} seconds.`);
});

// /ping command
bot.onText(/\/ping/, (msg) => {
  const chatId = msg.chat.id;
  const start = Date.now(); // Record the start time

  bot.sendMessage(chatId, 'Pong! 🚼').then(() => {
    const end = Date.now(); // Record the end time
    const ping = end - start; // Calculate the difference in milliseconds
    bot.sendMessage(chatId, `Response time: ${ping} ms`);
  });
});

// Help command with GitHub-hosted image
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
Available commands:
- /kick: Kick a user from the group (reply to their message).🌀
- /mute: Mute a user (reply to their message).🌀
- /unmute: Unmute a user (reply to their message).🌀
- /promote: Promote a user to admin (reply to their message).🌀
- /demote: Demote an admin (reply to their message).🌀
- /setname <new name>: Change the group name.🌀
- /tagall: Tag all members of the group.🌀
- /getlink: Get the group invite link.🌀
- /antilink: Toggle anti-link feature.🌀
- /start: Start the bot and get the welcome message.🌀
- /help: Show this help message.🌀
- /owner: Show my handsome owner.🌀
- /Aza: Supports the bot owner.🌀
- /ping: Check the bot's response time.🌀
- /delete: to delete bad messages 🌀
- /setgrouppic: to change the group pictures🌀
- /setddescription: to change group descriptions🌀
- /runtime: to check the bot run time🌀
- /anime: to check anime updates🌀
- /currency: to check rate🌀
- /joke: to make random jokes🌀
- /meme: to get random memes🌀
- /dog: to get random dog photos🌀
`;

    // GitHub-hosted image URL
    const imageUrl = 'https://raw.githubusercontent.com/Johanlieb34/I-don-tire/refs/heads/main/Image/0.jpg';

    bot.sendPhoto(chatId, imageUrl, { caption: helpMessage });
});
