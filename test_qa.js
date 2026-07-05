import { robustParseJSON, validateVideoPackage } from './validation.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${message}`);
    testsFailed++;
  }
}

function assertThrows(fn, expectedMsgPart, message) {
  try {
    fn();
    console.error(`[FAIL] ${message} (did not throw)`);
    testsFailed++;
  } catch (err) {
    if (err.message.includes(expectedMsgPart)) {
      console.log(`[PASS] ${message} (threw: "${err.message}")`);
      testsPassed++;
    } else {
      console.error(`[FAIL] ${message} (threw "${err.message}" but expected partition "${expectedMsgPart}")`);
      testsFailed++;
    }
  }
}

console.log("=== Running Robust JSON Parser Tests ===");

// 1. Clean JSON
const cleanJson = '{"ok": true}';
assert(robustParseJSON(cleanJson).ok === true, "Parse clean JSON string");

// 2. Code block wrapped JSON
const fencedJson = '```json\n{"ok": true, "code": 123}\n```';
assert(robustParseJSON(fencedJson).code === 123, "Parse markdown fenced JSON string");

// 3. Conversational wrapper JSON
const wrappedJson = 'Here is your completion:\n{\n  "ok": true,\n  "text": "hello"\n}\nHope this helps!';
assert(robustParseJSON(wrappedJson).text === "hello", "Parse JSON embedded in conversational preamble and suffix");

// 4. Invalid JSON
assertThrows(() => robustParseJSON("hello { this is not json }"), "JSON parsing failed", "Throw on invalid JSON content");
assertThrows(() => robustParseJSON("completely raw text"), "missing '{' or '}'", "Throw on plain text missing braces");

// 5. DeepSeek reasoning think block wrapped JSON
const thinkBlockJson = '<think>I should output: { "ok": false } but wait, the prompt asks for ok true. Let\'s output: { "ok": true }</think>\n{\n  "ok": true,\n  "model": "deepseek"\n}';
assert(robustParseJSON(thinkBlockJson).model === "deepseek", "Parse JSON with DeepSeek think reasoning block");


console.log("\n=== Running Video Package QA Validator Tests ===");

// Perfect test package satisfying all structural and virality rules
const validPackage = {
  title: "Amazing Deep Sea Facts",
  hook: "Did you know that 95% of the ocean is unexplored?",
  script: [
    { time: "0-3s", line: "Did you know that 95% of the ocean is unexplored?", note: "Slow scroll interrupt" },
    { time: "3-6s", line: "Deep down under, there are creatures that light up their own path.", note: "Show glowing fish" }
  ],
  storyboard: [
    { scene: 1, duration: "3s", visual: "Macro view of dark ocean floor with neon light spots.", on_screen_text: "95% Unexplored", camera: "slow zoom" },
    { scene: 2, duration: "3s", visual: "Cinematic close-up of a glowing bioluminescent jellyfish.", on_screen_text: "Bioluminescent Light", camera: "macro close-up" }
  ],
  prompts: [
    { scene: 1, image_prompt: "Moody realistic dark ocean depth, bioluminescent particles --ar 9:16", video_prompt: "slow zoom on dark ocean depths with bubbles rising, cinematic studio lighting" },
    { scene: 2, image_prompt: "A beautiful glowing bioluminescent jellyfish floating in deep black ocean --ar 9:16", video_prompt: "macro view of glowing jellyfish moving slow through deep abyssal waters" }
  ],
  caption: "The ocean is full of secrets! Comment your thoughts below!",
  hashtags: ["oceanfacts", "naturefacts", "deepsea"]
};

// 1. Test valid package
const errors1 = validateVideoPackage(validPackage, 'midjourney', 'generic', '15-20 seconds');
if (errors1.length > 0) console.log("errors1: ", errors1);
assert(errors1.length === 0, "Valid package passes with zero errors");

// 2. Test missing hook
const missingHookPkg = { ...validPackage, hook: "" };
const errors2 = validateVideoPackage(missingHookPkg);
assert(errors2.length > 0 && errors2.some(e => e.includes("hook")), "Detect missing hook");

// 3. Test mismatched scenes count
const mismatchedScenesPkg = {
  ...validPackage,
  storyboard: [...validPackage.storyboard, { scene: 3, duration: "3s", visual: "Extra scene details", camera: "pan" }]
};
const errors3 = validateVideoPackage(mismatchedScenesPkg);
assert(errors3.length > 0 && errors3.some(e => e.includes("scene count")), "Detect storyboard vs prompts scene count mismatch");

// 4. Test placeholder text
const placeholderPkg = { ...validPackage, title: "Amazing Deep Sea Facts [insert topic here]" };
const errors4 = validateVideoPackage(placeholderPkg);
assert(errors4.length > 0 && errors4.some(e => e.includes("placeholder")), "Detect placeholder brackets in title");

// 5. Test Midjourney formatting check
const errors5 = validateVideoPackage(validPackage, 'midjourney');
if (errors5.length > 0) console.log("errors5: ", errors5);
assert(errors5.length === 0, "Midjourney parameters (--ar) are present in valid prompts");

