// Runs automatically (via explicit injection from background.js) on each claim tab.
// Flow per claim:
//   1. Click the split-action dropdown trigger (caret button)
//   2. Click "Edit Claim" menu item
//   3. On the resulting edit screen: check Place of Service
//        - Telehealth (POS 02 or 10) -> modifier must be "95"
//        - Office (POS 11)           -> modifier must NOT be "95"
//        - Anything else             -> not a modifier issue -> show popup, stop (manual review)
//   4. Click "Save"
//   5. Stop here — the corrected claim is left for manual review and submission.
//      This tool intentionally does NOT submit claims automatically; submitting
//      to a payer is a decision a human should always make explicitly.
//
// Each click can change the DOM without a full page navigation (Ember SPA), so this
// script checks "what's available right now" and does the next step, guarded so it
// never re-fires mid-action or repeats a completed run.

(function () {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findMenuItem(dataValue) {
    return document.querySelector(`button[role="menuitem"][data-value="${dataValue}"]`);
  }

  // The split-action dropdown trigger: a <button> with aria-haspopup="menu" and a
  // caret svg inside (class spds-action-button-split-trigger). No visible text.
  function findDropdownTrigger() {
    return document.querySelector('button.spds-action-button-split-trigger[aria-haspopup="menu"]') ||
      document.querySelector('button[aria-haspopup="menu"]');
  }

  function findButtonByText(text) {
    return Array.from(document.querySelectorAll('button, a'))
      .find(el => norm(el.textContent) === text);
  }

  function showPopup(title, message, color = '#3b82f6, #1e40af') {
    if (document.getElementById('sp-fixer-popup')) return;
    const el = document.createElement('div');
    el.id = 'sp-fixer-popup';
    el.style.cssText = `
      position: fixed; top: 24px; right: 24px; z-index: 999999;
      max-width: 320px; padding: 16px 18px;
      background: linear-gradient(135deg, ${color});
      color: white; font-family: system-ui, sans-serif; font-size: 14px;
      border-radius: 12px; box-shadow: 0 8px 24px rgba(30, 64, 175, 0.35);
      line-height: 1.4;
    `;
    el.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
      <div style="opacity: 0.92;">${message}</div>
      <div style="margin-top: 10px; text-align: right;">
        <button id="sp-fixer-popup-close" style="
          background: rgba(255,255,255,0.2); border: none; color: white;
          padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 12px;
        ">Dismiss</button>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('sp-fixer-popup-close').addEventListener('click', () => el.remove());
  }

  function showNotModifierIssuePopup() {
    showPopup(
      'Not a modifier issue',
      "This claim's Place of Service isn't Office or Telehealth, so no 95 modifier change applies here. Needs manual review."
    );
  }

  function showReadyForReviewPopup() {
    showPopup(
      'Ready for review',
      'Modifier corrected and saved. Please review this claim and submit it yourself when ready.',
      '#16a34a, #15803d'
    );
  }

  async function run() {
    if (window.__spFixerRunning || window.__spFixerDone) return;
    window.__spFixerRunning = true;
    try {
      await runSteps();
    } finally {
      window.__spFixerRunning = false;
    }
  }

  async function runSteps() {
    const stage = window.__spFixerStage || 'start';

    // Stage: start -> open dropdown, then click "Edit Claim"
    if (stage === 'start') {
      const posSelect = document.querySelector('select[name="claim[serviceLines][0][placeOfService]"]');
      const modifierInput = document.querySelector('input[name="claim[serviceLines][0][procedureModifiers][0]"]');
      // If the edit fields are already visible and enabled, skip straight to the modifier step
      if (posSelect && modifierInput && !posSelect.disabled && !modifierInput.disabled) {
        window.__spFixerStage = 'editing';
        return runSteps();
      }

      const existingMenuItem = findMenuItem('Edit Claim');
      if (existingMenuItem) {
        console.log('[SP Fixer] Clicking "Edit Claim"...');
        existingMenuItem.click();
        window.__spFixerStage = 'editing';
        await delay(1200);
        return;
      }

      const trigger = findDropdownTrigger();
      if (trigger) {
        console.log('[SP Fixer] Opening action dropdown...');
        trigger.click();
        await delay(500);
        return; // next run() will find the now-open "Edit Claim" menu item
      }

      console.log('[SP Fixer] Dropdown trigger not found yet — nothing to do.');
      return;
    }

    // Stage: editing -> fix modifier, then Save, then STOP for manual review.
    if (stage === 'editing') {
      const posSelect = document.querySelector('select[name="claim[serviceLines][0][placeOfService]"]');
      const modifierInput = document.querySelector('input[name="claim[serviceLines][0][procedureModifiers][0]"]');

      if (!posSelect || !modifierInput || posSelect.disabled || modifierInput.disabled) {
        console.log('[SP Fixer] Waiting for edit fields to become available...');
        return;
      }

      const posValue = posSelect.value;
      const isTelehealth = posValue === '02' || posValue === '10';
      const isOffice = posValue === '11';
      const currentModifier = modifierInput.value.trim();

      if (isOffice && currentModifier === '95') {
        setNativeValue(modifierInput, '');
        console.log('[SP Fixer] Office visit — removed 95 modifier.');
      } else if (isTelehealth && currentModifier !== '95') {
        setNativeValue(modifierInput, '95');
        console.log('[SP Fixer] Telehealth visit — added 95 modifier.');
      } else if (!isOffice && !isTelehealth) {
        console.log('[SP Fixer] Not a modifier issue. POS:', posValue);
        showNotModifierIssuePopup();
        window.__spFixerDone = true;
        return;
      } else {
        console.log('[SP Fixer] No modifier change needed. POS:', posValue, 'Modifier:', currentModifier);
      }

      await delay(400);

      const saveBtn = findButtonByText('Save');
      if (saveBtn) {
        console.log('[SP Fixer] Clicking "Save"...');
        saveBtn.click();
        window.__spFixerStage = 'done';
        await delay(1000);
        showReadyForReviewPopup();
        window.__spFixerDone = true;
        console.log('[SP Fixer] Done. Claim saved — awaiting manual review and submission.');
        return;
      }

      console.warn('[SP Fixer] Save button not found after modifier edit.');
      return;
    }
  }

  run();

  // Re-run on relevant DOM changes (debounced), since clicks here update the SPA
  // without a full page navigation.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
