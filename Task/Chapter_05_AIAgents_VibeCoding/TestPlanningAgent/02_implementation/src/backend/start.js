import { getRuntimeConfig } from "./config.js";
import app from "./server.js";

const config = getRuntimeConfig();
const port = Number.isInteger(config.port) && config.port > 0 && config.port <= 65535 ? config.port : 3001;

app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Test Plan Generator backend listening on http://127.0.0.1:${port}\n`);
});
