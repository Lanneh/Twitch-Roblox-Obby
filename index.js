// server.js
import express from "express";
import tmi from "tmi.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stores Twitch connections + messages
// Format: { serverId: { client: tmi.Client, messages: [] } }
const activeServers = {};

// Helper to safely connect Twitch client
async function connectTwitch(username, serverId) {
    const client = new tmi.Client({
        channels: [username.toLowerCase()],
        connection: { reconnect: true, secure: true },
        options: { debug: false }
    });

    client.on("message", (channel, tags, message, self) => {
        // Safety check if serverId was removed
        if (!activeServers[serverId]) return;
        activeServers[serverId].messages.push({
            user: tags["display-name"] || tags.username || "unknown",
            text: message,
            timestamp: Date.now()
        });
    });

    // Catch errors that could crash the process
    client.on("disconnected", (reason) => {
        console.warn(`Twitch client disconnected (${serverId}): ${reason}`);
    });
    client.on("reconnect", () => {
        console.log(`Twitch client reconnecting (${serverId})`);
    });
    client.on("error", (err) => {
        console.error(`Twitch client error (${serverId}):`, err);
    });

    // Connect with retry logic
    let attempts = 0;
    while (attempts < 5) {
        try {
            await client.connect();
            console.log(`Connected to Twitch channel: ${username} (server ${serverId})`);
            return client;
        } catch (err) {
            attempts++;
            console.error(`Failed to connect to Twitch (attempt ${attempts}):`, err);
            await new Promise(r => setTimeout(r, 2000)); // wait 2s before retry
        }
    }

    throw new Error(`Unable to connect Twitch client for ${username}`);
}

// Register a Twitch username for a Roblox server
app.post("/register", async (req, res) => {
    const { username, serverId } = req.body;
    if (!username || !serverId) return res.status(400).json({ error: "Missing username or serverId" });

    if (activeServers[serverId]) return res.json({ status: "already_registered" });

    try {
        const client = await connectTwitch(username, serverId);
        activeServers[serverId] = { client, messages: [] };
        res.json({ status: "ok" });
    } catch (err) {
        console.error(`Error registering server ${serverId}:`, err);
        res.status(500).json({ error: "Failed to connect to Twitch" });
    }
});

// Roblox polls for messages
app.get("/getMessages", (req, res) => {
    const { serverId } = req.query;
    if (!serverId || !activeServers[serverId]) return res.json([]);

    const data = activeServers[serverId].messages;
    activeServers[serverId].messages = []; // Clear after sending
    res.json(data);
});

// Clean up old connections
app.delete("/unregister", async (req, res) => {
    const { serverId } = req.body;
    if (activeServers[serverId]) {
        try {
            await activeServers[serverId].client.disconnect();
        } catch (err) {
            console.error(`Error disconnecting client for ${serverId}:`, err);
        }
        delete activeServers[serverId];
    }
    res.json({ status: "removed" });
});

// Global error handling
process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
});

app.listen(PORT, () => {
    console.log(`Twitch relay running on port ${PORT}`);
});
