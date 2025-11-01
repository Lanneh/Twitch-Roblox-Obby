import express from "express";
import tmi from "tmi.js";
// For YouTube, you’ll need a library or your own polling logic
import { YouTubeChat } from "youtube-chat-lite"; // example npm package

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Stores chat connections + messages
const activeServers = {}; // { serverId: { twitchClient, youtubeClient, messages: [] } }

// Register a username for a platform (Twitch or YouTube)
app.post("/register", async (req, res) => {
    const { username, serverId, platform } = req.body;
    if (!username || !serverId || !platform) {
        return res.status(400).json({ error: "Missing username, platform, or serverId" });
    }

    if (!activeServers[serverId]) {
        activeServers[serverId] = { messages: [] };
    }

    console.log(`Registering ${platform} channel: ${username} for server ${serverId}`);

    if (platform === "twitch") {
        if (!activeServers[serverId].twitchClient) {
            const client = new tmi.Client({ channels: [username.toLowerCase()] });
            await client.connect();

            client.on("message", (channel, tags, message, self) => {
                activeServers[serverId].messages.push({
                    platform: "twitch",
                    user: tags["display-name"],
                    text: message,
                    timestamp: Date.now(),
                });
            });

            activeServers[serverId].twitchClient = client;
        }
    } else if (platform === "youtube") {
        if (!activeServers[serverId].youtubeClient) {
            const ytClient = new YouTubeChat();
            await ytClient.connect(username);

            ytClient.on("chat", (chatItem) => {
                activeServers[serverId].messages.push({
                    platform: "youtube",
                    user: chatItem.author.name,
                    text: chatItem.message,
                    timestamp: Date.now(),
                });
            });

            activeServers[serverId].youtubeClient = ytClient;
        }
    } else {
        return res.status(400).json({ error: "Unknown platform" });
    }

    res.json({ status: "ok" });
});

// Roblox polls for messages
app.get("/getMessages", (req, res) => {
    const { serverId } = req.query;
    if (!serverId || !activeServers[serverId]) return res.json([]);
    
    const data = activeServers[serverId].messages;
    activeServers[serverId].messages = [];
    res.json(data);
});

// Clean up old connections
app.delete("/unregister", async (req, res) => {
    const { serverId } = req.body;
    if (!activeServers[serverId]) return res.json({ status: "removed" });

    if (activeServers[serverId].twitchClient) {
        await activeServers[serverId].twitchClient.disconnect();
    }
    if (activeServers[serverId].youtubeClient) {
        await activeServers[serverId].youtubeClient.disconnect();
    }

    delete activeServers[serverId];
    res.json({ status: "removed" });
});

app.listen(PORT, () => console.log(`Chat relay running on port ${PORT}`));
