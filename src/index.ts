import { RelayPool, Relay, signId, calculateId, verifyEvent, getPublicKey } from 'nostr';
import { db } from './database.js';
import type { events } from './types.js';
import express from 'express';
import { cache, updateCache } from './cache.js';
import { calculateRanking, formatPostContent, paginate } from './util.js';
import { calculate, cleanDb } from './main.js';

const relays = [
    "wss://relay.nostr.band",
    "wss://relay.f7z.io",
    "wss://nostr.wine",
    "wss://relay.damus.io",
    "wss://relayable.org",
    "wss://nos.lol",
    "wss://nostr.bitcoiner.social",
    "wss://nostr-pub.wellorder.net",
    "wss://eden.nostr.land",
    "wss://relay.primal.net",
    "wss://lightningrelay.com",
    "wss://nostr.orangepill.dev",
    "wss://relay.snort.social",
    "wss://eden.nostr.land",
    "wss://nostr.mutinywallet.com",
];

// # Init
console.log("Starting...");
await cleanDb();
await updateCache();
console.log("OK");

const pool = RelayPool(relays);
const api = express();

// Clean DB every 30 minutes
setInterval(async () => {
    await cleanDb();
}, 1800000);

api.get('/rss', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    let page: number = 1;
    let sort: string = "";
    let enableAlgorithm = true;

    if (req.query.sort !== "zaps" && req.query.sort !== "upvotes") {
        sort = "upvotes";
    } else {
        sort = req.query.sort;
    }

    if (req.query.disableAlgo) {
        if (req.query.disableAlgo === "true") {
            enableAlgorithm = false;
        }
    }

    if (req.query.page) {
        page = Number(req.query.page)
    }

    let data = [];

    const cacheData: any = await cache.get("data_storage");
    if (cacheData === undefined) {
        return res.json({ message: "Internal Server Error, cache initilizing, please wait a moment..." });
    }
    data = cacheData.cache_storage;

    if (enableAlgorithm === false) {
        if (sort === "upvotes") {
            data.sort((a, b) => b.upvoteCount - a.upvoteCount);
        } else if (sort === "zaps") {
            data.sort((a, b) => b.zapSats - a.zapSats);
        }
    } else {
        if (sort === "upvotes") {
            data.sort((a, b) => b.algoUpvoteScore - a.algoUpvoteScore);
        } else if (sort === "zaps") {
            data.sort((a, b) => b.algoZapsatsScore - a.algoZapsatsScore);
        }
    }

    data = paginate(data, 35, page);

    let theString = `<rss version="2.0"><channel>`
    data.forEach((item) => {
        theString += `<item><title>${formatPostContent(item.Content).title}</title><link>${formatPostContent(item.Content).url ? `${formatPostContent(item.Content).url}` : `https://nostrne.ws/item?id=${item.ID}`}</link><pubDate>${item.CreatedAt}</pubDate><comments>${`https://nostrne.ws/item?id=${item.ID}`}</comments><description>${formatPostContent(item.Content).text ? `${formatPostContent(item.Content).text}` : `<![CDATA[<a href="${`https://nostrne.ws/item?id=${item.ID}`}">Comments</a>]]>`}</description></item>`;
    })
    theString += `</channel></rss>`;

    res.setHeader("Content-Type", "application/rss+xml");
    return res.send(theString)
});

api.get('/', async (req, res) => {

    res.setHeader('Access-Control-Allow-Origin', '*');

    let page: number = 1;
    let sort: string = "";
    let enableAlgorithm = true;

    if (req.query.sort !== "zaps" && req.query.sort !== "upvotes") {
        sort = "upvotes";
    } else {
        sort = req.query.sort;
    }

    if (req.query.disableAlgo) {
        if (req.query.disableAlgo === "true") {
            enableAlgorithm = false;
        }
    }

    if (req.query.page) {
        page = Number(req.query.page)
    }

    let data = [];

    const cacheData: any = await cache.get("data_storage");
    if (cacheData === undefined) {
        return res.json({ message: "Internal Server Error, cache initilizing, please wait a moment..." });
    }
    data = cacheData.cache_storage;

    if (enableAlgorithm === false) {
        if (sort === "upvotes") {
            data.sort((a, b) => b.upvoteCount - a.upvoteCount);
        } else if (sort === "zaps") {
            data.sort((a, b) => b.zapSats - a.zapSats);
        }
    } else {
        if (sort === "upvotes") {
            data.sort((a, b) => b.algoUpvoteScore - a.algoUpvoteScore);
        } else if (sort === "zaps") {
            data.sort((a, b) => b.algoZapsatsScore - a.algoZapsatsScore);
        }
    }

    data = paginate(data, 35, page);

    return res.json({ message: "OK", page, sort, updated: cacheData.cache_updated, data });
});

pool.on('open', relay => {
    relay.subscribe("subid", { limit: 1, kinds: [1, 7, 9735], })
});

pool.on('event', async (relay, sub_id, ev) => {
    if (!verifyEvent(ev)) {
        console.log("Invalid Event");
        return;
    }

    if (ev.kind === 1) {
        // Check Tag
        let hasCorrectTag = false;
        if (ev.tags[0]) {
            for (let i = 0; i < ev.tags.length; i++) {
                if (ev.tags[i][0] === "t" && ev.tags[i][1] === "nostrnews") {
                    hasCorrectTag = true;
                }
            }
        }
        if (hasCorrectTag === false) {
            return;
        }


        // Check content
        if (!ev.content.startsWith("nostrne.ws post")) {
            return;
        }
        if (!ev.content.includes("title: ")) {
            return;
        }
    }

    // Check reactions
    if (ev.kind === 7 || ev.kind === 9735) {
        if (ev.tags[0]) {
            for (let i = 0; i < ev.tags.length; i++) {
                if (ev.tags[i][0] === "e") {
                    let aboveRow: events.Row = await db.get(`SELECT * FROM events WHERE ID = ? LIMIT 1`, [ev.tags[i][1]]);
                    if (aboveRow) {

                    } else {
                        return;
                    }
                }
            }
        }

    }

    let row: events.Row = await db.get(`SELECT * FROM events WHERE ID = ? AND Sig = ? LIMIT 1`, [ev.id, ev.sig])
    if (row) {
        const relaysArray = JSON.parse(row.Relays || '[]');
        if (relaysArray.includes(relay.url)) {
            return;
        } else {
            relaysArray.push(relay.url);
            db.run(`UPDATE events SET relays = ? WHERE ID = ? AND Sig = ?`, [JSON.stringify(relaysArray), ev.id, ev.sig])
        }
        return;
    } else {
        const stmt = await db.prepare(`
                INSERT INTO events(ID, Sig, PubKey, CreatedAt, Kind, Tags, Content, Relays) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                `)
        stmt.run(ev.id, ev.sig, ev.pubkey, ev.created_at, ev.kind, JSON.stringify(ev.tags), ev.content, JSON.stringify([relay.url]))
    }
});

api.listen(8080, () =>
    console.log(`Listening on port ${8080}!`),
);
