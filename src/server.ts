import { createServer } from "http";

// Polyfill File/Blob/FormData for Node < 18 to satisfy undici
try {
  if (typeof (global as any).File === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { File, Blob, FormData } = require("undici");
    (global as any).File = File;
    (global as any).Blob = Blob;
    (global as any).FormData = FormData;
  }
} catch {
  // ignore if undici isn't available
}

import { createApp } from "./app/app";
import { env } from "./config/env";

const app = createApp();
const server = createServer(app);

const PORT = env.port;

server.listen(PORT, "0.0.0.0", () => {
});