const badMidjourneyPkg = JSON.parse(JSON.stringify(validPackage));
badMidjourneyPkg.prompts[0].image_prompt = "A dark moody ocean floor without parameters";
const errors6 = validateVideoPackage(badMidjourneyPkg, 'midjourney');
assert(errors6.length > 0 && errors6.some(e => e.includes("missing required aspect ratio")), "Detect missing Midjourney aspect ratio");

// 6. Test speech rate words limit check
const wordyPackage = JSON.parse(JSON.stringify(validPackage));
wordyPackage.script[0].line = "Here is a very long script line designed to exceed the word limit. It has many words like apple, banana, cherry, date, elderberry, fig, grape, honeydew, kiwi, lemon, mango, nectarine, orange, papaya, quince, raspberry, strawberry, tangerine, ugli fruit, watermelon, vanilla, chocolate, caramel, marshmallow, cookie, biscuit, pastry, croissant, donut, muffin, pancake, waffle, syrup, honey, sugar, salt, pepper, spice, herb, garlic, onion, ginger, turmeric, cumin, coriander, basil, oregano, thyme, rosemary, sage, parsley, dill, chives, mint, cilantro, parsley, bay leaf, nutmeg, cinnamon, clove, cardamom, star anise, fennel, aniseed, poppy seed, sesame seed, chia seed, flax seed, pumpkin seed, sunflower seed, pine nut, walnut, pecan, almond, cashew, hazelnut, macadamia, pistachio, peanut, chestnut, coconut, acorn.";
const errors7 = validateVideoPackage(wordyPackage, 'generic', 'generic', '15-20 seconds');
assert(errors7.length > 0 && errors7.some(e => e.includes("exceeds speed limit")), "Detect script exceeding duration speed limits");


console.log("\n=== Running Virality & Engagement Quality Audits ===");

// 1. Hook greeting formula cliché
const badHookClichéPkg = { ...validPackage, hook: "Hey guys, welcome back to my channel!" };
const errors8 = validateVideoPackage(badHookClichéPkg);
assert(errors8.length > 0 && errors8.some(e => e.includes("generic introduction cliché")), "Catch hook greeting clichés");

// 2. Hook line too wordy
const longHookPkg = { ...validPackage, hook: "Did you know that ninety-five percent of the entire Earth's deep oceans are completely unexplored by human scientists today?" };
const errors9 = validateVideoPackage(longHookPkg);
assert(errors9.length > 0 && errors9.some(e => e.includes("Hook line is too wordy")), "Catch wordy hooks (> 15 words)");

// 3. Visual pacing (scene > 5s)
const slowPacingPkg = JSON.parse(JSON.stringify(validPackage));
slowPacingPkg.storyboard[0].duration = "8s";
const errors10 = validateVideoPackage(slowPacingPkg);
assert(errors10.length > 0 && errors10.some(e => e.includes("duration is too long")), "Catch slow pacing (> 5s duration)");

// 4. Overly wordy text overlays
const wordyOverlayPkg = JSON.parse(JSON.stringify(validPackage));
wordyOverlayPkg.storyboard[0].on_screen_text = "Ninety five percent of all sea life has not been discovered yet by humans";
const errors11 = validateVideoPackage(wordyOverlayPkg);
assert(errors11.length > 0 && errors11.some(e => e.includes("overlay text is too long")), "Catch wordy overlays (> 6 words)");

// 5. Low overlay coverage (< 70% scenes)
const lowOverlayCoveragePkg = JSON.parse(JSON.stringify(validPackage));
lowOverlayCoveragePkg.storyboard[0].on_screen_text = "";
const errors12 = validateVideoPackage(lowOverlayCoveragePkg);
assert(errors12.length > 0 && errors12.some(e => e.includes("overlays are only present on")), "Catch low overlay coverage (< 70% scenes)");

// 6. Thin AI prompts
const thinPromptsPkg = JSON.parse(JSON.stringify(validPackage));
thinPromptsPkg.prompts[0].image_prompt = "a dog";
const errors13 = validateVideoPackage(thinPromptsPkg);
assert(errors13.length > 0 && errors13.some(e => e.includes("too thin/short")), "Catch thin image prompts (< 50 chars)");

// 7. Missing growth CTA
const noCtaPkg = { ...validPackage, caption: "This is a clean caption without engagement triggers." };
const errors14 = validateVideoPackage(noCtaPkg);
assert(errors14.length > 0 && errors14.some(e => e.includes("Missing a growth-oriented")), "Catch missing growth CTAs");

// 8. Salesy CTA
const salesyCtaPkg = { ...validPackage, caption: "Subscribe to my channel for more daily videos!" };
const errors15 = validateVideoPackage(salesyCtaPkg);
assert(errors15.length > 0 && errors15.some(e => e.includes("Contains generic, dry subscription")), "Catch dry subscription CTAs");

console.log(`\n=== QA Test Suite Complete ===`);
console.log(`Summary: Passed ${testsPassed}/${testsPassed + testsFailed} tests. Failed: ${testsFailed}`);
if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
