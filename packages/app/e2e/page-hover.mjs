// What the rays currently hover: [left hand, right hand, browser pointer, gaze].
export default async function run({ frame }) {
  return frame.evaluate(() => window.__yadori.hover());
}
