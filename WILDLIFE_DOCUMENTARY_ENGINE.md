# Wildlife Documentary Engine

This adds a niche-first content engine for **Cinematic Viral Wildlife Explainers**.

It is built from the repeatable structure observed in the reference-style videos:

```text
Impossible animal hook → animal reveal → survival problem → adaptation chain → macro/visual proof → consequence/twist → memorable survival payoff
```

This is intentionally different from the older generic faceless-content toolkit. The goal is to master one niche first before adding another.

## New files

| File | Purpose |
| --- | --- |
| `wildlife-documentary-engine.js` | Shared niche system prompt, episode types, schema rules, enforcement, validation, and wildlife QA scoring. |
| `wildlife-documentary-mcp.js` | Dedicated MCP server/tool for generating wildlife documentary packages. |
| `wildlife_documentary_generator.html` | Locked standalone browser UI with no generic niche presets. |

## Dedicated episode types

- `auto` — pick the strongest structure from the topic.
- `strange_hunting_method` — for animals with unusual hunting behavior.
- `impossible_survival` — for animals surviving hostile environments.
- `silent_predator` — for predators built around stillness, patience, or sensory advantage.
- `bizarre_body_tool` — for strange anatomy that works like a survival tool.
- `extreme_evolution_trick` — for surprising evolved adaptations.

## Output schema additions

The wildlife engine adds fields that the generic generator does not require:

```json
{
  "episode_type": "strange_hunting_method",
  "animal": "aye-aye",
  "core_mystery": "It hunts using sound, not sight.",
  "survival_problem": "Larvae are hidden inside tree bark.",
  "adaptation_chain": [
    {
      "problem": "Prey is hidden under wood",
      "adaptation": "Percussive tapping and listening",
      "visual_proof": "Macro shot of finger tapping bark"
    }
  ],
  "payoff_line": "A survival method few primates can match.",
  "fact_check_notes": [
    "Verify absolute claims such as only/never/no other before publishing."
  ]
}
```

## MCP setup

Run the existing router if you want provider fallback:

```bash
npm run start:router
```

Then connect the dedicated MCP entrypoint to Hermes or another MCP client:

```yaml
mcp_servers:
  wildlife_documentary:
    command: "node"
    args: ["/absolute/path/to/faceless-content-toolkit/wildlife-documentary-mcp.js"]
    env:
      FCT_ROUTER_URL: "http://127.0.0.1:3737"
```

The MCP tool name is:

```text
generate_wildlife_documentary_content
```

Example request:

```text
Generate a 30-40 second strange hunting method episode about the aye-aye.
```

## Standalone UI setup

Start the existing secure provider router:

```bash
npm run start:router
```

Open this file directly in the browser:

```text
wildlife_documentary_generator.html
```

Or serve it beside the router and keep the router URL as:

```text
http://127.0.0.1:3737
```

## Why this exists

The previous app had a broad niche selector and workflow library. That is useful later, but it made the output too generic for a specific viral documentary niche.

The new wildlife engine focuses on one repeatable system first:

- impossible hook language
- animal reveal timing
- survival-problem structure
- adaptation chain logic
- macro/cutaway visual proof
- wildlife-specific QA
- fact-check notes for risky animal claims
- documentary-native captions

## Next recommended integration

After testing this additive version, merge it into the main UI by replacing the old generic `Niche Category` selector with a fixed `Wildlife Documentary` mode and linking the existing Generate button to the new wildlife system prompt.
