/**
 * Wildlife Documentary Engine
 *
 * Dedicated creative engine for Cinematic Viral Wildlife Explainers inspired by
 * short-form premium nature documentary pages such as Living Earth.
 *
 * This is intentionally niche-locked. It should not generate finance, AI,
 * motivation, history, or generic faceless content.
 */

export const DEFAULT_WILDLIFE_VISUAL_STYLE =
  'cinematic viral wildlife documentary, ultra-detailed telephoto and macro animal footage, natural habitat realism, shallow depth of field, dramatic but natural lighting, crisp bark/skin/feather texture, premium nature documentary color grade';

export const EPISODE_TYPES = {
  auto: {
    label: 'Auto-pick strongest wildlife structure',
    description: 'Choose the best structure based on the animal or survival behavior.',
  },
  strange_hunting_method: {
    label: 'Strange Hunting Method',
    hookPattern: 'This [animal] hunts using [unexpected method], not [expected method].',
    beats: [
      'impossible-sounding hunting hook',
      'animal reveal',
      'hidden prey or target problem',
      'special sensory/body adaptation',
      'behavior shown step-by-step',
      'macro/cutaway proof',
      'successful capture/payoff',
      'survival uniqueness ending',
    ],
  },
  impossible_survival: {
    label: 'Impossible Survival Adaptation',
    hookPattern: 'This [animal] is not supposed to survive here.',
    beats: [
      'impossible survival hook',
      'animal reveal',
      'hostile habitat/problem',
      'first adaptation',
      'new consequence/problem',
      'second adaptation',
      'weird visible proof',
      'memorable survival payoff',
    ],
  },
  silent_predator: {
    label: 'Silent Predator Strategy',
    hookPattern: 'This [predator] hunts by doing almost nothing.',
    beats: [
      'stillness/contradiction hook',
      'predator reveal',
      'weapon/power detail',
      'patience behavior',
      'prey context',
      'sensory advantage',
      'strike/payoff setup',
      'final inevitability line',
    ],
  },
  bizarre_body_tool: {
    label: 'Bizarre Body Tool',
    hookPattern: 'This [animal] has a body part that works like a tool.',
    beats: [
      'body-tool hook',
      'animal reveal',
      'survival challenge',
      'close-up anatomy detail',
      'how the tool works',
      'macro proof in action',
      'result/payoff',
      'evolutionary uniqueness ending',
    ],
  },
  extreme_evolution_trick: {
    label: 'Extreme Evolution Trick',
    hookPattern: 'Evolution gave this [animal] one impossible trick.',
    beats: [
      'evolution trick hook',
      'animal reveal',
      'environmental pressure',
      'adaptation explanation',
      'visual proof',
      'unexpected consequence',
      'secondary adaptation',
      'final survival statement',
    ],
  },
};

export const IMAGE_TOOL_NOTES = {
  generic: 'Write image_prompt as a clear wildlife image-generation prompt with subject, habitat, shot type, lighting, texture, and negative constraints.',
  midjourney: 'Write image_prompt in Midjourney descriptor style. End with --ar 9:16 --style raw. Do not put overlay text inside the image prompt.',
  dalle: 'Write image_prompt as natural-language DALL-E prose. Explicitly say no text, no watermark, no logo, unless on-screen text is separately requested.',
  sd: 'Write image_prompt for Stable Diffusion using compact weighted phrases. Include a negative_prompt field inside each prompt object if useful.',
  seedream: 'Write image_prompt for SeeDream with cinematic style first, then the animal, action, habitat, lens, light, and texture details.',
};

export const VIDEO_TOOL_NOTES = {
  generic: 'Write video_prompt as a wildlife cinematographer shot note with duration, subject motion, camera behavior, lens feel, and continuity.',
  sora: 'Write video_prompt like a director note for Sora. Use restrained camera motion and natural animal behavior, not impossible action.',
  runway: 'Write video_prompt for Runway image-to-video. Mention subtle subject motion, documentary realism, and start-frame continuity.',
  kling: 'Write video_prompt for Kling with explicit animal motion, camera angle, shot size, and naturalistic physical movement.',
  ltx: 'Write video_prompt for LTX Video: concise, concrete, moderate motion, realistic environmental details.',
  luma: 'Write video_prompt for Dream Machine with lens, lighting, keyframe/start-frame continuity, and natural motion cues.',
};

