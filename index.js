const Discord = require("discord.js");
const { DISCORD_PREFIX, DISCORD_TOKEN, GOOGLE_API_KEY } = process.env;
const { GoogleSpreadsheet } = require("google-spreadsheet");

const client = new Discord.Client();

async function getEntityInfo(channel, tab_name, entity_name) {
  /** get channel info */
  /** get channels sheet */
  const doc = new GoogleSpreadsheet("THIS WILL BE CONFIGURABLE");
  doc.useApiKey(GOOGLE_API_KEY);
  await doc.loadInfo();

  /** check if tab exists */
  let db = doc.sheetsByTitle;
  let correct_tab_name = Object.keys(db).find((table) =>
    table.toLowerCase().startsWith(tab_name)
  );
  db = db[correct_tab_name];
  db = await db.getRows();

  /** check if row exists in tab */
  let row = db.find((el) => {
    return (
      el.Name.toLowerCase().startsWith(entity_name) ||
      el.name.toLowerCase().startsWith(entity_name)
    );
  });

  let entity_details = Object.entries(row).reduce((acc, col) => {
    if (col[0] && col[1] && row._sheet.headerValues.includes(col[0])) {
      acc.push({
        name: col[0],
        value: col[1],
        inline: true,
      });
    }
    return acc;
  }, []);

  return entity_details;
}

async function sendEntityInfo(message, args) {
  message.channel.startTyping();
  const tab_name = args.shift().toLowerCase();
  const entity_name = args.shift().toLowerCase();

  try {
    let entity_details = await getEntityInfo(
      message.channel,
      tab_name,
      entity_name
    );

    /** output the embed */
    const embed = new Discord.MessageEmbed().addFields(entity_details);

    await message.reply(embed);
  } catch (e) {
    /** let them know what didn't exist or that there might be a typo */
    console.log(e);
    await message.reply("Something went wrong");
  } finally {
    message.channel.stopTyping();
  }
}

client.once("ready", () => {
  console.log("Ready!");
});

client.on("message", async (message) => {
  if (!message.content.startsWith(DISCORD_PREFIX) || message.author.bot) return;

  const args = message.content.slice(DISCORD_PREFIX.length).trim().split(/ +/);
  await sendEntityInfo(message, args);
});

client.login(DISCORD_TOKEN);
