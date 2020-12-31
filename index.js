const Discord = require("discord.js");
const { prefix, token, GOOGLE_API_KEY} = process.env;
const { GoogleSpreadsheet } = require("google-spreadsheet");

const client = new Discord.Client();

async function getEntityInfo(channel, tab_name) {
  /** get channel info */
  /** get channels sheet */
  const doc = new GoogleSpreadsheet("<the sheet ID from the url>");
  await doc.useApiKey(GOOGLE_API_KEY);

  await doc.loadInfo();
  /** check if tab exists */
  let db = doc.sheetsByTitle[tab_name];
  db = await db.getRows();
  /** check if row exists in tab */
  let row = db.find((el) => {
    el.name.startsWith(entity_name);
  });
  let entity_details = Object.entries(row).map((col) => ({
    name: col[0],
    value: col[1],
  }));
  entity_details.shift();
  return entity_details;
}

async function sendEntityInfo(message, args) {
  message.channel.startTyping();
  const tab_name = args.shift().toLowerCase();
  const entity_name = args.shift().toLowerCase();

  try {
    let entity_details = await getEntityInfo(message.channel, tab_name);
    /** output the embed */
    const embed = new Discord.MessageEmbed()
      .setTitle(entity_name)
      .addFields(entity_details);
    await message.reply(embed);
  } catch (e) {
    /** let them know what didn't exist or that there might be a typo */
    await message.reply(e);
  } finally {
    message.channel.stopTyping();
  }
}

client.once("ready", () => {
  console.log("Ready!");
});

client.on("message", (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  sendEntityInfo(message, args);
});

client.login(token);