export function buildWildlifeSystemPrompt({ visualStyle = DEFAULT_WILDLIFE_VISUAL_STYLE, imageTool = 'generic', videoTool = 'generic' } = {}) {
  return `You are the dedicated creative engine for a single niche: Cinematic Viral Wildlife Explainers.

You do not generate generic faceless content. You only generate short-form wildlife documentary packages inspired by premium nature documentary storytelling and viral animal explainer pages.

The target style is serious, mysterious, educational, and cinematic. Think: tight animal close-ups, macro textures, natural habitats, strange survival behaviors, and a final memorable payoff.

RESPOND WITH ONLY VALID JSON. No markdown fences. No preamble.

Required JSON schema:
{
  "title": "short documentary-style title",
  "episode_type": "auto | strange_hunting_method | impossible_survival | silent_predator | bizarre_body_tool | extreme_evolution_trick",
  "animal": "specific animal or animal group",
  "core_mystery": "the impossible or strange claim driving the episode",
  "survival_problem": "the environmental/prey/predator problem the animal must solve",
  "adaptation_chain": [
    { "problem": "specific obstacle", "adaptation": "specific behavior/anatomy", "visual_proof": "what the viewer sees" }
  ],
  "hook": "first spoken line, 6-12 words, contradiction or impossible claim",
  "payoff_line": "final spoken line that resolves the hook",
  "visual_bible": {
    "subject": "locked animal subject and visible identifying traits",
    "setting": "locked habitat/environment style",
    "palette": "3-4 locked natural color descriptors",
    "lighting": "locked natural documentary lighting setup",
    "lens_style": "locked telephoto/macro camera treatment",
    "motif": "recurring texture/detail such as claws, bark, feathers, water, rock, eyes"
  },
  "script": [
    { "time": "0-3s", "line": "voiceover line", "note": "delivery and visual intent" }
  ],
  "storyboard": [
    { "scene": 1, "duration": "3s", "beat": "hook | reveal | problem | adaptation | proof | twist | payoff", "visual": "what is on screen", "on_screen_text": "1-6 word bottom caption", "camera": "shot type and movement" }
  ],
  "prompts": [
    { "scene": 1, "image_prompt": "paste-ready image prompt", "video_prompt": "paste-ready video prompt", "continuity_note": "what carries over and what changes" }
  ],
  "fact_check_notes": ["brief notes about what must be true or verified"],
  "caption": "ready-to-post caption with documentary-native CTA",
  "hashtags": ["5-8 relevant hashtags without #"],
  "production_notes": ["practical notes for generating consistent media"]
}

LIVING-EARTH-STYLE STRUCTURE:
- Open with an impossible-sounding animal claim. Examples of the shape, not exact reuse: "This primate hunts using sound, not sight." / "This lizard is not supposed to exist." / "This bird hunts without moving."
- Reveal the animal quickly by scene 2 or 3.
- Build the video around a survival problem, not random facts.
- Explain the adaptation as a chain: problem -> body/behavior -> visual proof -> consequence/twist -> payoff.
- End with a final line that makes the animal feel uniquely evolved for survival.

HOOK RULES:
- 6-12 words.
- Start with "This [animal]..." or another direct contradiction.
- Must contain tension: not supposed to exist, hunts without moving, listens through wood, drinks poison, freezes without dying, etc.
- No greetings. No "Did you know". No "In this video". No jokes.

SCRIPT RULES:
- Short declarative voiceover lines.
- Serious, low, cinematic narration tone.
- Average line length under 12 words.
- One idea per line.
- Avoid hype language, emojis, memes, and fake certainty.
- If the fact is uncertain, include it in fact_check_notes instead of overstating it.

STORYBOARD RULES:
- Default 30-40 seconds = 8-10 scenes.
- 45-60 seconds = 11-14 scenes.
- 60-90 seconds = 15-20 scenes.
- Every scene lasts 2-5 seconds.
- Use tight wildlife shots more than wide landscape shots.
- Include macro/cutaway-style proof when explaining hidden behavior.
- Bottom captions should be white, all-caps style, 1-6 words, and not too wordy.

VISUAL RULES:
- Use the locked visual style in every prompt: ${visualStyle}
- Prefer telephoto close-ups, macro textures, natural behavior, shallow depth of field, and grounded documentary lighting.
- Use animal eyes, claws, feathers, skin, bark, water, rocks, prey traces, or habitat texture as recurring visual motifs.
- No talking heads, no presenters, no cartoon mascots, no decorative badges, no random graphics.
- Avoid gore. Hunting can be tense but should remain suitable for educational wildlife content.

PROMPT FORMAT RULES:
- Image prompt target: ${IMAGE_TOOL_NOTES[imageTool] || IMAGE_TOOL_NOTES.generic}
- Video prompt target: ${VIDEO_TOOL_NOTES[videoTool] || VIDEO_TOOL_NOTES.generic}
- Prompts must not add text or watermarks inside the generated image/video. On-screen captions are handled separately.
- Video prompts should use natural restrained camera movement: static telephoto, slow push-in, macro side view, low waterline, overhead drift, or subtle handheld wildlife footage.
- Use continuity_note to make each scene feel like part of one documentary sequence.

FACT SAFETY:
- Do not invent fake animal abilities.
- If a specific claim is obscure, mark it in fact_check_notes.
- Avoid absolute wording like "only animal in the world" unless the topic is widely established or the note says it should be verified.
- Prefer "one of the few" when uncertain.

CAPTION STYLE:
- Documentary-native, not creator-generic.
- Good CTA examples: "Nature keeps finding impossible solutions." / "Which animal should we break down next?" / "Follow for more strange survival stories."
- Avoid "like and subscribe" and sales language.`;
}

