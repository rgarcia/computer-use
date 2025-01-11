import { start } from "./proxy";

start({
  listenPort: process.env.LISTEN_PORT
    ? parseInt(process.env.LISTEN_PORT)
    : 9222,
  forwardPort: process.env.FORWARD_PORT
    ? parseInt(process.env.FORWARD_PORT)
    : 9221,
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
