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
const { auth, requiresAuth, claimCheck } = require("express-openid-connect");

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

    app.use(auth({
        authRequired: false,
        authorizationParams: {
            response_type: 'id_token',
            response_mode: 'form_post',
            scope: 'openid profile email roles'
        }
          
    }))

    app.set('view engine', 'ejs');

    const PREFIX = process.env.PREFIX || '';


    const employeeClaim = claimCheck((req, claims) => {
        console.log(claims)
        return claims.realm_access?.roles?.includes("employee");
    })

    app.get(PREFIX + "/", employeeClaim, (req, res) => {
        res.render('index', {emails: db.data.emails, selectedEmail: false});
    });
    app.get(PREFIX + "/email/:id", employeeClaim, (req, res) => {
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

}
main();