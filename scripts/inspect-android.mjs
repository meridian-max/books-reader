import { connect } from "./android-cdp.mjs";
const c = await connect();
console.log(
  await c.evaluate(() => ({
    url: location.href,
    text: document.body.innerText.slice(0, 1800),
    native: !!window.BooksNative,
    width: innerWidth,
    height: innerHeight,
  })),
);
await c.screenshot("docs/screenshots/android-library.png");
c.close();
