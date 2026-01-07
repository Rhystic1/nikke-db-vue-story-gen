# Story Generator and Roleplaying Generator for Nikke-DB (Standalone Version)

This is a fork of Nikke-DB that includes a Story and Roleplay generator using the pre-existing Live2D Visualizer feature.
## IMPORTANT!
Please use the `integrated` branch instead of this one. The `integrated` is updated much more frequently and will be the main one going forward.

**NOTE: YOU MUST provide your own API key (currently Gemini, Perplexity, OpenRouter, or other supported routers) to use this feature! I am also NOT RESPONSIBLE for any cost that you might incur while using your API key for this feature!**

## Features
- Uses the existing Live2D Visualizer feature to display characters and animations that intelligently adapt to the dialogue and actions of your story.
- Internal character profiles DB (enabled by default) — fast, free character lookups. Optional web-search fallback for characters not in the DB.
- Ensures lore accuracy and realistic character personality by checking the NIKKE Wikia (when needed) or the internal database before outputting text.
- No manual switching required — character selection and animations change automatically based on context and who is speaking.
- Roleplay Mode: Play as the Protagonist (the Commander). Your input is treated as dialogue; wrap actions or stage directions in `[]` to steer the story.
- Story Mode: Automatically generates a story from your prompt.
- Game Mode: Choice-driven mode — the system generates player choices instead of requiring typed input.
- Choose between Auto or Manual pacing to either read at your own pace or allow the app to auto-advance lines depending on paragraph length.
- Save/Load sessions locally. Optionally replay animations (and yapping) for previous lines, including when restoring save files.
- TTS support (multiple providers / experimental engines).
- Token/usage settings included in the UI.

## Current Limitations
- You must provide an API key for a supported provider.
- Only one character is shown at a time; selection is context-driven. Selection logic has been improved, but edge-cases may remain.
- Background images are not implemented yet.
- The quality, coherence, and fidelity of the story depend on your selected model and settings.
- LLMs may still occasionally misbehave (as normal for this kind of AI).
- Some provider-specific quirks exist (OpenRouter free accounts, Pollinations model instability, etc.). See FAQ for more info.

## Partial List of Tested Models / Providers (summary)
| API / Provider | Model Name / Notes | Speed | Quality | Comment |
|---|---:|:---:|:---:|---|
| Perplexity | Sonar | Fast | Very Low | Garbage for storytelling. Not recommended. |
| Perplexity | Sonar Pro | Medium | Low | Slightly better but still not recommended. |
| Gemini | Gemini 3 Flash | Very Fast | Medium/High | Good balance of cost/speed; recommended for many users. |
| Gemini | Gemini 3 Pro | Medium | High | Very good quality, but more expensive. |
| OpenRouter/Pollinations | xAI: Grok 4.1 Fast | Fast | High | Great creative writing, though it has a tendency to write less in a turn compared to other models. |
| OpenRouter/Pollinations | Anthropic: Claude 4.5 Haiku | Fast | High | Strong coherence and storytelling, but starts to get expensive. |
| OpenRouter/Pollinations | Anthropic: Claude 4.5 Sonnet | Medium | Very High | Fantastic lore knowledge and storytelling, but very expensive and sometimes too restrictive. |
| OpenRouter/Pollinations | DeepSeek V3.2 | Fast | Medium | Cost-effective and generally good quality, but prone to repetition |
| Local (Beta and experimental), OpenAI v1 API | Whatever model you run locally | Varies | Varies, Usually slower | Experimental support; needs configuration and tuning. |

Model availability changes often

You can change settings using the Gear button in the upper right corner.

# FAQ

<details>
<summary><strong>How do I run this locally?</strong></summary>

Just like the original codebase, clone the repository and then run:

```bash
npm install
npm run dev
```

Open your browser and navigate to the Vite URL printed in the terminal.
</details>

<details>
<summary><strong>Where is the rest of the Nikke-DB website?</strong></summary>

Use the `integrated` branch.
</details>

<details>
<summary><strong>Where do I put my API Key?</strong></summary>

Click the Gear/Settings icon (top-right), choose your API provider, and paste your API key in the appropriate input. Keys are stored locally in your browser (not sent to Nikke-DB). The app sends your key only to the provider you selected when making requests.
</details>

<details>
<summary><strong>What will be the costs incurred of a Story or Roleplaying session?</strong></summary>

Costs depend on:
- chosen provider;
- model and tier;
- the length and complexity of prompts and responses;
- whether you enable web lookups (non-Wikia fetches) and TTS (non-local).

Sometimes, Pollinations is available without using an API key. Otherwise, try signing up for a Gemini API key, as they offer free tiers.

To limit cost:
- use internal character DB (default);
- pick cheaper models or set per-key spend limits in your provider dashboard.

You are responsible for all costs from your API usage.
</details>

<details>
<summary><strong>Is my API key secure?</strong></summary>

Keys are saved locally in your browser. When you send a prompt, the app makes requests to your selected provider using your key. Keys are not sent to Nikke-DB or anyone else. If you prefer, run the app locally and confirm behavior yourself.
</details>

<details>
<summary><strong>Which models should I use?</strong></summary>

- For best storytelling quality: Anthropic models (such as Claude 4.5 Haiku), Gemini 3 Pro, Grok 4.1 (xAI) and DeepSeek V3.2 are good picks depending on cost and latency.
- Avoid Sonar/Sonar Pro (Perplexity). They performed poorly in testing.
- Avoid models that are too small or that are tuned for other tasks such as coding.

