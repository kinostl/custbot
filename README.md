This bot lets you refer to a google sheet and gain an embed in a Discord channel.

[Extended support server](https://discord.gg/83KyR23Jtm)

[Click here to invite me to your server!](https://discord.com/api/oauth2/authorize?client_id=794175938728296469&permissions=67584&scope=bot)

`>prefix [new_prefix] [channel|guild]`  
**Default Prefix** `>`  

Lets you customize what prefix calls the lookup bot. You can specify it for the entire guild, or the channel the command is used in (default).

`>import [url] [channel|guild]`  

Lets you provide the bot with a google sheets url to import into its database. You can specify if it is for the channel the command is used in (default), or if it is the default url for the entire guild.

Feel free to make a copy of [this template](https://docs.google.com/spreadsheets/d/1yletu44kejejacfNpgU4o3PiirpVO4rSCv2W8p22oOc/edit?usp=sharing) to save yourself some time!

You can make a sheet named `discord_config` and customize entities with templates, and colors. The `discord_config` sheet needs a required column named `name`, an optional one named `template`, and an optional one named `color` that will color the embed.

Using a template relays only the name and formatted template to the embed.

If an entity has a column named `image`, it will relay that image to the embed. `thumbnail` will similarly do the same thing. `url` will relay the url to the embed in the url spot. `color` will override the default color from the discord_config.

`>refresh`

Reruns the import command for the channel or guild's associated spreadsheet.


The bot currently expects all tabs in a spreadsheet to have a row of column headers, and a column header of `name`.
The spreadsheet must be publicly visible to work with the bot. There is currently nothing that confirms this visibility in the bot.

`>[entity_type] [entity_name]`  

Searches the spreadsheet for the entity type and name. First it looks for the worksheet of the same name as `entity_title` then finds the first row with the name `entity_name`. After that, it uses all the columns in that row to create an embed and send it to the chat.

`entity_name` and `entity_type` do not currently support spaces.

The bot currently expects all tabs in a spreadsheet to have a row of column headers, and a column header of `name`. The bot ignores any tabs that start with an `_`.
