import { calculate, cleanDb } from "./main.js";
import NodeCache from 'node-cache';

export const cache = new NodeCache();

export async function updateCache() {
    const newData = await calculate();
    cache.set("data_storage", { cache_storage: newData, cache_updated: Date.now() }, 44800000);
}

setInterval(async () => { await updateCache() }, 900000); // Update every 15 minutes
