// server.js
import express from "express";
import tmi from "tmi.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stores Twitch connections + messages
const activeServers = {}; // { serverId: { client, messages: [] } }

// Register a Twitch username for a Roblox server
app.post("/register", async (req, res) => {
    const { username, serverId } = req.body;

    if (!username || !serverId) {
        return res.status(400).json({ error: "Missing username or serverId" });
    }

    // Already registered? Just return success.
    if (activeServers[serverId]) {
        return res.json({ status: "already_registered" });
    }

    console.log(`Registering Twitch channel: ${username} for server ${serverId}`);

    // Setup Twitch chat client
    const client = new tmi.Client({
        channels: [username.toLowerCase()]
    });

    await client.connect();

    activeServers[serverId] = {
        client,
        messages: []
    };

    client.on("message", (channel, tags, message, self) => {
        activeServers[serverId].messages.push({
            user: tags["display-name"],
            text: message,
            timestamp: Date.now()
        });
    });

    res.json({ status: "ok" });
});

// Roblox polls for messages
app.get("/getMessages", (req, res) => {
    const { serverId } = req.query;

    if (!serverId || !activeServers[serverId]) {
        return res.json([]); // No messages
    }

    const data = activeServers[serverId].messages;
    activeServers[serverId].messages = []; // Clear after sending
    res.json(data);
});

// Clean up old connections if needed
app.delete("/unregister", async (req, res) => {
    const { serverId } = req.body;

    if (activeServers[serverId]) {
        await activeServers[serverId].client.disconnect();
        delete activeServers[serverId];
    }

    res.json({ status: "removed" });
});

app.listen(PORT, () => {
    console.log(`Twitch relay running on port ${PORT}`);
});
