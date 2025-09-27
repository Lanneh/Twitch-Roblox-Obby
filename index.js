import tmi from "tmi.js";
import express from "express";

const app = express();
app.use(express.json());

let activeChannels = {}; // serverId -> { messages: [] }

app.post("/register", (req, res) => {
    const { username, serverId } = req.body;
    if (!activeChannels[serverId]) {
        activeChannels[serverId] = { messages: [] };

        const client = new tmi.Client({ channels: [ username ] });
        client.connect();

        client.on("message", (channel, tags, message, self) => {
            activeChannels[serverId].messages.push({
                user: tags["display-name"],
                text: message
            });
        });
    }
    res.json({ status: "ok" });
});

app.get("/getMessages", (req, res) => {
    const serverId = req.query.serverId;
    const channel = activeChannels[serverId];
    if (!channel) return res.json([]);
    const messages = channel.messages;
    channel.messages = []; // clear after sending
    res.json(messages);
});

app.listen(3000, () => console.log("Server running"));
