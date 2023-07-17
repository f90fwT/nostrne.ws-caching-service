import { db } from "./database.js";
import { events } from "./types.js";
import { calculateRanking } from "./util.js";
import bolt11 from 'bolt11';

export async function calculate() {
    let data = [];

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 30); // Latest 30 days

    const rows = await db.all(`SELECT * FROM events WHERE datetime(CreatedAt, 'unixepoch') >= datetime(?, 'unixepoch') GROUP BY ID, Sig`, daysAgo.getTime() / 1000);

    const { notes, reactions, zaps } = rows.reduce((acc, row: events.Row) => {
        if (row.Kind === '1') {
            const tags = JSON.parse(row.Tags || '[]');
            // Tag Filter
            if (tags[0]) {
                for (let i = 0; i < tags.length; i++) {
                    if (tags[i][0] === "t" && tags[i][1] === "nostrnews") {
                        acc.notes.push(row);
                    }
                }
            }
        } else if (row.Kind === '7') {
            acc.reactions.push(row);
        } else if (row.Kind === '9735') {
            acc.zaps.push(row);
        }
        return acc;
    }, { notes: [], reactions: [], zaps: [] });

    for (let i = 0; i < notes.length; i++) {

        let note: events.Row = notes[i];
        let reactions: events.Row[] = [];

        let zapsCount = 0;
        let zapSats = 0;

        // Calculate Upvotes
        for (let i = 0; i < reactions.length; i++) {
            const reaction: events.Row = reactions[i];
            if (reaction.Content !== "-") {
                const reactionTags = JSON.parse(reaction.Tags || '[]');
                if (reactionTags[0]) {
                    for (let i = 0; i < reactionTags.length; i++) {
                        if (reactionTags[i][0] === "e" && reactionTags[i][1] === note.ID) {
                            reactions.push(reaction);
                        }
                    }
                }
            }
        }

        // Calculate Zaps
        for (let i = 0; i < zaps.length; i++) {
            const zap: events.Row = zaps[i];
            const zapTags = JSON.parse(zap.Tags || '[]');
            if (zapTags[0]) {
                for (let i = 0; i < zapTags.length; i++) {
                    if (zapTags[i][0] === "e" && zapTags[i][1] === note.ID) {
                        // Check if zap comes from author
                        if (note.PubKey === zap.PubKey) {
                            await db.run("DELETE FROM events WHERE ID = ?", zap.ID)
                        } else {
                            zapsCount++;
                            for (let i = 0; i < zapTags.length; i++) {
                                if (zapTags[i][0] === "bolt11" && zapTags[i][1]) {
                                    zapSats = zapSats + bolt11.decode(zapTags[i][1]).satoshis;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Remove duplicate upvotes
        const idOccurrences = {};
        reactions.forEach(ev => {
            const { ID } = ev;
            idOccurrences[ID] = (idOccurrences[ID] || 0) + 1;
        });
        reactions.forEach(async ev => {
            const { ID } = ev;
            if (idOccurrences[ID] > 1) {
                await db.run("DELETE FROM events WHERE ID = ?", ID);
                const index = reactions.findIndex(item => item.ID === ID);
                reactions.splice(index, 1);
                idOccurrences[ID]--;
            }
        });

        const upvoteCount = reactions.length;

        let algoUpvoteScore = calculateRanking(reactions.length, Date.now() - Number(note.CreatedAt), 0.2).toFixed(16);
        let algoZapsatsScore = calculateRanking(zapSats, Date.now() - Number(note.CreatedAt), 0.2).toFixed(16);

        data.push({ ID: note.ID, Content: note.Content, PubKey: note.PubKey, Sig: note.Sig, Tags: JSON.parse(note.Tags), CreatedAt: JSON.parse(note.CreatedAt), Relays: JSON.parse(note.Relays), algoUpvoteScore, algoZapsatsScore, zapsCount, upvoteCount, zapSats })
    }

    return data;
}

export async function cleanDb() {

    // Delete all events older then 30 days
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 30);
    await db.run(`DELETE FROM events WHERE datetime(CreatedAt, 'unixepoch') < datetime(?, 'unixepoch')`, daysAgo.getTime() / 1000);

    // Remove duplicates
    const duplicateIDs = await db.all(`
    SELECT ID
    FROM events
    GROUP BY ID
    HAVING COUNT(ID) > 1
    `);
    for (const { ID } of duplicateIDs) {
        await db.run(`
        DELETE FROM events
        WHERE ID = ?
        AND rowid NOT IN (
            SELECT MIN(rowid)
            FROM events
            WHERE ID = ?
        )
        `, ID, ID);
    }

    // Filter Rows
    const rows = await db.all(`SELECT * FROM events`);
    let filteredRows = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowTags = JSON.parse(row.Tags || '[]');
        if (rowTags[0]) {
            let shouldKeepRow = false;
            for (let i = 0; i < rowTags.length; i++) {
                if (rowTags[i][0] === "t" && rowTags[i][1] === "nostrnews") {
                    shouldKeepRow = true;
                    break;
                }
            }
            if (shouldKeepRow) {
                filteredRows.push(row);
            } else {
                await db.run(`DELETE FROM events WHERE ID = ?`, row.ID);
            }
        } else {
            await db.run(`DELETE FROM events WHERE ID = ?`, row.ID);
        }
    }

}