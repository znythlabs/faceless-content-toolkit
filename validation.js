/**
 * Robust JSON parser and QA validator for Faceless Content Generator
 */

/**
 * Extracts and parses a JSON object from text, even if the text contains
 * conversational preamble, trailing notes, or markdown blocks.
 * 
 * @param {string} text Raw response from LLM
 * @returns {object} Parsed JSON object
 */
export function robustParseJSON(text) {
  if (!text || typeof text !== 'string') {
    throw new Error("Input text is empty or not a string.");
  }

  let cleaned = text.trim();
  
  // Strip DeepSeek/Reasoning thinking blocks
  cleaned = cleaned.replace(/<(think|thought|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
  
  // Try direct parsing first
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to robust parsing
  }

  // Remove markdown code fences if they wrap the entire text
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Continue to boundary searching
  }

  // Try extracting JSON starting from each '{' found in order
  let searchStart = 0;
  let errors = [];
  while (searchStart < cleaned.length) {
    const start = cleaned.indexOf('{', searchStart);
    if (start === -1) break;

    // Balanced brace extraction from this position
    let braceCount = 0;
    let inString = false;
    let escape = false;
    let jsonStr = '';

    for (let i = start; i < cleaned.length; i++) {
      const char = cleaned[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonStr = cleaned.substring(start, i + 1);
            break;
          }
        }
      }
    }

    // If braces never balanced, try rescuing by appending missing closing braces
    if (!jsonStr && braceCount > 0) {
      jsonStr = cleaned.substring(start) + '}'.repeat(braceCount);
    }

    if (!jsonStr) { searchStart = start + 1; continue; }

    try {
      return JSON.parse(jsonStr);
    } catch (err) {
      errors.push({ start, len: jsonStr.length, err: err.message });
      searchStart = start + 1;
    }
  }

  throw new Error(
    `Could not extract valid JSON from response. Tried ${errors.length} candidate(s): ${errors.map(e => `pos ${e.start} (${e.len} chars: ${e.err})`).join('; ')}. Raw start: ${cleaned.slice(0, 120)}...`
  );
}

/**
 * Safety net: if the model forgets to lock/reuse the visual_bible wording in every
 * scene prompt, patch it in programmatically so scenes don't visually drift even
 * when the LLM output is imperfect. Never touches Midjourney's trailing --params.
 *
 * @param {object} pkg
 * @param {string} imageTool
 * @returns {object} the same pkg, mutated in place and returned for convenience
 */
export function enforceVisualConsistency(pkg, imageTool = 'generic') {
  if (!pkg || !Array.isArray(pkg.prompts)) return pkg;

  if (!pkg.visual_bible || typeof pkg.visual_bible !== 'object') {
    const firstVisual = (pkg.storyboard && pkg.storyboard[0] && pkg.storyboard[0].visual) || '';
    pkg.visual_bible = {
      subject: firstVisual.slice(0, 80) || 'consistent recurring subject across all scenes',
      setting: 'consistent environment established in scene 1',
      palette: 'consistent color palette established in scene 1',
      lighting: 'consistent lighting mood established in scene 1',
      lens_style: 'consistent camera/lens treatment established in scene 1',
      motif: 'a recurring visual element tying scenes together',
    };
  }

  const bible = pkg.visual_bible;
  const anchorPhrases = [bible.palette, bible.lighting, bible.lens_style]
    .filter(Boolean)
    .map((s) => String(s).split(',')[0].trim())
    .filter((s) => s.length > 3);

  pkg.prompts.forEach((p, idx) => {
    if (!p.continuity_note || typeof p.continuity_note !== 'string' || !p.continuity_note.trim()) {
      p.continuity_note =
        idx === 0
          ? 'Establishes the locked subject, setting, palette, and lighting used for the rest of the video.'
          : `Continues directly from Scene ${idx}: same subject, setting, palette, and lighting carry over; only the camera/action changes.`;
    }

    ['image_prompt', 'video_prompt'].forEach((field) => {
      const original = p[field];
      if (!original || typeof original !== 'string') return;
      const lower = original.toLowerCase();
      const missing = anchorPhrases.filter((ph) => !lower.includes(ph.toLowerCase()));
      if (missing.length === 0) return;

      if (field === 'image_prompt' && imageTool === 'midjourney') {
        const match = original.match(/\s(--\S.*)$/);
        if (match) {
          const params = match[1];
          const core = original.slice(0, match.index);
          p[field] = `${core}, ${missing.join(', ')} ${params}`;
          return;
        }
      }
      p[field] = `${original}, ${missing.join(', ')}`;
    });
  });

  return pkg;
}

