import { Journal } from "../../src/runtime/journal.mjs";

let journal;
process.on("message", async (message) => {
  try {
    if (message.type === "open") {
      journal = new Journal(message.dataDir);
      await journal.open();
      process.send({ type: "opened", nonce: journal.owner.nonce });
    } else if (message.type === "close") {
      await journal?.close();
      journal = undefined;
      process.send({ type: "closed" });
    }
  } catch (error) {
    process.send({ type: "error", message: error.message });
  }
});
