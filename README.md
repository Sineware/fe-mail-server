# fe-mail-server
Sineware Internal Service - An "Email server" without an Email server!

Uses [Forward Email](https://forwardemail.net/) to receive emails through a webhook, and [SendGrid](https://sendgrid.com/) to send/reply to Emails using REST.

Emails are stored locally in a json file.

Environment Variables:
```env
PREFIX="/mail"
SENDGRID_API_KEY=
# OpenID Connect
ISSUER_BASE_URL=
CLIENT_ID=
BASE_URL=
SECRET=
```