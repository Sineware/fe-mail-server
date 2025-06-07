/*
    Sineware FE Mail Server (Internal Service)
    Copyright (C) 2021-2025 Seshan Ravikumar

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

require('dotenv').config();
const express = require("express");
const { join } = require('path');
const got = require("got");
const { auth, claimCheck } = require("express-openid-connect");

// Configuration
const CONFIG = {
    port: process.env.PORT || 3002,
    prefix: process.env.PREFIX || '',
    sendGridApiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.FROM_EMAIL || 'admin@sineware.ca',
    fromName: process.env.FROM_NAME || 'Sineware'
};

// Database setup
let db;

async function initDatabase() {
    const { Low, JSONFile } = await import('lowdb');
    const file = join(__dirname, 'db.json');
    const adapter = new JSONFile(file);
    db = new Low(adapter);
    
    await db.read();
    db.data = db.data || { emails: [] };
    
    // Patch existing emails
    console.log("Patching email store...");
    db.data.emails = db.data.emails.map(email => ({
        ...email,
        to: {
            ...email.to,
            text: email.to?.text || "INVALID - NO TO"
        },
        from: {
            ...email.from,
            text: email.from?.text || "INVALID - NO FROM"
        }
    }));
    
    await db.write();
}

// Middleware
const employeeClaim = claimCheck((req, claims) => {
    console.log(claims);
    return claims?.realm_access?.roles?.includes("employee");
});

// Email service
class EmailService {
    static async sendEmail(content, subject, from, to, cc = []) {
        if (!CONFIG.sendGridApiKey) {
            throw new Error('SendGrid API key not configured');
        }

        const payload = {
            personalizations: [{
                to: to.map(email => ({ email: email.trim() })),
                ...(cc.length > 0 && { 
                    cc: cc.map(email => ({ email: email.trim() }))
                }),
                subject
            }],
            content: [{ type: "text/plain", value: content }],
            from: { email: from, name: CONFIG.fromName },
            reply_to: { email: from, name: CONFIG.fromName }
        };

        try {
            const response = await got.post("https://api.sendgrid.com/v3/mail/send", {
                headers: { "Authorization": `Bearer ${CONFIG.sendGridApiKey}` },
                json: payload,
                timeout: 10000 // 10 second timeout
            });
            
            return { success: true, statusCode: response.statusCode };
        } catch (error) {
            console.error('SendGrid API Error:', error);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }
}

// Email utilities
class EmailUtils {
    static createEmailObject(body) {
        return {
            from: { text: body.from },
            to: { text: body.to },
            cc: { text: body.cc || '' },
            html: body.content,
            date: new Date().toISOString(),
            subject: body.subject,
            isFEMailReply: true
        };
    }

    static parseEmailAddresses(addresses) {
        return addresses ? addresses.split(',').map(addr => addr.trim()).filter(Boolean) : [];
    }

    static getEmailById(id) {
        const emailIndex = parseInt(id);
        if (isNaN(emailIndex) || emailIndex < 0 || emailIndex >= db.data.emails.length) {
            return null;
        }
        return { email: db.data.emails[emailIndex], index: emailIndex };
    }
}

// Route handlers
const routeHandlers = {
    renderIndex: (req, res) => {
        res.render('index', {
            emails: db.data.emails,
            selectedEmail: false,
            reply: false,
            prefix: CONFIG.prefix
        });
    },

    renderEmail: (req, res) => {
        const emailData = EmailUtils.getEmailById(req.params.id);
        if (!emailData) {
            return res.status(404).send('Email not found');
        }
        
        res.render('index', {
            emails: db.data.emails,
            selectedEmail: req.params.id,
            reply: false,
            prefix: CONFIG.prefix
        });
    },

    renderEmailReply: (req, res) => {
        const emailData = EmailUtils.getEmailById(req.params.id);
        if (!emailData) {
            return res.status(404).send('Email not found');
        }
        
        res.render('index', {
            emails: db.data.emails,
            selectedEmail: req.params.id,
            reply: true,
            prefix: CONFIG.prefix
        });
    },

    renderCompose: (req, res) => {
        const emptyEmail = {
            from: { text: "", value: [{ address: "" }] },
            to: { text: "" },
            cc: { text: "" },
            html: "",
            date: "",
            subject: "",
            isFEMailReply: false
        };
        
        res.render('index', {
            emails: [emptyEmail],
            selectedEmail: "0",
            reply: true,
            prefix: CONFIG.prefix
        });
    },

    renderRawEmail: (req, res) => {
        const emailData = EmailUtils.getEmailById(req.params.id);
        if (!emailData) {
            return res.status(404).send('Email not found');
        }
        
        const { email } = emailData;
        const content = email.html || `<pre>${email.textAsHtml || 'No content available'}</pre>`;
        res.send(`<html><head><title>Email Content</title></head><body>${content}</body></html>`);
    },

    handleEmailSink: async (req, res) => {
        try {
            console.log('Received email:', req.body);
            db.data.emails.push(req.body);
            await db.write();
            res.json({ success: true, service: "sineware-fe-mail-server" });
        } catch (error) {
            console.error('Error storing email:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    },

    handleCompose: async (req, res) => {
        try {
            const { content, subject, from, to, cc } = req.body;
            
            // Validation
            if (!content?.trim()) {
                return res.status(400).json({ success: false, error: "Content is required" });
            }
            if (!to?.trim()) {
                return res.status(400).json({ success: false, error: "To address is required" });
            }
            if (!subject?.trim()) {
                return res.status(400).json({ success: false, error: "Subject is required" });
            }

            // Store email in database
            const emailObj = EmailUtils.createEmailObject(req.body);
            db.data.emails.push(emailObj);
            await db.write();

            // Send email
            const toAddresses = EmailUtils.parseEmailAddresses(to);
            const ccAddresses = EmailUtils.parseEmailAddresses(cc);
            const fromAddress = from || CONFIG.fromEmail;

            const result = await EmailService.sendEmail(content, subject, fromAddress, toAddresses, ccAddresses);
            
            if (result.statusCode === 202) {
                res.json({ success: true, message: "Email sent successfully" });
            } else {
                res.status(500).json({ success: false, error: "Failed to send email", statusCode: result.statusCode });
            }
        } catch (error) {
            console.error('Error sending email:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

// Application setup
async function createApp() {
    await initDatabase();
    
    const app = express();
    
    // Middleware
    app.use(express.json({ limit: "50mb" }));
    app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    app.set('view engine', 'ejs');
    
    // Security headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        
        // Only set X-Frame-Options for non-raw email routes
        if (!req.path.includes('/raw')) {
            res.setHeader('X-Frame-Options', 'DENY');
        }
        
        next();
    });
    
    // Router setup
    const router = express.Router();
    app.use(CONFIG.prefix, router);
    
    // Auth middleware
    router.use(auth({
        authRequired: false,
        authorizationParams: {
            response_type: 'id_token',
            response_mode: 'form_post',
            scope: 'openid profile email roles'
        }
    }));
    
    // Routes
    router.get("/", employeeClaim, routeHandlers.renderIndex);
    router.get("/email/:id", employeeClaim, routeHandlers.renderEmail);
    router.get("/email/:id/reply", employeeClaim, routeHandlers.renderEmailReply);
    router.get("/compose", employeeClaim, routeHandlers.renderCompose);
    router.get("/email/:id/raw", employeeClaim, routeHandlers.renderRawEmail);
    
    // API routes
    router.post("/api/v1/sink", routeHandlers.handleEmailSink);
    router.post("/compose", employeeClaim, routeHandlers.handleCompose);
    
    // Error handling
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ success: false, error: 'Internal server error' });
    });
    
    return app;
}

// Start server
async function main() {
    try {
        const app = await createApp();
        app.listen(CONFIG.port, () => {
            console.log(`FE Mail Server listening on port ${CONFIG.port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

main();