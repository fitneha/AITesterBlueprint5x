import app from "./server.js";
import { getRuntimeConfig } from "./config.js";

const config = getRuntimeConfig();
const port = Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 ? config.port : 3002;

app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Test Strategy Builder backend listening on http://127.0.0.1:${port}\n`);
});
