import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

export const db = await open({
    filename: './database/db.sqlite',
    driver: sqlite3.Database,
});

db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS events (
    ID TEXT,
    Sig TEXT,
    PubKey TEXT,
    CreatedAt TEXT,
    Kind TEXT,
    Tags TEXT,
    Content TEXT,
    Relays TEXT
);
`)
