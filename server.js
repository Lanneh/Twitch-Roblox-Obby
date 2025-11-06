import express from "express";
import tmi from "tmi.js";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const activeServers = {};

// --- 🔍 Validate Twitch channel before connecting
async function validateTwitchChannel(username) {
    try {
        const res = await fetch(`https://www.twitch.tv/${encodeURIComponent(username.toLowerCase())}`, {
            method: "HEAD",
            redirect: "manual"
        });

        // Twitch returns 200 if channel exists, 404 if not found/suspended
        if (res.status === 200) return true;
        console.warn(`[Twitch] Channel ${username} returned status ${res.status}`);
        return false;
    } catch (err) {
        console.error(`[Twitch] Channel validation failed for ${username}:`, err);
        return false;
    }
}

// --- 🛰 Connect to Twitch IRC
async function connectTwitch(username, serverId) {
    const client = new tmi.Client({
        channels: [username.toLowerCase()],
        connection: { reconnect: true, secure: true },
        options: { debug: false }
    });

    client.on("message", (channel, tags, message, self) => {
        if (!activeServers[serverId]) return;
        activeServers[serverId].messages.push({
            user: tags["display-name"] || tags.username || "unknown",
            text: message,
            timestamp: Date.now()
        });
    });

    client.on("disconnected", (reason) => {
        console.warn(`Twitch client disconnected (${serverId}): ${reason}`);
    });
    client.on("reconnect", () => {
        console.log(`Twitch client reconnecting (${serverId})`);
    });
    client.on("error", (err) => {
        console.error(`Twitch client error (${serverId}):`, err);
    });

    let attempts = 0;
    while (attempts < 5) {
        try {
            await client.connect();
            console.log(`Connected to Twitch channel: ${username} (server ${serverId})`);
            return client;
        } catch (err) {
            attempts++;
            console.error(`Failed to connect to Twitch (attempt ${attempts}):`, err);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    throw new Error(`Unable to connect Twitch client for ${username}`);
}

// --- 🧩 Register or Override route
app.post("/register", async (req, res) => {
    const { username, serverId } = req.body;
    if (!username || !serverId)
        return res.status(400).json({ error: "Missing username or serverId" });

    const valid = await validateTwitchChannel(username);
    if (!valid)
        return res.status(400).json({ error: "Invalid or suspended Twitch channel." });

    try {
        // --- If already registered, cleanly disconnect and override
        if (activeServers[serverId]) {
            console.log(`[Twitch] Overriding existing connection for server ${serverId}`);
            try {
                await activeServers[serverId].client.disconnect();
            } catch (e) {
                console.warn(`[Twitch] Failed to cleanly disconnect old client:`, e);
            }
            delete activeServers[serverId];
        }

        // --- Connect to Twitch and store
        const client = await connectTwitch(username, serverId);
        activeServers[serverId] = { client, messages: [], username };
        res.json({ status: "ok", overridden: true });
    } catch (err) {
        console.error(`Error registering server ${serverId}:`, err);
        res.status(500).json({ error: "Failed to connect to Twitch" });
    }
});

// --- 📬 Get messages for a server
app.get("/getMessages", (req, res) => {
    const { serverId } = req.query;
    if (!serverId || !activeServers[serverId])
        return res.json([]);

    const messages = activeServers[serverId].messages.splice(0); // return and clear
    res.json(messages);
});

// --- ❌ Unregister a server
app.post("/unregister", async (req, res) => {
    const { serverId } = req.body;
    if (!serverId || !activeServers[serverId])
        return res.json({ status: "not_found" });

    try {
        await activeServers[serverId].client.disconnect();
        delete activeServers[serverId];
        console.log(`[Twitch] Unregistered server ${serverId}`);
        res.json({ status: "ok" });
    } catch (err) {
        console.error(`[Twitch] Error unregistering ${serverId}:`, err);
        res.status(500).json({ error: "Failed to unregister" });
    }
});

app.listen(PORT, () => console.log(`Twitch relay backend running on port ${PORT}`));
