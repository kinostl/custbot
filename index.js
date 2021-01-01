const Discord = require("discord.js");
const fs = require("fs");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const { DISCORD_PREFIX, DISCORD_TOKEN, GOOGLE_API_KEY } = process.env;
if (!DISCORD_PREFIX || !DISCORD_TOKEN || !GOOGLE_API_KEY) {
  console.log("Missing required environmental variable");
  return process.exit(0);
}

const readMe = fs.readFileSync("./README.md", "utf8");

/**load from file */
const loadedUrls = JSON.parse(fs.readFileSync("./custUrls.js", "utf8"));
const loadedPrefixes = JSON.parse(fs.readFileSync("./custPrefixes.js", "utf8"));

const custUrls = new Map(loadedUrls);
const custPrefixes = new Map(loadedPrefixes);

const client = new Discord.Client();

async function getDoc(message) {
  /** get channel info */
  let sheetId = custUrls.get(message.channel.id);
  if (!sheetId) sheetId = custUrls.get(message.guild.id);
  if (!sheetId) return undefined;

  /** get channels sheet */
  const doc = new GoogleSpreadsheet(sheetId);
  doc.useApiKey(GOOGLE_API_KEY);
  await doc.loadInfo();
  return doc;
}

async function getEntityInfo(message, args) {
  const tab_name = args.shift().toLowerCase();
  const entity_name = args.shift().toLowerCase();

  /** get channel info */
  const doc = await getDoc(message);
  if (!doc)
    return await message.reply(
      "This channel or guild has no associated google sheets url."
    );

  /** check if tab exists */
  let sheets = doc.sheetsByTitle;
  let correct_tab_name = Object.keys(sheets).find((table) =>
    table.toLowerCase().startsWith(tab_name)
  );
  sheets = sheets[correct_tab_name];
  sheets = await sheets.getRows();

  /** check if row exists in tab */
  let row = sheets.find((el) => {
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

  try {
    let entity_details = await getEntityInfo(message, args);

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

const commands = {
  set: async function setUrl(message, args) {
    let url = new RegExp("/spreadsheets/d/([a-zA-Z0-9-_]+)").exec(
      args[1].trim()
    );
    if (url) {
      url = url[1];
    } else {
      return await message.reply("Not a valid url");
    }
    const isGlobal =
      args[2].toLowerCase().startsWith("guild") && message.guild.available;
    const associatedId = isGlobal ? message.guild.id : message.channel.id;

    custUrls.set(associatedId, url);
    return await message.reply("Custom URL set.");
  },
  prefix: async function setPrefix(message, args) {
    let prefix = args[1].trim();
    const isGlobal =
      args[2].toLowerCase().startsWith("guild") && message.guild.available;
    const associatedId = isGlobal ? message.guild.id : message.channel.id;
    if (!prefix) {
      const foundPrefix = custPrefixes.get(associatedId);
      if (!foundPrefix) return await message.reply(`Prefix is ${foundPrefix}`);
      return await message.reply(`Prefix is ${DISCORD_PREFIX}`);
    }
    custPrefixes.set(associatedId, prefix);
    return await message.reply(`Prefix has been updated to \`${prefix}\``);
  },
  help: async function help(message, args) {
    /** get channel info */
    const doc = await getDoc(message);
    if (doc) {
      const custReadMe =
        readMe +
        ("\n**Custom Commands\n" + Object.keys(doc.sheetsByTitle).join(", "));

      return await message.reply(custReadMe);
    } else {
      return await message.reply(readMe);
    }
  },
};

client.once("ready", () => {
  console.log("Ready!");
});

client.on("message", async (message) => {
  let prefix = custPrefixes.get(message.channel.id);
  if (!prefix) prefix = custPrefixes.get(message.guild.id);
  if (!prefix) prefix = DISCORD_PREFIX;
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  if (Object.keys(commands).includes(args[0])) {
    return await commands[args[0]](message, args);
  } else {
    return await sendEntityInfo(message, args);
  }
});

client.login(DISCORD_TOKEN);

function serialize(map) {
  return JSON.stringify(Array.from(Object.entries(map)));
}

function handleExit(exitCode) {
  /**write to file */
  const serializedCustUrls = serialize(custUrls);
  const serializedCustPrefixes = serialize(custPrefixes);
  fs.writeFileSync("./custUrls.js", serializedCustUrls, "utf8");
  fs.writeFileSync("./custPrefixes.js", serializedCustPrefixes, "utf8");
  console.log("Files written. Closing.");
  process.exit(exitCode);
}

process.on("uncaughtException", (err, origin) => {
  console.error(err);
  console.error(origin);
  handleExit(1);
});
process.on("unhandledRejection", (err, origin) => {
  console.error(err);
  console.error(origin);
  handleExit(1);
});
process.on("SIGTERM", () => {
  console.log("Shutting down");
  handleExit(0);
});
process.on("SIGINT", () => {
  console.log("Shutting down");
  handleExit(0);
});
