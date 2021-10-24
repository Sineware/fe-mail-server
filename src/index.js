import Express from "express";

import basicAuth from "express-basic-auth";

import { join, dirname } from 'path';
import { Low, JSONFile } from 'lowdb';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const file = join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

await db.read();

db.data = db.data || { emails: [] }
await db.write();

const app = Express();
const port = 3002;

let authMW = basicAuth({
    users: { 'admin': process.env.PASSWORD },
    challenge: true,
});

app.use(Express.json());
app.use(Express.urlencoded({extended: true}));
app.set('view engine', 'ejs');


app.get("/", authMW, (req, res) => {
    res.render('index', {emails: db.data.emails, selectedEmail: false});
});
app.get("/email/:id", authMW, (req, res) => {
    //console.log(req.params.id)
    res.render('index', {emails: db.data.emails, selectedEmail: req.params.id});
});

app.post("/api/v1/sink", (req, res) => {
    console.log(req.body);
    db.data.emails.push(req.body);
    db.write();
    res.send({"success": true, "service": "sineware-fe-mail-server"});
});

app.listen(port, () => {
    console.log(`FE Mail Server listening on port ${port}`);
});