export function buildWildlifeUserMessage({ animal, episodeType = 'auto', length = '30-40 seconds', extra = '' } = {}) {
  const chosen = EPISODE_TYPES[episodeType] || EPISODE_TYPES.auto;
  return `Animal/topic: ${animal || 'Auto-pick a high-retention animal survival behavior'}
Episode type: ${episodeType} — ${chosen.label || chosen.description}
Target length: ${length}
Additional requirements: ${extra || 'None'}

Generate one complete wildlife documentary short-form package. If the animal/topic is blank, pick a strong animal behavior that fits the Living-Earth-style viral structure.`;
}

export function enforceWildlifePackage(pkg) {
  if (!pkg || typeof pkg !== 'object') return pkg;
  pkg.episode_type = pkg.episode_type || 'auto';
  pkg.animal = pkg.animal || 'unspecified wildlife subject';
  pkg.core_mystery = pkg.core_mystery || pkg.hook || '';
  pkg.survival_problem = pkg.survival_problem || '';
  pkg.adaptation_chain = Array.isArray(pkg.adaptation_chain) ? pkg.adaptation_chain : [];
  pkg.fact_check_notes = Array.isArray(pkg.fact_check_notes) ? pkg.fact_check_notes : [];
  pkg.production_notes = Array.isArray(pkg.production_notes) ? pkg.production_notes : [];

  if (!pkg.visual_bible) {
    pkg.visual_bible = {
      subject: pkg.animal,
      setting: 'natural habitat documentary setting',
      palette: 'earth browns, deep greens, muted highlights',
      lighting: 'natural low-key documentary lighting',
      lens_style: 'telephoto and macro shallow depth of field',
      motif: 'recurring animal texture details',
    };
  }

  if (Array.isArray(pkg.storyboard)) {
    pkg.storyboard.forEach((scene, idx) => {
      scene.scene = typeof scene.scene === 'number' ? scene.scene : idx + 1;
      scene.beat = scene.beat || inferBeat(idx, pkg.storyboard.length);
      scene.on_screen_text = trimOverlay(scene.on_screen_text || scene.beat || '');
    });
  }

  if (Array.isArray(pkg.prompts)) {
    const bible = pkg.visual_bible;
    const anchors = [bible.subject, bible.setting, bible.palette, bible.lighting, bible.lens_style]
      .filter(Boolean)
      .join(', ');
    pkg.prompts.forEach((prompt, idx) => {
      prompt.scene = typeof prompt.scene === 'number' ? prompt.scene : idx + 1;
      if (prompt.image_prompt && !prompt.image_prompt.includes(String(bible.lens_style || '').split(',')[0])) {
        prompt.image_prompt = `${prompt.image_prompt}, ${anchors}`;
      }
      if (prompt.video_prompt && !prompt.video_prompt.includes(String(bible.lens_style || '').split(',')[0])) {
        prompt.video_prompt = `${prompt.video_prompt}, ${anchors}`;
      }
      prompt.continuity_note = prompt.continuity_note || (idx === 0
        ? 'Establishes the locked animal, habitat, palette, lighting, and lens style.'
        : `Continues Scene ${idx}: same animal, habitat, palette, lighting, and lens style; only action/camera detail changes.`);
    });
  }

  return pkg;
}

