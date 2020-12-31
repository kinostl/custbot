const Discord = require("discord.js");
const { prefix, token } = require("./config.json");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const client = new Discord.Client();

async function callGoogle(message, args) {
  const sent = await message.channel.send("Looking up...");
  const tab_name = args.shift().toLowerCase();
  const entity_name = args.shift().toLowerCase();
  const doc = new GoogleSpreadsheet("<the sheet ID from the url>");
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY,
  });

  try {
    await doc.loadInfo();
    /** check if tab exists */
    let db = doc.sheetsByTitle[tab_name];
    db = await db.getRows();
    /** check if row exists in tab */
    let row = db.find((el) => {
      el.name == entity_name;
    });
    /** output the embed */
    const embed = new Discord.MessageEmbed()
      .setTitle(entity_name)
      .addFields(entity_details);
    await message.edit(embed);
  } catch (e) {
    /** let them know what didn't exist or that there might be a typo */
  }
}

client.once("ready", () => {
  console.log("Ready!");
});

client.on("message", (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  callGoogle(message, args);
});

client.login(token);
