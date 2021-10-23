const express = require("express");
const app = express();
const port = 3002;

app.use(express.json());

app.get("/", (req, res) => {
    res.send({"service": "sineware-fe-mail-server", "machine_id": 1});
});

app.post("/api/v1/sink", (req, res) => {
    console.log(req.body);
    res.send({"success": true});
})

app.listen(port, () => {
    console.log(`FE Mail Server listening on port ${port}`);
})
