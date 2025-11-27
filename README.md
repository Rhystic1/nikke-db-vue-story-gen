# Story Generator and Roleplaying Generator for Nikke-DB (Standalone Version)

This is a fork of Nikke-DB that includes a Story and Roleplay generator using the pre-existing Live2D Visualizer feature. 

**NOTE: YOU MUST provide your own API key (currently Gemini or Perplexity) to use this feature! I am also NOT RESPONSIBLE for any cost that you might incur while using your API key for this feature!**

## Features
- Uses the existing Live2D Visualizer feature to display characters and animations that intelligently adapts to the dialogue and actions of your story!
- Ensures lore accuracy and realistic character personality by checking the NIKKE Wikia before outputting text! This is very fast and happens behind the scenes!
- No action necessary from the user to change characters or animations!
- Roleplay Mode: Play as the Protagonist (the Commander). Your input in the chatbox is treated as dialogue. Wrap your text in [] for actions and to steer the story.
- Story Mode: Automatically generates a story based on your input.
- Choose between Auto or Manual to either read the story at your own pace or let the website decide when to proceed to the next line depending on the current paragraph's length.

## Current Limitations
- A personal API key is required to use this feature.
- Only the Gemini and Perplexity APIs are supported at the moment, and only specific models.
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

You can change settings using the Gear button in the upper right corner.

# FAQ
<details>
<summary><strong>How do I run this locally?</strong></summary>

Just like the original codebase, clone the repository and then run ```npm run dev```. Open your browser, and navigate to the link your terminal gives you. 

</details>

<details>
<summary><strong>Where is the rest of the Nikke-DB website?</strong></summary>

The main branch of this fork is a standalone version that includes the Story/Roleplaying generator exclusively. I will create another branch (and possibly create a PR so that it can be merged to the actual, original Nikke-DB website) that includes everything soon.

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
<summary><strong>Are you going to fix bugs and add new features?</strong></summary>
Time-permitting, yes. Stay tuned.

</details>

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

