import { Client, MessageEmbed, Permissions } from "discord.js";
import { readFileSync } from "fs";
import { GoogleSpreadsheet } from "google-spreadsheet";
import format from "string-format";
import Knex from "knex";

const { DISCORD_PREFIX, DISCORD_TOKEN, GOOGLE_API_KEY } = process.env;
if (!DISCORD_PREFIX || !DISCORD_TOKEN || !GOOGLE_API_KEY) {
  console.log("Missing required environmental variable");
  process.exit(0);
}

const knex = Knex({
  client: "sqlite3",
  connection: {
    filename: "./entities.sqlite",
  },
  useNullAsDefault: true,
});

const client = new Client();

const readMe = readFileSync("./help.md", "utf8");

const hasSheetIds = await knex.schema.hasTable("sheet_ids");
const hasCommands = await knex.schema.hasTable("commands");
const hasPrefixes = await knex.schema.hasTable("prefixes");
const hasCustoms = await knex.schema.hasTable("customs");
if (!hasSheetIds) {
  await knex.schema.createTable("sheet_ids", (table) => {
    table.string("associated_id").notNullable().primary().unique();
    table.string("sheet_id").notNullable();
  });
}
if (!hasCommands) {
  await knex.schema.createTable("commands", (table) => {
    table.string("sheet_id").notNullable().primary().unique();
    table.string("command").notNullable();
  });
}
if (!hasPrefixes) {
  await knex.schema.createTable("prefixes", (table) => {
    table.string("associated_id").notNullable().primary().unique();
    table.string("prefix").notNullable();
  });
}
if (!hasCustoms) {
  await knex.schema.createTable("customs", (table) => {
    table.string("uniq").notNullable().primary().unique();
    table.string("sheet_id").notNullable();
    table.string("entity_name").notNullable();
    table.string("template");
    table.string("color");
  });
}

const loadedPrefixes = await knex("prefixes").select("associated_id", "prefix");

const custPrefixes = new Map(
  loadedPrefixes.map((lod) => [lod.associated_id, lod.prefix])
);

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

  if (!entity)
    return `Sorry, could not find an entity of the name ${entity_name} on the ${tab_name} sheet.`;

  entity.entity_details = JSON.parse(entity.entity_details);
  const custom = await knex("customs").where({ sheet_id }).first();
  const embed = new MessageEmbed();
  embed.setTitle(entity.name);

  if (!custom) {
    embed.addFields(entity.entity_details);
    if (entity.description) embed.setDescription(entity.description);
  } else {
    if (custom.template) {
      const embed_details = {};
      embed_details.name = entity.name;
      embed_details.Name = entity.name;
      embed_details.description = entity.description;
      embed_details.Description = entity.description;
      for(const detail of entity.entity_details){
        embed_details[detail.name]=detail.value;
      }
      const formattedTemplate = format(custom.template, embed_details);
      embed.setDescription(formattedTemplate);
    } else {
      embed.addFields(entity.entity_details);
    }
    if (custom.color) {
      embed.setColor(custom.color.toUpperCase());
    }
  }

  if (entity.image) embed.setImage(entity.image);
  if (entity.thumbnail) embed.setThumbnail(entity.thumbnail);
  if (entity.url) embed.setURL(entity.url);
  if (entity.color) embed.setColor(entity.color.toUpperCase());

  return embed;
}

async function sendEntityInfo(message, args) {
  try {
    /** create the embed */
    const embed = await getEntityEmbed(message, args);
    return await message.reply(embed);
  } catch (e) {
    /** TODO let them know what didn't exist or that there might be a typo */
    console.error(e);
    return await message.reply("Something went wrong");
  }
}

async function importDiscordSheet(sheet_id, sheet) {
  const rows = await sheet.getRows();
  const customs = [];

  const hasColor =
    sheet.headerValues.includes("color") ||
    sheet.headerValues.includes("Color");
  const hasTemplate =
    sheet.headerValues.includes("template") ||
    sheet.headerValues.includes("Template");
  const nameIndex = sheet.headerValues.includes("name") ? "name" : "Name";
  const colorIndex = sheet.headerValues.includes("color") ? "color" : "Color";
  const templateIndex = sheet.headerValues.includes("template")
    ? "template"
    : "Template";

  await knex("customs").where({ sheet_id }).del();
  for (const entity of rows) {
    if (!entity[nameIndex]) continue;
    const custom = { sheet_id };
    custom.uniq = sheet_id + "_" + entity[nameIndex];
    custom.entity_name = entity[nameIndex];
    if (hasTemplate) custom.template = entity[templateIndex];
    if (hasColor) custom.color = entity[colorIndex];
    customs.push(knex("customs").insert(custom).onConflict("uniq").ignore());
  }
  await Promise.all(customs);
}

