/*
    Sineware FE Mail Server (Internal Service)
    Copyright (C) 2022 Seshan Ravikumar

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

require('dotenv').config()
const Express = require("express");
const { join } = require('path');
const got = require("got");
const { auth, claimCheck } = require("express-openid-connect");

console.log(__dirname)
async function main() {
    const { Low, JSONFile } = await import('lowdb');

    const file = join(__dirname, 'db.json');
    const adapter = new JSONFile(file);
    const db = new Low(adapter);

    await db.read();

    db.data = db.data || { emails: [] }
    await db.write();

    const app = Express();
    const port = 3002;

    app.use(Express.json({ limit: "50mb" }));
    app.use(Express.urlencoded({extended: true}));
    app.set('view engine', 'ejs');


    const PREFIX = process.env.PREFIX || '';
    const router = Express.Router();
    app.use(PREFIX, router);

    router.use(auth({
        authRequired: false,
        authorizationParams: {
            response_type: 'id_token',
            response_mode: 'form_post',
            scope: 'openid profile email roles'
        }
          
    }))

    /* -------------------------------------- */
    const employeeClaim = claimCheck((req, claims) => {
        console.log(claims)
        return claims.realm_access?.roles?.includes("employee");
    })



    /* -------------------------------------- */
    router.get("/", employeeClaim, (req, res) => {
        res.render('index', {emails: db.data.emails, selectedEmail: false, reply: false});
    });
    router.get("/email/:id", employeeClaim, (req, res) => {
        res.render('index', {emails: db.data.emails, selectedEmail: req.params.id, reply: false});
    });
    router.get("/email/:id/reply", employeeClaim, (req, res) => {
        
        res.render('index', {emails: db.data.emails, selectedEmail: req.params.id, reply: true});
    });

    /* -------------------------------------- */
    router.post("/api/v1/sink", async (req, res) => {
        console.log(req.body);
        db.data.emails.push(req.body);
        await db.write();
        res.send({"success": true, "service": "sineware-fe-mail-server"});
    });

    /* -------------------------------------- */
    const sendGridReplyFunction = async (content, subject, from, to, cc) => {
        const req = {
            "personalizations":[
                    {
                        to: to.map((email) => {
                            return {
                                email: email
                            }
                        }),
                        /*cc: cc.map((email) => {
                            return {
                                email: email
                            }
                        }),*/
                        "subject": subject
                    }
                ],
            "content": [
                {"type": "text/plain", "value": content}
            ],
            "from":{
                "email": from,
                "name":"Sineware"},
            "reply_to":{
                "email": from,
                "name":"Sineware"
            }
        }
        console.log(req)
        const response = await got.post("https://api.sendgrid.com/v3/mail/send", {
            headers: {
                "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
            },
            json: req,
            responseType: "json",
        });
        console.log(response.body);
        return response;
    }
    router.post("/compose", employeeClaim, async (req, res) => {
        console.log(req.body);
        const { content, subject, from, to, cc } = req.body;
        db.data.emails.push({
            from: {
                text: from
            },
            to: {
                text: to
            },
            cc: {
                text: cc
            },
            html: content,
            date: new Date().toISOString(),
            subject: subject,
            isFEMailReply: true,
        });
        await db.write();
        if (content) {
            try {
                let emailres = await sendGridReplyFunction(content, subject, from, to.split(","), cc.split(","));
                if(emailres.statusCode !== 202) {
                    res.send({success: false, error: res.body, statusCode: res.statusCode});
                } else {
                    res.send({success: true});
                    return;
                }
            } catch (e) {
                console.error(e);
                res.send({success: false, error: e});
                return;
            }
        }
        res.send({success: false, error: "No content"});
    });

    app.listen(port, () => {
        console.log(`FE Mail Server listening on port ${port}`);
    });

}
main();