import Express from "express";
import basicAuth from "express-basic-auth";
import { join, dirname } from 'path';
import { Low, JSONFile } from 'lowdb';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import got from "got";
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

/**
 * Authorizer for express-basic-auth (use authorizeAsync: true), using username/password
 * @param {string} username
 * @param {string} password
 * @param {function} cb
 * @returns {Promise<void>}
 */
async function userPassAuthorizer(username, password, cb) {
    const {body} = await got.post(process.env.AUTHSERVER_URL + '/login', {
        json: { username, password },
        responseType: 'json'
    });
    console.log(body)
    cb(null, body.status === true);
}

let authMW = basicAuth({
    authorizer: userPassAuthorizer,
    authorizeAsync: true,
    challenge: true
});

app.use(Express.json({ limit: "50mb" }));
app.use(Express.urlencoded({extended: true}));
app.set('view engine', 'ejs');

const PREFIX = process.env.PREFIX || '';

app.get(PREFIX + "/", authMW, (req, res) => {
    res.render('index', {emails: db.data.emails, selectedEmail: false});
});
app.get(PREFIX + "/email/:id", authMW, (req, res) => {
    //console.log(req.params.id)
    res.render('index', {emails: db.data.emails, selectedEmail: req.params.id});
});

app.post(PREFIX + "/api/v1/sink", async (req, res) => {
    console.log(req.body);
    db.data.emails.push(req.body);
    await db.write();
    res.send({"success": true, "service": "sineware-fe-mail-server"});
});

app.listen(port, () => {
    console.log(`FE Mail Server listening on port ${port}`);
});
