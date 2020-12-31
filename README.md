# custbot
Lets you refer to a google sheet and gain an embed in a Discord channel

# Commands
**Default Prefix** `>`

**Set Sheet URL**
`>set [url] [channel|guild]`
Lets you provide the bot with a google sheets url to reference. You can specify if it is for the channel the command is used in, or if it is the default url for the entire guild.

**Search Sheet for Entity**
`>[entity_type] [entity_name]`
Searches the spreadsheet for the entity type and name. First it looks for the worksheet of the same name as `entity_title` then finds the first row with the name `entity_name`. After that, it uses all the columns in that row to create an embed and send it to the chat.