</details>

<details>
<summary><strong>Are you going to fix bugs and add new features?</strong></summary>

Yes, time-permitting. Notable recent feature additions include:
- Internal character DB (default),
- Game Mode,
- NIKKE View Mode,
- TTS hooks (Chatterbox, GPT-SoVits),
- Response Healing Schema & parsing improvements,
- Replay of animations for previous lines,
- Context caching and character progression memory.
</details>

<details>
<summary><strong>How do I save or load a story?</strong></summary>

Use the Save button to export session data locally and the Load button to restore it. Save files may optionally contain recorded animation identifiers for replay (disabled by default to keep files smaller).
</details>

<details>
<summary><strong>Occasionally/during the first prompt I do not see any character on the screen. Is this normal?</strong></summary>

Sometimes yes. The selection logic intentionally hides characters in certain situations:
- The very first turn (initial setting) - often no character shown;
- When the Commander is speaking;
- When only stage actions occur (no dialogue);

Recent fixes improve selection logic, and the internal DB + more robust profile parsing reduces missing-character situations, but rare failures may still occur.
</details>

<details>
<summary><strong>When using my OpenRouter key with a free account/no credits I immediately get an error on first request. Why?</strong></summary>

OpenRouter sometimes blocks first requests from new accounts with no credits as an anti-abuse measure. Purchasing **at least $10 of credits** usually fixes this. You don't have to always have $10 on your balance - just purchase those once and then you can use whatever you want.
</details>

<details>
<summary><strong>Could I still be charged if I use a free model from OpenRouter?</strong></summary>

In the great majority of cases you won't, but if a model supports native web search capabilities and you have "Allow Web Search Fallback" set to ON or "Use NIKKE-DB Knowledge" set to OFF, it is possible that the model may search the web if a character is not in the list.

Refer to your provider for cost info, and make sure to add a credit limit on your API key.

As always, you are responsible for any cost incurred.
</details>

<details>
<summary><strong>Some characters behave weirdly or not in-character. How can I improve results?</strong></summary>

- Use a better model (higher-quality models reduce hallucination);
- Use the AI Reminders button to inject clarifying instructions (e.g., correct honorifics);
- Retry/regenerate the last message using the regenerate button;
- Start a new session — sometimes a fresh context helps.
</details>

<details>
<summary><strong>Why do I sometimes see duplicated character names when they speak?</strong></summary>

That was a bug and should be fixed by recent commits. If you still see it, please raise an Issue with a reproducible example.
</details>

<details>
<summary><strong>What's the difference between "Send" and "Continue"?</strong></summary>

- **Send**: Uses your words/dialogue/instructions to progress the story (your input matters).
- **Continue**: Lets the AI advance the story without additional input, continuing from the current state.
</details>

<details>
<summary><strong>Why do I see "Error 503" sometimes?</strong></summary>

That is returned by some providers (not the app) during high load — commonly seen with Gemini during peak usage. Retry later or switch provider/model.
</details>

<details>
<summary><strong>Why is the first prompt slower?</strong></summary>

The first prompt may be slower for reasons such as:
- Initial web lookups for character profiles (if the character isn’t in the internal DB and web fallback is enabled);
- Overloaded model.

Subsequent prompts are usually faster.
</details>

<details>
  <summary><strong>How do I donate?</strong></summary>
  Thank you very much! See **Donate** below.
</details>

# Tips & Tricks
- CHOOSE A GOOD MODEL. Model choice is the single most important variable for output quality.
- Use the Internal Character DB (default) to reduce web lookups and costs.
- Be patient for the first reply; subsequent replies are typically faster.
- If output is garbled or malformed JSON:
  - Use the regenerate button for the last message,
  - Try a different model,
  - Or retry the same line; sometimes the secondary JSON-cleanup pass recovers it.
- If honorifics are wrong, use the AI Reminders button or add an explicit stage direction like:
  `[CRITICAL INSTRUCTION: Use this exact honorific table: Bay -> Coach when talking to the Commander.]`
- Use God Mode to prevent fatal outcomes for the Commander if you want safer stories.
- Use the Asset Quality setting to trade visual quality for performance on lower-end hardware.

# Donate
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V51P8O3V)

# Nikke-DB-Vue (Original Readme excerpt)

# Nikke-DB-Vue

New front-end code for the Nikke-db website. Stars are welcomed.

Files are hosted in the repo [https://github.com/Nikke-db/Nikke-db.github.io](https://github.com/Nikke-db/Nikke-db.github.io) and uploaded to a cloudflare page website for access.  

Made by Koshirei

```git clone, npm install, npm run dev```  
If you know, you know.  

## Want to help?
Sure ! Fork the repository and fix a bug you've found, a bug someone else found, or make your own feature! If possible use Naive UI components that fits the theme of the website. Once the feature is done, open a Pull Request and after trying out the fix or feature I'll add it to the website.  
Make sure mobile display is good enough ( not asking for perfection ), grab width and conditions from other components to have the same workflow. To test it out run ```npm run serve``` and open a network url on your mobile device ( connected on the same wifi ! ) to instantly test out your modification on mobile.

## Pull Requests requirements
Before asking any pull request, run ```npm run lint```, fix all the warning and errors from eslint.
If your feature require to use files, especially spine assets, "si_" icons, "mi_" banners, or anything else, host them on [https://github.com/Nikke-db/Nikke-db.github.io](https://github.com/Nikke-db/Nikke-db.github.io) and make a Pull Request there as well.