export function validateWildlifePackage(pkg, length = '30-40 seconds') {
  const errors = [];
  if (!pkg || typeof pkg !== 'object') return ['Output is not an object.'];

  for (const key of ['title', 'episode_type', 'animal', 'core_mystery', 'survival_problem', 'hook', 'payoff_line', 'caption']) {
    if (!pkg[key] || typeof pkg[key] !== 'string') errors.push(`Missing or invalid ${key}.`);
  }
  if (!pkg.visual_bible || typeof pkg.visual_bible !== 'object') errors.push('Missing visual_bible.');
  if (!Array.isArray(pkg.script) || pkg.script.length === 0) errors.push('Missing script array.');
  if (!Array.isArray(pkg.storyboard) || pkg.storyboard.length === 0) errors.push('Missing storyboard array.');
  if (!Array.isArray(pkg.prompts) || pkg.prompts.length === 0) errors.push('Missing prompts array.');
  if (!Array.isArray(pkg.adaptation_chain)) errors.push('Missing adaptation_chain array.');
  if (!Array.isArray(pkg.fact_check_notes)) errors.push('Missing fact_check_notes array.');
  if (!Array.isArray(pkg.hashtags)) errors.push('Missing hashtags array.');
  if (errors.length) return errors;

  if (pkg.storyboard.length !== pkg.prompts.length) {
    errors.push(`Storyboard scene count (${pkg.storyboard.length}) must match prompts scene count (${pkg.prompts.length}).`);
  }

  const hookWords = wordCount(pkg.hook);
  if (hookWords < 4 || hookWords > 14) errors.push(`Hook should be 4-14 words. Current: ${hookWords}.`);
  if (/^(welcome|hey|today|in this video|did you know|hello|let's)/i.test(pkg.hook.trim())) {
    errors.push('Hook uses a generic intro. Use an impossible animal claim instead.');
  }

  const expectedScenes = sceneRangeForLength(length);
  if (pkg.storyboard.length < expectedScenes.min || pkg.storyboard.length > expectedScenes.max) {
    errors.push(`Storyboard should have ${expectedScenes.min}-${expectedScenes.max} scenes for ${length}. Current: ${pkg.storyboard.length}.`);
  }

  pkg.storyboard.forEach((scene) => {
    const seconds = durationSeconds(scene.duration);
    if (seconds > 5) errors.push(`Scene ${scene.scene} is too long (${scene.duration}). Keep scenes <=5s.`);
    if (!scene.beat) errors.push(`Scene ${scene.scene} is missing beat.`);
    if (!scene.visual) errors.push(`Scene ${scene.scene} is missing visual.`);
    if (scene.on_screen_text && wordCount(scene.on_screen_text) > 6) {
      errors.push(`Scene ${scene.scene} overlay is too long. Use 1-6 words.`);
    }
  });

  const totalWords = (pkg.script || []).reduce((sum, line) => sum + wordCount(line.line || ''), 0);
  const maxWords = maxWordsForLength(length);
  if (totalWords > maxWords) errors.push(`Script has ${totalWords} words; target max for ${length} is ${maxWords}.`);

  return errors;
}

export function scoreWildlifePackage(pkg, length = '30-40 seconds') {
  const flags = [];
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  let hook = 100;
  const h = pkg?.hook || '';
  const hookWords = wordCount(h);
  const wildlifeHook = /\bthis\s+(animal|bird|lizard|primate|fish|frog|insect|spider|snake|eagle|shark|whale|octopus|mammal|predator|creature)\b/i.test(h)
    || /\b(hunts|survives|breathes|freezes|dives|listens|sneezes|sees|moves|kills|escapes)\b/i.test(h);
  const contradiction = /\b(without|not|isn't|shouldn't|impossible|secret|using|instead|almost|never|only)\b/i.test(h);
  if (!wildlifeHook) { hook -= 25; flags.push('Hook: does not clearly start from an animal behavior or survival claim.'); }
  if (!contradiction) { hook -= 20; flags.push('Hook: needs a stronger contradiction/impossible claim.'); }
  if (hookWords > 14 || hookWords < 4) { hook -= 15; flags.push(`Hook: ${hookWords} words; target 6-12.`); }
  if (/did you know|in this video|welcome/i.test(h)) { hook -= 40; flags.push('Hook: generic intro detected.'); }

  let structure = 100;
  const scenes = pkg?.storyboard || [];
  const expected = sceneRangeForLength(length);
  if (scenes.length < expected.min || scenes.length > expected.max) {
    structure -= 20;
    flags.push(`Structure: ${scenes.length} scenes; expected ${expected.min}-${expected.max} for ${length}.`);
  }
  const beats = scenes.map((s) => String(s.beat || '').toLowerCase()).join(' ');
  for (const required of ['hook', 'reveal', 'problem', 'adaptation', 'proof', 'payoff']) {
    if (!beats.includes(required)) { structure -= 8; flags.push(`Structure: missing ${required} beat.`); }
  }
  if (!Array.isArray(pkg?.adaptation_chain) || pkg.adaptation_chain.length < 1) {
    structure -= 20;
    flags.push('Structure: missing adaptation chain.');
  }

  let visuals = 100;
  const prompts = pkg?.prompts || [];
  const visualWords = /macro|telephoto|close-up|close up|shallow depth|natural lighting|bark|skin|feather|claw|eye|underwater|forest|jungle|rock|habitat|documentary/i;
  const weakPromptCount = prompts.filter((p) => !visualWords.test(`${p.image_prompt || ''} ${p.video_prompt || ''}`)).length;
  if (weakPromptCount) { visuals -= Math.min(35, weakPromptCount * 8); flags.push(`Visuals: ${weakPromptCount} prompt(s) lack wildlife documentary texture/camera language.`); }
  const overlayRatio = scenes.length ? scenes.filter((s) => s.on_screen_text).length / scenes.length : 0;
  if (overlayRatio < 0.75) { visuals -= 12; flags.push('Visuals: add bottom captions to most scenes.'); }

  let factuality = 100;
  if (!Array.isArray(pkg?.fact_check_notes) || pkg.fact_check_notes.length === 0) {
    factuality -= 25;
    flags.push('Factuality: include fact_check_notes for animal behavior claims.');
  }
  if (/only|never|always|no other/i.test(`${pkg?.hook || ''} ${pkg?.payoff_line || ''}`) && (!pkg?.fact_check_notes || pkg.fact_check_notes.length < 2)) {
    factuality -= 15;
    flags.push('Factuality: absolute claims need verification notes.');
  }

  let script = 100;
  const scriptLines = pkg?.script || [];
  const avgLine = scriptLines.length
    ? scriptLines.reduce((sum, s) => sum + wordCount(s.line || ''), 0) / scriptLines.length
    : 99;
  if (avgLine > 12) { script -= 15; flags.push(`Script: average ${avgLine.toFixed(1)} words per line; target under 12.`); }
  if (!pkg?.payoff_line || !(scriptLines[scriptLines.length - 1]?.line || '').includes(pkg.payoff_line.split(' ').slice(0, 4).join(' '))) {
    script -= 10;
    flags.push('Script: final line should clearly match the payoff_line.');
  }

  const scores = {
    hook: clamp(hook),
    structure: clamp(structure),
    visuals: clamp(visuals),
    factuality: clamp(factuality),
    script: clamp(script),
  };
  const weights = { hook: 0.25, structure: 0.25, visuals: 0.20, factuality: 0.15, script: 0.15 };
  const overall = clamp(Object.entries(weights).reduce((sum, [key, weight]) => sum + scores[key] * weight, 0));
  const grade = overall >= 90
    ? 'Excellent — strong wildlife explainer package'
    : overall >= 75
      ? 'Strong — minor polish only'
      : overall >= 60
        ? 'Workable — improve weak wildlife beats'
        : 'Weak — regenerate recommended';

  return { scores, weights, overall, grade, flags };
}

function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function durationSeconds(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function maxWordsForLength(length) {
  if (length === '15-20 seconds') return 65;
  if (length === '45-60 seconds') return 160;
  if (length === '60-90 seconds') return 235;
  return 115;
}

function sceneRangeForLength(length) {
  if (length === '15-20 seconds') return { min: 5, max: 7 };
  if (length === '45-60 seconds') return { min: 11, max: 14 };
  if (length === '60-90 seconds') return { min: 15, max: 20 };
  return { min: 8, max: 10 };
}

function trimOverlay(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 6).join(' ').toUpperCase();
}

function inferBeat(index, total) {
  const beats = ['hook', 'reveal', 'problem', 'adaptation', 'proof', 'twist', 'payoff'];
  if (index === 0) return 'hook';
  if (index === total - 1) return 'payoff';
  return beats[Math.min(index, beats.length - 2)] || 'proof';
}