async function importSheet(sheet_id) {
  await knex.schema.dropTableIfExists(sheet_id);
  await knex.schema.createTable(sheet_id, (table) => {
    table.string("uniq").notNullable().primary().unique();
    table.string("name").notNullable();
    table.text("description");
    table.string("image");
    table.string("thumbnail");
    table.string("url");
    table.string("color");
    table.string("entity_name").notNullable();
    table.json("entity_details").notNullable();
  });

  const doc = await getDoc(sheet_id);
  const commands = [];
  const entities = [];
  for (const sheet of doc.sheetsByIndex) {
    if (sheet.title.startsWith("_")) continue;
    if (sheet.title.toLowerCase() == "discord_config") {
      await importDiscordSheet(sheet_id, sheet);
      continue;
    }
    await sheet.loadHeaderRow();
    if (
      !sheet.headerValues.includes("name") &&
      !sheet.headerValues.includes("Name")
    )
      continue;
    const rows = await sheet.getRows();
    const filteredSheetHeaders = sheet.headerValues.filter(
      (curr) =>
        curr.toLowerCase() != "name" &&
        curr.toLowerCase() != "description" &&
        curr.toLowerCase() != "image" &&
        curr.toLowerCase() != "thumbnail" &&
        curr.toLowerCase() != "url" &&
        curr.toLowerCase() != "color" &&
        !curr.toLowerCase().startsWith("_")
    );

    commands.push(
      knex("commands")
        .insert({
          sheet_id,
          command: sheet.title,
        })
        .onConflict("sheet_id")
        .merge()
    );

    const hasDescription =
      sheet.headerValues.includes("description") ||
      sheet.headerValues.includes("Description");
    const hasImage =
      sheet.headerValues.includes("image") ||
      sheet.headerValues.includes("Image");
    const hasThumbnail =
      sheet.headerValues.includes("thumbnail") ||
      sheet.headerValues.includes("Thumbnail");
    const hasUrl =
      sheet.headerValues.includes("url") || sheet.headerValues.includes("Url");
    const hasColor =
      sheet.headerValues.includes("color") ||
      sheet.headerValues.includes("Color");
    const nameIndex = sheet.headerValues.includes("name") ? "name" : "Name";
    const descriptionIndex = sheet.headerValues.includes("description")
      ? "description"
      : "Description";
    const imageIndex = sheet.headerValues.includes("image") ? "image" : "Image";
    const thumbnailIndex = sheet.headerValues.includes("thumbnail")
      ? "thumbnail"
      : "Thumbnail";
    const urlIndex = sheet.headerValues.includes("url") ? "url" : "Url";
    const colorIndex = sheet.headerValues.includes("color") ? "color" : "Color";

    for (const entity of rows) {
      if (!entity[nameIndex]) continue;
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
      const uniq = sheet.title + "_" + entity[nameIndex];
      let entityEntry = {
        uniq,
        name: entity[nameIndex],
        entity_name: sheet.title,
        entity_details: JSON.stringify(entity_details),
      };
      if (hasDescription) {
        entityEntry.description = entity[descriptionIndex];
      }
      if (hasImage) {
        entityEntry.image = entity[imageIndex];
      }
      if (hasThumbnail) {
        entityEntry.thumbnail = entity[thumbnailIndex];
      }
      if (hasUrl) {
        entityEntry.url = entity[urlIndex];
      }
      if (hasColor) {
        entityEntry.color = entity[colorIndex];
      }

      entities.push(
        knex(sheet_id).insert(entityEntry).onConflict("uniq").ignore()
      );
    }
  }
  await Promise.all(commands);
  await Promise.all(entities);
}

const commands = {
  refresh: async function refreshDb(message, args) {
    const sheet_id = await getSheetId(message);
    message.channel.startTyping();
    await message.reply(
      "Refreshing sheet, this may take a while. You will be informed when it is complete."
    );
    await importSheet(sheet_id);
    message.channel.stopTyping();
    return await message.reply("Sheet refreshed!");
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
      !message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)
    )
      return await message.reply(
        "Sorry, you do not have permissions to make guild level decisions."
      );
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS))
      return await message.reply(
        "Sorry, you do not have permissions to make channel level decisions."
      );
    const associated_id = isGlobal ? message.guild.id : message.channel.id;
    message.channel.startTyping();
    await message.reply(
      "Importing sheet, this may take a while. You will be informed when it is complete."
    );
    await importSheet(sheet_id);
    await knex("sheet_ids")
      .insert({ associated_id, sheet_id })
      .onConflict("associated_id")
      .merge();

    message.channel.stopTyping();
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
      !message.member.permissions.has(Permissions.FLAGS.MANAGE_GUILD)
    )
      return await message.reply(
        "Sorry, you do not have permissions to make guild level decisions."
      );
    if (!message.member.permissions.has(Permissions.FLAGS.MANAGE_CHANNELS))
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
    await knex("prefixes")
      .insert({ associated_id, prefix })
      .onConflict("associated_id")
      .merge();
    return await message.reply(`Prefix has been updated to \`${prefix}\``);
  },
  help: async function help(message, args) {
    /** get channel info */
    const sheet_id = await getSheetId(message);
    if (sheet_id) {
      const customCommandList = await knex("commands")
        .where({ sheet_id })
        .pluck('command');
      console.log("customCommandList", customCommandList);
      const customReadMe =
        readMe + ("\n\n**Custom Commands**\n" + customCommandList.join(", "));

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

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  if (Object.keys(commands).includes(args[0])) {
    await commands[args[0]](message, args);
  } else {
    await sendEntityInfo(message, args);
  }
  message.channel.stopTyping();
});

client.login(DISCORD_TOKEN);
