const Discord = require("discord.js");
const fs = require("fs");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const { DISCORD_PREFIX, DISCORD_TOKEN, GOOGLE_API_KEY } = process.env;
if (!DISCORD_PREFIX || !DISCORD_TOKEN || !GOOGLE_API_KEY) {
  console.log("Missing required environmental variable");
  return process.exit(0);
}

const knex = require("knex")({
  client: "sqlite3",
  connection: {
    filename: "./entities.sqlite",
  },
  useNullAsDefault: true,
});

const client = new Discord.Client();
let custPrefixes = new Map();

const readMe = fs.readFileSync("./README.md", "utf8");

async function startUp() {
  const hasSheetIds = await knex.schema.hasTable("sheet_ids");
  const hasCommands = await knex.schema.hasTable("commands");
  const hasPrefixes = await knex.schema.hasTable("prefixes");
  if (!hasSheetIds) {
    await knex.schema.createTable("sheet_ids", (table) => {
      table.string("associated_id").notNullable().primary();
      table.string("sheet_id").notNullable();
    });
  }
  if (!hasCommands) {
    await knex.schema.createTable("commands", (table) => {
      table.string("sheet_id").notNullable().primary();
      table.string("commands").notNullable();
    });
  }
  if (!hasPrefixes) {
    await knex.schema.createTable("prefixes", (table) => {
      table.string("associated_id").notNullable().primary();
      table.string("prefix").notNullable();
    });
  }

  /**load from file */
  const loadedPrefixes = await knex("prefixes").select();

  custPrefixes = new Map(loadedPrefixes);

  client.login(DISCORD_TOKEN);
}


async function getDoc(sheet_id) {
  /** get channels sheet */
  const doc = new GoogleSpreadsheet(sheet_id);
  doc.useApiKey(GOOGLE_API_KEY);
  await doc.loadInfo();
  return doc;
}

async function getSheetId(message) {
  let config = await knex("sheet_ids")
    .where({ associated_id: message.channel.id })
    .first();
  if (!config)
    config = await knex("sheet_ids")
      .where({ associated_id: message.guild.id })
      .first();
  if (!config || !config.sheet_id) return undefined;
  const hasCache = await knex.schema.hasTable(config.sheet_id);
  if (!hasCache) return undefined;
  return config.sheet_id;
}

async function getEntityEmbed(message, args) {
  const tab_name = args.shift();
  const entity_name = args.shift();

  const sheet_id = await getSheetId(message);
  if (!sheet_id)
    return "This channel or guild has no associated google sheets url.";

  const entity = await knex(sheet_id)
    .where({
      entity_name: tab_name,
      name: entity_name,
    })
    .first();
  console.log("entity", entity);

  if (!entity)
    return `Sorry, could not find an entity of the name ${entity_name} on the ${tab_name} sheet.`;

  const embed = new Discord.MessageEmbed().addFields(
    JSON.parse(entity.entity_details)
  );
  embed.setTitle(entity.name);
  if (entity.description) embed.setDescription(entity.description);
  return embed;
}

async function sendEntityInfo(message, args) {
  try {
    /** create the embed */
    const embed = await getEntityEmbed(message, args);
    return await message.reply(embed);
  } catch (e) {
    /** let them know what didn't exist or that there might be a typo */
    console.error(e);
    return await message.reply("Something went wrong");
  }
}

