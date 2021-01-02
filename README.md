This bot lets you refer to a google sheet and gain an embed in a Discord channel.

[Extended support server](https://discord.gg/83KyR23Jtm)

[Click here to invite me to your server!](https://discord.com/api/oauth2/authorize?client_id=794175938728296469&permissions=67584&scope=bot)

`>prefix [new_prefix] [channel|guild]`  
**Default Prefix** `>`  

Lets you customize what prefix calls the lookup bot. You can specify it for the entire guild, or the channel the command is used in (default).

`>set [url] [channel|guild]`  

Lets you provide the bot with a google sheets url to reference. You can specify if it is for the channel the command is used in (default), or if it is the default url for the entire guild.


The bot currently expects all tabs in a spreadsheet to have a row of column headers, and a column header of `name`.
The spreadsheet must be publicly visible to work with the bot. There is currently nothing that confirms this visibility in the bot.

`>[entity_type] [entity_name]`  

Searches the spreadsheet for the entity type and name. First it looks for the worksheet of the same name as `entity_title` then finds the first row with the name `entity_name`. After that, it uses all the columns in that row to create an embed and send it to the chat.
