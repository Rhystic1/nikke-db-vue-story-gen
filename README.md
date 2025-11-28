# Story Generator and Roleplaying Generator for Nikke-DB (Standalone Version)

This is a fork of Nikke-DB that includes a Story and Roleplay generator using the pre-existing Live2D Visualizer feature. 

**NOTE: YOU MUST provide your own API key (currently Gemini, Perplexity or OpenRouter) to use this feature! I am also NOT RESPONSIBLE for any cost that you might incur while using your API key for this feature!**

## Features
- Uses the existing Live2D Visualizer feature to display characters and animations that intelligently adapts to the dialogue and actions of your story!
- Ensures lore accuracy and realistic character personality by checking the NIKKE Wikia before outputting text! This is very fast and happens behind the scenes!
- No action necessary from the user to change characters or animations!
- Roleplay Mode: Play as the Protagonist (the Commander). Your input in the chatbox is treated as dialogue. Wrap your text in [] for actions and to steer the story.
- Story Mode: Automatically generates a story based on your input.
- Choose between Auto or Manual to either read the story at your own pace or let the website decide when to proceed to the next line depending on the current paragraph's length.

## Current Limitations
- A personal API key is required to use this feature.
- Only the Gemini, Perplexity and OpenRouter APIs are supported at the moment, and only specific models.
- Backgrounds are not implemented (yet).
- Only one character can be displayed at a time, but it dynamically changes based on the context.
- The quality and coherence of the story depends on the selected AI model.
- Despite instructions and fallbacks, the model may still occasionally call the Commander using the wrong honorific, or it may not playback the most relevant animation.
- The model may sometimes fail to output JSON, causing a failure. However, a failure may be recovered by attempting the same line again.
- No ability to save or load a story/roleplaying session (yet).

## Currently Available Models
| API        | Model Name          | Speed | Quality | Comment                |
|-----------|---------------------|-------|---------|------------------------|
| Perplexity    | Sonar    | Fast  | Low  | Lightweight and cheap, but while testing the quality and lore-accuracy was not great. _Not recommended_    |
| Perplexity    | Sonar Pro | Medium| Medium  | Much better than Sonar, but more expensive  |
| Gemini | Gemini 2.5 Flash  | Fast | Medium/High  | Better than Sonar or Sonar Pro and fairly lore-accurate, cheaper than Gemini 2.5 Pro but prone to the occasional mess-up. _Recommended_       |
| Gemini | Gemini 2.5 Pro    | Low  | Very High  | Exceptional storytelling and roleplaying capabilities, but slower and more expensive   |
| OpenRouter | xAI: Grok 4.1 Fast (free)    | Low (first prompt), High  | Very High  | Great creative writing skills and character coherence, plus it's (temporarily) free! _Recommended_   |
| OpenRouter | _Too many to list_    | Low (first prompt), Variable  | Variable  | Too many paid models to list here. Careful not to choose models that are too expensive. See OpenRouter's model pricing page for more information   |

You can change settings using the Gear button in the upper right corner.

# FAQ
<details>
<summary><strong>How do I run this locally?</strong></summary>

Just like the original codebase, clone the repository and then run ```npm install``` followed by ```npm run dev```. Open your browser, and navigate to the link your terminal gives you. 

</details>

<details>
<summary><strong>Where is the rest of the Nikke-DB website?</strong></summary>

The main branch of this fork is a standalone version that includes the Story/Roleplaying generator exclusively. ~~I will create another branch (and possibly create a PR so that it can be merged to the actual, original Nikke-DB website) that includes everything soon.~~
**UPDATE:** A PR has been raised to integrate this fork into the main website. In the meantime, if you prefer to run the entire website yourself, checkout the branch `integrated` of this fork.

</details>

<details>
<summary><strong>Where do I put my API Key?</strong></summary>

Click on the Gear/Settings icon in the top right corner, then choose your API provider and input the key in the appropriate box.

</details>

<details>
<summary><strong>What will be the costs incurred of a Story or Roleplaying session?</strong></summary>

This is highly dependent on a variety of factors, including the API provider, the model that you have selected, your plan, the length of the story/roleplaying session, etc.
Because of this, I am unable to give you a direct answer. However, certain Gemini API tiers are completely free, therefore if you do not provide payment details to Google when you create your Developer account, you may not need to spend anything. Google is so far quite generous with their free tiers, though you might be limited to the "Flash" variant rather than the "Pro" one. Please refer to their website for more information.

As mentioned, you are solely responsible for any costs incurred while using this feature.

</details>

<details>
<summary><strong>Is my API key secure?</strong></summary>

When you input your API key, it will be stored locally on your browser. When you send your text, a request containing your API key is sent to the Provider you have selected to ensure that you are authorized to use their models, but that information is sent exclusively to them, and never to Nikke-DB or anyone else. You can look at the code yourself to be sure, and you can even run the website locally yourself if you want.

</details>

<details>
<summary><strong>I want to use a paid OpenRouter key, and I bought some credits. Which model do you suggest?</strong></summary>
This depends on your preferences for speed, quality and cost. As there are hundreds of models to choose from, it is difficult to give a definitive answer, however I do not recommend using expensive models (e.g. Claude Sonnet 4.5, Claude Opus 4.5, Gemini 3 Pro, etc.) for a simple story/roleplay session. I would also avoid models that are designed specifically for other tasks such as coding (e.g. GPT-5.1 Codex) as their quality will be poor in this instance. 