/**
 * Validates a video package object against structured quality criteria.
 * 
 * @param {object} pkg The video package object to validate
 * @param {string} imageTool Selected image prompt formatter
 * @param {string} videoTool Selected video prompt formatter
 * @param {string} length Target video length preset
 * @returns {string[]} Array of error strings. Empty if valid.
 */
export function validateVideoPackage(pkg, imageTool = 'generic', videoTool = 'generic', length = '30-40 seconds') {
  const errors = [];

  if (!pkg || typeof pkg !== 'object') {
    return ["Output is not a valid object."];
  }

  // 1. Schema Validation
  if (!pkg.title || typeof pkg.title !== 'string' || pkg.title.trim() === '') {
    errors.push("Missing or empty 'title'.");
  }
  if (!pkg.hook || typeof pkg.hook !== 'string' || pkg.hook.trim() === '') {
    errors.push("Missing or empty 'hook'.");
  }

  // Script checks
  if (!Array.isArray(pkg.script)) {
    errors.push("'script' field must be an array.");
  } else if (pkg.script.length === 0) {
    errors.push("'script' array cannot be empty.");
  } else {
    pkg.script.forEach((s, i) => {
      if (!s.time || typeof s.time !== 'string') errors.push(`Script index ${i} is missing a valid 'time' timecode.`);
      if (!s.line || typeof s.line !== 'string' || s.line.trim() === '') errors.push(`Script index ${i} is missing a spoken 'line'.`);
    });
  }

  // Storyboard checks
  if (!Array.isArray(pkg.storyboard)) {
    errors.push("'storyboard' field must be an array.");
  } else if (pkg.storyboard.length === 0) {
    errors.push("'storyboard' array cannot be empty.");
  } else {
    pkg.storyboard.forEach((s, i) => {
      if (s.scene === undefined || typeof s.scene !== 'number') errors.push(`Storyboard index ${i} is missing a numerical 'scene'.`);
      if (!s.duration || typeof s.duration !== 'string') errors.push(`Storyboard index ${i} is missing 'duration'.`);
      if (!s.visual || typeof s.visual !== 'string' || s.visual.trim() === '') errors.push(`Storyboard index ${i} is missing 'visual' description.`);
    });
  }

  // Prompts checks
  if (!Array.isArray(pkg.prompts)) {
    errors.push("'prompts' field must be an array.");
  } else if (pkg.prompts.length === 0) {
    errors.push("'prompts' array cannot be empty.");
  } else {
    pkg.prompts.forEach((p, i) => {
      if (p.scene === undefined || typeof p.scene !== 'number') errors.push(`Prompts index ${i} is missing a numerical 'scene'.`);
      if (!p.image_prompt || typeof p.image_prompt !== 'string' || p.image_prompt.trim() === '') errors.push(`Prompts index ${i} is missing 'image_prompt'.`);
      if (!p.video_prompt || typeof p.video_prompt !== 'string' || p.video_prompt.trim() === '') errors.push(`Prompts index ${i} is missing 'video_prompt'.`);
    });
  }

  if (!pkg.caption || typeof pkg.caption !== 'string' || pkg.caption.trim() === '') {
    errors.push("Missing or empty 'caption'.");
  }
  if (!Array.isArray(pkg.hashtags)) {
    errors.push("'hashtags' field must be an array.");
  }

  // If schema keys are missing, return early since advanced checks will fail/crash
  if (errors.length > 0) return errors;

  // 2. Storyboard and Prompts Alignments
  if (pkg.storyboard.length !== pkg.prompts.length) {
    errors.push(`Storyboard scene count (${pkg.storyboard.length}) does not match prompts scene count (${pkg.prompts.length}).`);
  }

  const sbScenes = pkg.storyboard.map(s => s.scene).sort((a, b) => a - b);
  const prScenes = pkg.prompts.map(p => p.scene).sort((a, b) => a - b);
  
  if (JSON.stringify(sbScenes) !== JSON.stringify(prScenes)) {
    errors.push(`Storyboard scene numbers (${sbScenes.join(',')}) do match prompts scene numbers (${prScenes.join(',')}).`);
  }

  // 3. Placeholder Text Checks
  const placeholderRegex = /TODO|\[\s*insert|<\s*insert|placeholder|lorem\s+ipsum|your\s+visual\s+style|fill\s+in/i;
  
  if (placeholderRegex.test(pkg.title)) errors.push("Title contains placeholder text.");
  if (placeholderRegex.test(pkg.hook)) errors.push("Hook contains placeholder text.");
  if (placeholderRegex.test(pkg.caption)) errors.push("Caption contains placeholder text.");
  
  pkg.script.forEach((s) => {
    if (placeholderRegex.test(s.line)) errors.push(`Script scene ${s.time} contains placeholder text: "${s.line}".`);
  });
  pkg.storyboard.forEach((s) => {
    if (placeholderRegex.test(s.visual)) errors.push(`Storyboard scene ${s.scene} visual description contains placeholder text.`);
  });
  pkg.prompts.forEach((p) => {
    if (placeholderRegex.test(p.image_prompt)) errors.push(`Image prompt for scene ${p.scene} contains placeholder text.`);
    if (placeholderRegex.test(p.video_prompt)) errors.push(`Video prompt for scene ${p.scene} contains placeholder text.`);
  });

  // 4. Format/Tool-Specific Parameter Checks
  if (imageTool === 'midjourney') {
    pkg.prompts.forEach((p) => {
      if (p.image_prompt && !p.image_prompt.includes('--ar')) {
        errors.push(`Scene ${p.scene}: Midjourney prompt is missing required aspect ratio parameter '--ar'.`);
      }
    });
  }

  // 5. Script word-count voiceover checks
  let totalWords = 0;
  pkg.script.forEach((s) => {
    const words = s.line.split(/\s+/).filter(w => w.length > 0);
    totalWords += words.length;
  });

  // Short-form speed limits (words)
  let maxWords = 120;
  let hardLimit = 160;
  if (length === '15-20 seconds') { maxWords = 60; hardLimit = 80; }
  else if (length === '45-60 seconds') { maxWords = 180; hardLimit = 240; }
  else if (length === '60-90 seconds') { maxWords = 270; hardLimit = 360; }

  if (totalWords > hardLimit) {
    errors.push(`Script length exceeds speed limit for target length (${length}). Current: ${totalWords} words, Hard Limit: ${hardLimit} words.`);
  }

  // 6. Virality & Engagement QA Audits

  // Hook scroll-stopper checks
  const badHookRegex = /^(welcome|hey|today we|in this video|hello|let's|hi guys|in this shorts|are you ready)/i;
  if (badHookRegex.test(pkg.hook.trim())) {
    errors.push(`Hook contains generic introduction cliché: "${pkg.hook.substring(0, 30)}...". Direct scroll-stoppers must not contain introductory greeting formulas.`);
  }
  const hookWords = pkg.hook.split(/\s+/).filter(w => w.length > 0).length;
  if (hookWords > 15) {
    errors.push(`Hook line is too wordy (${hookWords} words). Target: Under 15 words to ensure delivery under 2 seconds.`);
  }

  // Visual pacing checks (max 5s per scene)
  pkg.storyboard.forEach((s) => {
    const match = s.duration.match(/(\d+)/);
    if (match) {
      const sec = parseInt(match[1], 10);
      if (sec > 5) {
        errors.push(`Scene ${s.scene} duration is too long (${s.duration}). Keep visual pacing under 5s per scene to maintain viewer retention.`);
      }
    }
  });

  // Snappy voiceover sentence structure checks (average words per line <= 15)
  let lineCounts = 0;
  let lineWords = 0;
  pkg.script.forEach((s) => {
    const words = s.line.split(/\s+/).filter(w => w.length > 0).length;
    lineWords += words;
    lineCounts++;
  });
  const avgWordsPerLine = lineWords / (lineCounts || 1);
  if (avgWordsPerLine > 15) {
    errors.push(`Average words per spoken line is too high (${avgWordsPerLine.toFixed(1)} words). Snappy delivery requires <= 15 words per line.`);
  }

  // Retention text overlays checks (at least 70% scenes, <= 6 words per overlay)
  let overlayCount = 0;
  pkg.storyboard.forEach((s) => {
    if (s.on_screen_text && s.on_screen_text.trim() !== '') {
      overlayCount++;
      const words = s.on_screen_text.split(/\s+/).filter(w => w.length > 0).length;
      if (words > 6) {
        errors.push(`Scene ${s.scene} overlay text is too long (${words} words). Keep overlays to punchy phrases (max 6 words).`);
      }
    }
  });
  const overlayRatio = overlayCount / pkg.storyboard.length;
  if (overlayRatio < 0.7) {
    errors.push(`Snappy text overlays are only present on ${Math.round(overlayRatio * 100)}% of scenes. Make sure at least 70% of storyboard scenes have overlay text.`);
  }

  // AI Prompt Quality & composition checks (minimum depth, keywords)
  const qualityKeywords = /close-up|close up|macro|dolly|zoom|pan|tilt|static|handheld|cinematic|lighting|depth of field|studio lighting|moody|realistic|detailed|tracking|ar\s|angle|movement/i;
  pkg.prompts.forEach((p) => {
    if (p.image_prompt.length < 50) {
      errors.push(`Image prompt for Scene ${p.scene} is too thin/short (${p.image_prompt.length} chars). Detailed prompts should be at least 50 characters.`);
    }
    if (p.video_prompt.length < 50) {
      errors.push(`Video prompt for Scene ${p.scene} is too thin/short (${p.video_prompt.length} chars). Detailed prompts should be at least 50 characters.`);
    }
    const imageHasKw = qualityKeywords.test(p.image_prompt);
    const videoHasKw = qualityKeywords.test(p.video_prompt);
    if (!imageHasKw && !videoHasKw) {
      errors.push(`Scene ${p.scene} prompts lack descriptive camera/composition/lighting qualifiers. Add directives like zoom, close-up, cinematic, or dolly.`);
    }
  });


  return errors;
}

/**
 * Scores a video package across weighted quality dimensions. Pure/deterministic —
 * no LLM call involved, so this is essentially free (sub-millisecond) and safe to
 * run on every generation. Returns numeric scores (0-100) per category, a weighted
 * overall score, a human-readable grade, and specific flags explaining deductions.
 *
 * This is intentionally separate from validateVideoPackage(): that function returns
 * hard pass/fail errors used to decide whether to retry at all (malformed/misaligned
 * output). This function scores *quality* on a spectrum, even on a technically valid
 * package, so the person always sees where a generation is strong or weak.
 *
 * @param {object} pkg
 * @param {string} imageTool
 * @param {string} videoTool
 * @param {string} length
 * @returns {{scores: object, overall: number, grade: string, flags: string[]}}
 */
export function scoreVideoPackage(pkg, imageTool = 'generic', videoTool = 'generic', length = '30-40 seconds') {
  const flags = [];
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

  // ---- Hook Strength (weight 20) ----
  let hookScore = 100;
  const hook = (pkg.hook || '').trim();
  const hookWords = hook.split(/\s+/).filter(Boolean).length;
  const badHookRegex = /^(welcome|hey|today we|in this video|hello|let's|hi guys|in this shorts|are you ready)/i;
  const strongHookRegex = /^(nobody|no one|this is why|stop|the reason|here's why|the truth|you're doing|what if|why does|the one thing|scientists|it turns out|i tried|this changed)/i;
  if (badHookRegex.test(hook)) { hookScore -= 45; flags.push('Hook: generic intro cliché detected — biggest single score hit.'); }
  if (hookWords > 15) { hookScore -= 20; flags.push(`Hook: ${hookWords} words — trim toward 8-12 for a sub-2-second read.`); }
  else if (hookWords > 12) { hookScore -= 8; flags.push(`Hook: ${hookWords} words — a bit long, tightest hooks run 6-10 words.`); }
  if (!strongHookRegex.test(hook) && !/[?!]/.test(hook)) { hookScore -= 15; flags.push('Hook: no clear pattern-interrupt or curiosity-gap structure detected.'); }
  hookScore = clamp(hookScore);

  // ---- Pacing & Retention Design (weight 20) ----
  let pacingScore = 100;
  const scenes = pkg.storyboard || [];
  let overSceneCount = 0;
  scenes.forEach((s) => {
    const m = (s.duration || '').match(/(\d+)/);
    if (m) {
      const sec = parseInt(m[1], 10);
      if (sec > 5) overSceneCount++;
      else if (sec > 4) pacingScore -= 2;
    }
  });
  if (overSceneCount > 0) { pacingScore -= Math.min(40, overSceneCount * 12); flags.push(`Pacing: ${overSceneCount} scene(s) exceed 5s — retention drops sharply on long static beats.`); }
  const overlayCount = scenes.filter(s => s.on_screen_text && s.on_screen_text.trim() !== '').length;
  const overlayRatio = scenes.length ? overlayCount / scenes.length : 0;
  if (overlayRatio < 0.7) { pacingScore -= Math.round((0.7 - overlayRatio) * 100); flags.push(`Pacing: only ${Math.round(overlayRatio * 100)}% of scenes carry text overlays (target 70%+).`); }
  const longOverlays = scenes.filter(s => s.on_screen_text && s.on_screen_text.split(/\s+/).filter(Boolean).length > 6).length;
  if (longOverlays > 0) { pacingScore -= longOverlays * 5; flags.push(`Pacing: ${longOverlays} overlay(s) run longer than 6 words — keep overlays punchy.`); }
  pacingScore = clamp(pacingScore);

  // ---- Script Delivery (weight 15) ----
  let scriptScore = 100;
  const scriptLines = pkg.script || [];
  const totalWords = scriptLines.reduce((sum, s) => sum + (s.line || '').split(/\s+/).filter(Boolean).length, 0);
  const avgWords = scriptLines.length ? totalWords / scriptLines.length : 0;
  if (avgWords > 15) { scriptScore -= 25; flags.push(`Script: average ${avgWords.toFixed(1)} words/line — tighten toward <=15 for fast delivery.`); }
  else if (avgWords > 12) { scriptScore -= 10; flags.push(`Script: average ${avgWords.toFixed(1)} words/line — a little dense.`); }
  let wordBudget = 120;
  if (length === '15-20 seconds') wordBudget = 60;
  else if (length === '45-60 seconds') wordBudget = 180;
  else if (length === '60-90 seconds') wordBudget = 270;
  if (totalWords > wordBudget * 1.15) { scriptScore -= 20; flags.push(`Script: ${totalWords} words is over budget for ${length} (~${wordBudget} target).`); }
  scriptScore = clamp(scriptScore);

  // ---- Visual Prompt Quality (weight 20) ----
  let promptScore = 100;
  const prompts = pkg.prompts || [];
  const qualityKeywords = /close-up|close up|macro|dolly|zoom|pan|tilt|static|handheld|cinematic|lighting|depth of field|studio lighting|moody|realistic|detailed|tracking|angle|movement/i;
  let thinCount = 0, noKwCount = 0, misalignedMj = 0;
  prompts.forEach((p) => {
    const imgLen = (p.image_prompt || '').length;
    const vidLen = (p.video_prompt || '').length;
    if (imgLen < 50 || vidLen < 50) thinCount++;
    if (!qualityKeywords.test(p.image_prompt || '') && !qualityKeywords.test(p.video_prompt || '')) noKwCount++;
    if (imageTool === 'midjourney' && !(p.image_prompt || '').includes('--ar')) misalignedMj++;
  });
  if (thinCount > 0) { promptScore -= Math.min(40, thinCount * 10); flags.push(`Prompts: ${thinCount} scene(s) under 50 chars — too thin for consistent AI-image results.`); }
  if (noKwCount > 0) { promptScore -= Math.min(30, noKwCount * 8); flags.push(`Prompts: ${noKwCount} scene(s) missing camera/lighting/composition keywords.`); }
  if (misalignedMj > 0) { promptScore -= Math.min(20, misalignedMj * 10); flags.push(`Prompts: ${misalignedMj} scene(s) missing Midjourney '--ar' parameter.`); }
  if (!pkg.visual_bible) { promptScore -= 15; flags.push('Consistency: no visual_bible found — scenes risk looking like unrelated images rather than one continuous video.'); }
  const noContinuity = prompts.filter(p => !p.continuity_note || !String(p.continuity_note).trim()).length;
  if (noContinuity > 0) { promptScore -= Math.min(20, noContinuity * 6); flags.push(`Consistency: ${noContinuity} scene(s) missing a continuity_note tying it to the previous scene.`); }
  promptScore = clamp(promptScore);

  // ---- Growth & CTA (weight 15) ----
  let growthScore = 100;
  const growthKeywords = /follow|save|comment|part 2|thoughts|what do you|which one|share/i;
  const salesyCTARegex = /subscribe to my channel|visit my website|buy my product|link in bio/i;
  const hasGrowthCTA = growthKeywords.test(pkg.caption || '') || scriptLines.some(s => growthKeywords.test(s.line || ''));
  if (!hasGrowthCTA) { growthScore -= 45; flags.push('Growth: no comment/save/follow/share trigger found in caption or script.'); }
  if (salesyCTARegex.test(pkg.caption || '') || scriptLines.some(s => salesyCTARegex.test(s.line || ''))) { growthScore -= 35; flags.push('Growth: generic sales/subscribe language detected — hurts native engagement.'); }
  const hashtagCount = Array.isArray(pkg.hashtags) ? pkg.hashtags.length : 0;
  if (hashtagCount < 3) { growthScore -= 15; flags.push(`Growth: only ${hashtagCount} hashtag(s) — aim for 5-8 relevant tags.`); }
  growthScore = clamp(growthScore);

  // ---- Structural Integrity (weight 10) ----
  let structureScore = 100;
  const sbCount = scenes.length, prCount = prompts.length;
  if (sbCount !== prCount) { structureScore -= 40; flags.push(`Structure: storyboard has ${sbCount} scenes but prompts has ${prCount}.`); }
  const placeholderRegex = /TODO|\[\s*insert|<\s*insert|placeholder|lorem\s+ipsum|fill\s+in/i;
  const hasPlaceholder = placeholderRegex.test(pkg.title || '') || placeholderRegex.test(hook) || placeholderRegex.test(pkg.caption || '');
  if (hasPlaceholder) { structureScore -= 50; flags.push('Structure: placeholder text detected in title/hook/caption.'); }
  structureScore = clamp(structureScore);

  const weights = { hook: 0.20, pacing: 0.20, script: 0.15, prompts: 0.20, growth: 0.15, structure: 0.10 };
  const scores = { hook: hookScore, pacing: pacingScore, script: scriptScore, prompts: promptScore, growth: growthScore, structure: structureScore };
  const overall = clamp(
    scores.hook * weights.hook +
    scores.pacing * weights.pacing +
    scores.script * weights.script +
    scores.prompts * weights.prompts +
    scores.growth * weights.growth +
    scores.structure * weights.structure
  );

  let grade;
  if (overall >= 90) grade = 'Excellent — high virality readiness';
  else if (overall >= 75) grade = 'Strong — minor polish only';
  else if (overall >= 60) grade = 'Workable — noticeable weak spots';
  else grade = 'Weak — regenerate recommended';

  return { scores, weights, overall, grade, flags };
}
