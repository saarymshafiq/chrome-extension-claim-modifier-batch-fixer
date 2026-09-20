# Insurance Claim Modifier Batch Fixer

A Chrome extension I built as a billing and insurance coordinator at a mental health 
practice to speed up correcting a specific, high-volume billing error: claims flagged 
"Action Required" because the telehealth billing modifier (CPT modifier 95) doesn't 
match the visit's Place of Service.

Instead of opening each flagged claim one at a time, manually checking whether the 
visit was in-office or telehealth, and editing the modifier by hand, this tool batches 
the process — while leaving the actual decision to submit each claim in human hands.

**This tool never submits a claim.** It corrects the modifier and saves the claim, 
then stops and flags it for manual review. Submitting a claim to an insurer is a 
decision I make deliberately for each one, not something automated.

## The problem

- 90837/90791 telehealth visits require a `95` modifier; in-office visits must not 
  have it
- When it's wrong, the claims system flags the claim "Action Required" but doesn't 
  fix it for you — someone has to open each one, check the Place of Service, correct 
  the modifier, and save
- On a busy day this could mean manually repeating the same multi-click process 30+ 
  times

## How it works

1. On the claims list page (filtered to "Action Required"), the popup grabs the link 
   to each flagged claim
2. Clicking "Open tabs & auto-fix each" opens every claim in its own background tab
3. A content script injected into each tab:
   - Opens the claim's edit view
   - Reads the Place of Service value
   - If the visit is telehealth (POS 02/10) and missing the `95` modifier, adds it; 
     if it's in-office (POS 11) and has the modifier, removes it
   - If the Place of Service is something else entirely, it's not a modifier issue — 
     the script stops and flags it with an on-page popup for manual review instead 
     of guessing
   - Saves the correction and shows an on-page popup confirming the claim is ready 
     for the coordinator to review and submit themselves

## Technical challenges

The practice management system's claims interface is a single-page app built on 
**Ember**, which doesn't update the DOM the way a typical page does — most of the 
real engineering work here was in getting reliable automation against that:

- **Synthetic clicks weren't registering.** Ember's event handling doesn't always 
  respond to a plain `.click()` the way native browser interactions do. Getting the 
  dropdown menus and buttons to actually respond required working through how 
  Ember binds its event listeners rather than assuming standard DOM behavior.
- **Race conditions.** Because the UI updates without a page reload, a script that 
  assumes "the page finished loading" or waits a fixed amount of time will 
  frequently act too early or too late. The extension uses an explicit stage-based 
  state machine (`start` → `editing` → `done`) combined with a `MutationObserver` 
  that re-checks the page after every DOM change, so each step only fires once its 
  actual precondition (the right button, the right unlocked field) is present — 
  rather than guessing at timing.
- **Reliable script injection.** Chrome's `content_scripts` in the manifest don't 
  always fire reliably on background tabs or fast-loading SPA routes, so the 
  background script explicitly waits for each tab to finish loading and then 
  injects the content script itself, with a short buffer for the SPA to render.

## Privacy & safety notes

- Only runs on the specific practice management domain it was built for 
  (`*.simplepractice.com`), not on arbitrary pages
- Only acts on data the logged-in, authorized user can already see and edit
- Does not transmit, log, or store any patient or claim data outside the browser
- Ambiguous cases are explicitly left untouched and flagged, rather than guessed at
- Every claim still requires a human to review and submit it — this tool only 
  removes the repetitive part of getting each claim into a correct, ready state

## Stack

Vanilla JavaScript, Chrome Extensions API (Manifest V3)