async function importSheet(sheet_id){
    await message.reply(
      "Importing sheet, this may take a while. You will be informed when it is complete."
    );
    await knex.schema.dropTableIfExists(sheet_id);
    await knex.schema.createTable(sheet_id, (table) => {
      table.string("uniq").notNullable().primary();
      table.string("name").notNullable();
      table.text("description");
      table.string("entity_name").notNullable();
      table.json("entity_details").notNullable();
    });

    const doc = await getDoc(sheet_id);
    const customCommandArr = [];
    const entities=[];
    for (const sheet of doc.sheetsByIndex) {
      if (sheet.title.startsWith("_")) continue;
      const rows = await sheet.getRows();
      if (
        !sheet.headerValues.includes("name") &&
        !sheet.headerValues.includes("Name")
      )
        continue;
      const filteredSheetHeaders = sheet.headerValues.filter(
        (curr) =>
          curr.toLowerCase() != "name" &&
          curr.toLowerCase() != "description" &&
          !curr.toLowerCase().startsWith("_")
      );
      customCommandArr.push(sheet.title);

      const hasDescription = (sheet.headerValues.includes('description') || sheet.headerValues.includes('Description'));
      const nameIndex = sheet.headerValues.includes("name") ? "name" : "Name";
      const descriptionIndex = sheet.headerValues.includes("description")
        ? "description"
        : "Description";

      for (const entity of rows) {
        if(!entity[nameIndex]) continue;
        const entity_details = Object.entries(entity).reduce((acc, col) => {
          if (col[0] && col[1] && filteredSheetHeaders.includes(col[0])) {
            acc.push({
              name: col[0],
              value: col[1],
              inline: true,
            });
          }
          return acc;
        }, []);
        const uniq = sheet.title+'_'+entity[nameIndex];
        let entityEntry = {
          uniq,
          name: entity[nameIndex],
          entity_name: sheet.title,
          entity_details: JSON.stringify(entity_details),
        }
        if(hasDescription){
          entityEntry.description = entity[descriptionIndex];
        }

        entities.push(
          knex(sheet_id).insert(entityEntry).onConflict("uniq").merge()
        );
      }
    }
    const commands = customCommandArr.join(", ");

    await knex("commands")
      .insert({
        sheet_id,
        commands,
      })
      .onConflict('sheet_id')
      .merge();

    /**create entities array */

    await Promise.all(entities);
}

const commands = {
  refresh: async function refreshDb(message, args) {
    const sheet_id = await getSheetId(message);
    await importSheet(sheet_id);
  },
  import: async function setUrl(message, args) {
    let sheet_id = new RegExp("/spreadsheets/d/([a-zA-Z0-9-_]+)").exec(
      args[1].trim()
    );
    if (sheet_id) {
      sheet_id = sheet_id[1];
    } else {
      return await message.reply("Not a valid url");
    }
    const isGlobal =
      args[2] &&
      args[2].toLowerCase().startsWith("guild") &&
      message.guild.available;
    if (
      isGlobal &&
      !message.member.permissions.has(Discord.Permissions.FLAGS.MANAGE_GUILD)
    )
      return await message.reply(
        "Sorry, you do not have permissions to make guild level decisions."
      );
    if (
      !message.member.permissions.has(Discord.Permissions.FLAGS.MANAGE_CHANNELS)
    )
      return await message.reply(
        "Sorry, you do not have permissions to make channel level decisions."
      );
    const associated_id = isGlobal ? message.guild.id : message.channel.id;
    await importSheet(sheet_id);
    await knex("sheet_ids")
      .insert({ associated_id, sheet_id })
      .onConflict("associated_id")
      .merge();

    return await message.reply("Sheet imported!");
  },
  prefix: async function setPrefix(message, args) {
    let prefix = args[1].trim();
    const isGlobal =
      args[2] &&
      args[2].toLowerCase().startsWith("guild") &&
      message.guild.available;
    if (
      isGlobal &&
      !message.member.permissions.has(Discord.Permissions.FLAGS.MANAGE_GUILD)
    )
      return await message.reply(
        "Sorry, you do not have permissions to make guild level decisions."
      );
    if (
      !message.member.permissions.has(Discord.Permissions.FLAGS.MANAGE_CHANNELS)
    )
      return await message.reply(
        "Sorry, you do not have permissions to make channel level decisions."
      );
    const associated_id = isGlobal ? message.guild.id : message.channel.id;
    if (!prefix) {
      const foundPrefix = custPrefixes.get(associated_id);
      if (!foundPrefix) return await message.reply(`Prefix is ${foundPrefix}`);
      return await message.reply(`Prefix is ${DISCORD_PREFIX}`);
    }
    custPrefixes.set(associated_id, prefix);
    return await message.reply(`Prefix has been updated to \`${prefix}\``);
  },
  help: async function help(message, args) {
    /** get channel info */
    const sheet_id = await getSheetId(message);
    if (sheet_id) {
      const customCommandList = await knex("commands")
        .where({ sheet_id })
        .first();
      const customReadMe =
        readMe + ("\n\n**Custom Commands**\n" + customCommandList.commands);

      return await message.reply({
        embed: {
          description: customReadMe,
        },
      });
    } else {
      return await message.reply({
        embed: {
          description: readMe,
        },
      });
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

  message.channel.startTyping();
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  if (Object.keys(commands).includes(args[0])) {
    await commands[args[0]](message, args);
  } else {
    await sendEntityInfo(message, args);
  }
  message.channel.stopTyping();
});

startUp();