Look for models that are tuned for storytelling. If you really don't know what to choose and want a name, a "safe" option would be Grok 4.1 Fast (free). Note that this model may not remain free forever, depending on xAI and OpenRouter.

</details>

<details>
<summary><strong>Are you going to fix bugs and add new features?</strong></summary>
Time-permitting, yes. Stay tuned.

</details>

<details>
<summary><strong>How do I save or load a story?</strong></summary>
At the moment, you can't. I will work on implementing a Save/Restore feature once I can. As a temporary workaround to save your story (not load it later, though), you can either:
  
  - Copy the most recent "Sending to Gemini" or "Sending to Perplexity" object from your Browser Console, if you are running the fork locally
  - Drag the text from the chat box, copy it and paste it to a text file

</details>

<details>
<summary><strong>Occasionally/During the first prompt I do not see any character on the screen. Is this normal?</strong></summary>
Yes and no, it depends: the character selection logic has a couple of rules that determine whether to show any character at that particular moment of the story or not. Generally speaking, no character will appear in the following circumstances:
  
- It is the very first turn of the conversation (e.g. initial setting)
- The Commander is speaking
- Actions are occurring in the story

However, sometimes the logic still fails to properly assign a character to show on screen despite it being fairly evident that the actions in the story are involving a specific character, even if they are not speaking. Fortunately, this doesn't happen often, however I am working to improve this. 

</details>

<details>
<summary><strong>When using my OpenRouter key with a free account/no credits and selecting a free model, I immediately get an error message on submitting the first prompt. Why?</strong></summary>
This happens with new OpenRouter accounts that did not purchase any credits. From my understanding, this is meant to be an anti-spam protection to avoid people constantly creating new accounts and overwhelming their servers with unpaid requests. There is nothing I can do about this, however there is a (paid) solution:

  - Go to your account page in OpenRouter and purchase **at least $10 of credits.**

This should automatically fix the issue. Note that you do not have to spend those credits, and even if and when you do, you will not need to purchase credits again to fix the original issue.
Furthermore, while I have taken some protective steps to avoid the user spending credits if they are choosing the free option, if you want to be even safer you can go to your API Keys page in your OpenRouter account page and set a limit in $ for your API key (like $0 or $1).

The above steps solved the problem for me during testing. If you are still experiencing the same issue however, please see below...
</details>

<details>
<summary><strong>Could I still be charged if I use a free model from OpenRouter?</strong></summary>
Yes, but only in certain situations.

In order to ensure a better quality experience, the model will search the Goddess of Victory: NIKKE Wikia to gather certain details regarding the characters that are part of the scene, such as how they address the Commander, their personality, etc.

The model should execute a web search only the first time a character appears in a scene, and will only obtain limited information, however certain providers may charge a fee after a certain amount of web searches, even if you are using a free model.

Once again, I would strongly recommend checking your provider's pricing page for more information, and remember that if you want to avoid any unexpected charge you can always set a limit on your API key! However, please note that if you do trigger a charge from your provider and that charge would put you above the limit for your key, you will likely encounter an error and be unable to proceed.

As always, you are the sole responsible for any cost.

</details>

<details>
<summary><strong>Some characters seem to behave weirdly/not in character or they don't speak like they should. Why? Is there something I can try?</strong></summary>
Unfortunately, Large Language Models (LLMs) are, by nature, quite random. This means that occasionally, despite specific and critical instructions, they may still output incoherent or incorrect content. This is especially true with smaller/cheaper models. In addition, those that are currently available in this branch/fork are _general_ models that are not specifically tuned for roleplaying or story telling, although they can still produce excellent results.

While I will keep trying to improve the quality of the output as much as I can with the tools and API I have at disposal, there are a couple things that you can do:

1) Avoid very long stories, as the model might lose context/coherence sooner
2) Retry by instructing the model (using "[]") to retry the last turn
3) Start from scratch by refreshing the page. You'd be surprised how wildly better the result can be by simply starting again!

</details>

<details>
<summary><strong>At times, I see duplicated character names when they speak. Why?</strong></summary>
This is a known bug I will attempt to fix soon. Sorry about that!
</details>

<details>
<summary><strong>What's the difference between "Send" and "Continue"?</strong></summary>
  
- **Send**: Will use your words/dialogue/instructions to progress the story.
- **Continue**: Does not provide any specific instruction to the model, and the AI will move the story forward on its own until your next turn.

</details>

<details>
<summary><strong>Why do I see "Error 503" in the chatbox at times?</strong></summary>
This is entirely on Google's end, and there is nothing I can do about it. During peak times of AI usage, you may sometimes see that message. If that happens, click "Retry". If you see the message again, try waiting a couple of minutes before pressing the button again.
</details>

<details>
<summary><strong>Why does it take longer to get a response on the first prompt?</strong></summary>
This is most noticeable when using OpenRouter, and it is possibly due to the web search that occurs at the start. From testing, other providers take much less to load a response, and remember that the speed also depends on the model that you have selected. Regardless, you should get faster speeds after the first prompt.
</details>

<details>
  <summary><strong>How do I donate?</strong></summary>
  Thank you very much for your generosity! See **Support the Project** below!
</details>

# Support the Project
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/V7V51P8O3V)

# Nikke-DB-Vue (Original Readme)

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

