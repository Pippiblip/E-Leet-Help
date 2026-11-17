# LeetCode analysis companion: minimal UI design

Design spec for the MVP in the doc "LeetCode analysis companion MVP spec" (features F1 to F6). It covers the toast, the panel, the Due tab, history and settings. Light and dark themes both ship.

Status of the numbers: `#FFA116` is LeetCode's brand orange (checked against the simple-icons entry). The other LeetCode-like surface and text values are my approximations from how LeetCode looks, so sample them with an eyedropper on the live page before you freeze the tokens (section 9). Every text and background pair below was checked with a contrast script, and the results are in the token table. The unslop-ui skill's reference files (token scale, visuals) were not available in this session, so the scales here are derived from its rules in `SKILL.md`: 4px grid, two type weights, hairline borders, one accent, nested radii.

## 1. Direction

- **Product:** a panel that scores your accepted LeetCode solution, compares it with a better approach, and brings low-scoring problems back later.
- **Character:** quiet, exact, a little encouraging.
- **World:** the LeetCode page itself, a code editor at night or in daylight. The extension borrows its two themes and its orange, and adds nothing else.
- **Moment:** the three-score row. It is the only large thing in the panel, and it is where the one milestone animation plays.
- **Signature:** a small orange tick on each score bar marking your previous solve of the same problem. The delta is visible before you read it, and no other product has that tick.

## 2. Rules that keep it quiet

1. **One orange element per view.** Orange marks the Analyze button, the previous-solve tick, selection and the focus ring. Nothing else.
2. **Neutral chrome.** Backgrounds, borders, buttons and text come from one grey ramp. Color appears only in deltas and the confidence dot, and both are toned down.
3. **Show less first.** The default result view shows three scores, a complexity comparison, up to three concepts and two next steps. Reasons, evidence and hints open on a click.
4. **No decoration.** No gradients, glows, emoji, badges, illustrations, shadows on dark, or looping motion.
5. **Speak only when asked.** The toast is the one thing that appears uninvited, and it is small, brief and easy to turn off.

## 3. Tokens

All styles live inside the closed Shadow DOM, so LeetCode's CSS cannot reach them.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#FFFFFF` | `#1A1A1A` | panel page |
| `--raised` | `#FFFFFF` | `#282828` | toast and menus |
| `--surface` | `#F7F8FA` | `#282828` | segmented track, hover base |
| `--border` | `rgba(38,38,38,0.10)` | `rgba(239,241,246,0.08)` | hairlines |
| `--border-strong` | `rgba(38,38,38,0.16)` | `rgba(239,241,246,0.14)` | bar tracks, input borders |
| `--text` | `#262626` | `#EFF1F6` | primary text |
| `--text-2` | `#5C5C5C` | `#A6A8AD` | secondary text |
| `--text-3` | `#707070` | `#8E9096` | meta and labels |
| `--accent` | `#FFA116` | `#FFA116` | fills, tick, ring |
| `--accent-text` | `#A85A00` | `#FFA116` | orange used as text |
| `--on-accent` | `#1A1A1A` | `#1A1A1A` | text on orange |
| `--accent-tint` | `rgba(255,161,22,0.12)` | `rgba(255,161,22,0.12)` | improved cell, selected row |
| `--positive` | `#00806F` | `#00B8A3` | good delta, "agree" dot |
| `--negative` | `#C62828` | `#FF6B66` | bad delta, "check this" dot |

Contrast, measured: text on its background is 15.1 to 1 (light primary), 6.7 (secondary) and 4.7 to 5.0 (muted) on light, and 15.4, 7.3 and 5.5 on dark. Dark text on the orange fill is 8.6. Orange as text is 8.6 on dark and 5.1 on white in the darker `#A85A00` shade. Raw `#FFA116` as text on white is only 2.0, so never use it that way on light. Positive and negative deltas are at least 4.6 in both themes.

Hover is a surface step, not a color: `rgba(38,38,38,0.04)` on light, `rgba(239,241,246,0.06)` on dark. The selected state adds a hairline.

**Spacing** (4px grid): 4, 8, 12, 16, 24, 32. Panel edge padding 16. Gap between sections 24. Label to content 8. List rows 48 tall. Controls 32 tall. Toast 48 tall. Tab bar 40 tall.

**Radius:** toast 16, controls 8, bar track 2, highlight cells 4. A control sits 8px from the toast edge, which gives 16 minus 8 equals 8, matching the control radius. In the panel, controls are not nested in a rounded box, so they keep 8.

**Type:** system stack matching LeetCode, `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, plus `ui-monospace, "SF Mono", Menlo, Consolas, monospace` for complexity classes, dates and score digits in tables. Sizes and line heights: 12/16 meta, 13/20 small body, 14/20 body and titles, 28/32 score numerals. Weights 400 and 500 only. Sentence case everywhere. Numbers use `tabular-nums`.

**Icons:** lucide, 16px, stroke 1.5, color from the text role. Used: `x`, `settings`, `ellipsis`, `chevron-right`, `chevron-down`, `arrow-up-right`, `arrow-left`. No others.

**Motion:** one easing curve, `cubic-bezier(0.2, 0, 0, 1)`. Durations: 120 ms for hover and press, 200 ms for entering elements, 600 ms for the milestone count-up. Transition only color, background-color, border-color, opacity and transform. Never animate height or width.

```css
:host { --bg:#fff; --raised:#fff; --surface:#F7F8FA; --text:#262626; --text-2:#5C5C5C; --text-3:#707070;
        --border:rgba(38,38,38,.10); --border-strong:rgba(38,38,38,.16); --accent:#FFA116; --accent-text:#A85A00;
        --positive:#00806F; --negative:#C62828; }
:host([data-theme="dark"]) { --bg:#1A1A1A; --raised:#282828; --surface:#282828; --text:#EFF1F6; --text-2:#A6A8AD; --text-3:#8E9096;
        --border:rgba(239,241,246,.08); --border-strong:rgba(239,241,246,.14); --accent-text:#FFA116;
        --positive:#00B8A3; --negative:#FF6B66; }
```

## 4. Components

### 4.1 Toast (F2)

Bottom right of the LeetCode tab, 24px from the edges. 360 wide, 48 tall, radius 16, `--raised` background, 1px `--border`. A soft neutral shadow `0 4px 16px rgba(0,0,0,0.08)` on light only, none on dark.

```
┌────────────────────────────────────────────────┐
│ Analyze this solution        [ Analyze ]  ⋯    │
└────────────────────────────────────────────────┘
```

- Text 14/500 `--text`, 16px from the left edge, vertically centered.
- **Analyze** button: 32 tall, 12px side padding, radius 8, `--accent` fill, `--on-accent` text 13/500, 8px from the right and vertical edges.
- **Menu** button: 32 by 32, ghost, `ellipsis` icon. It opens a small menu with Dismiss, Snooze 24 hours and Don't show again.
- Already analyzed: text reads "Analyzed 7 · 8 · 6" in mono digits, and the button reads Open.
- Enters with a 200 ms fade and an 8px rise. Auto-dismisses after 8 seconds with a 120 ms fade, pauses on hover and while focus is inside. No timer bar, no sound, no icon.
- `role="status"`, `aria-live="polite"`, never takes focus.

### 4.2 Panel shell

Content width 320 minimum, 360 to 400 designed. It works as Chrome's side panel or as an in-page drawer.

```
Two Sum                                    x      header 48
Python · Hash map                                  (12 muted)
Result    Due 2    History              gear         tabs 40
─────────────────────────────────────────────
```

- Header: problem title 14/500, truncated with an ellipsis. Under it, language and pattern in 12 `--text-3`. Close button 32 by 32 at the right.
- Tabs: text only, 13/500. The active tab is `--text` with a 2px `--text` underline, inactive is `--text-2`. The count on Due is plain text. The gear sits at the far right as a ghost button.
- Header and tab bar stay fixed. Content scrolls below. A 1px `--border` sits under the tab bar.

### 4.3 Scores (F1, F3)

Three equal columns, 16 gap. This is the brightest thing on the screen.

```
Quality        Readability    Concept
7 /10          8 /10          4 /10
+2 vs last     same           −1 vs last
━━━━━━━┃━━━     ━━━━━━━━━━     ━━━┃━━━━━━
```

- Label 12 `--text-3`. Numeral 28/32 weight 500 `--text`, with "/10" at 13 `--text-3`.
- Delta 12: `+2 vs last` in `--positive`, `−1 vs last` in `--negative`, a change of 1 point or less in `--text-3` as "same". With no earlier solve: "first solve".
- Bar: 4 tall, radius 2, track `--border-strong`, fill `--text-2`. The previous-solve tick is `--accent`, 2 wide and 12 tall, centered on the bar at the previous value. No tick on a first solve.
- Clicking a column opens its one-line reason and evidence below the row, instant, with a 120 ms opacity fade. The reason is 13/20 `--text-2`. Evidence lines are 12 `--text-3`.
- A milestone, when there is one, adds one line under the row: 13 `--text-2` with a 6px `--accent` dot, for example "Personal best in readability".

### 4.4 Complexity comparison (F6)

Label "Complexity" in 12 `--text-3`, then a grid with a 56px label column and two equal columns.

```
              Yours            Suggested
Approach      Nested loops     Hash map
Time          O(n²)            O(n)
Space         O(1)             O(n)
● Static and LLM agree         LLM-claimed
```

- Column headers 12 `--text-3`. Row labels 12 `--text-3`. Approach names 13 `--text`, wrapping to two lines. Time and space in mono 13 `--text`.
- Where the suggested class is better than yours, that cell gets `--accent-tint` with radius 4 and 4 by 8 padding. Nothing else is highlighted.
- Confidence line under "Yours": a 6px dot plus 12 `--text-3` text. Agree uses `--positive`, "LLM only" uses `--text-3`, "Check this" uses `--negative`. The words carry the meaning, the dot only repeats it.
- "LLM-claimed" sits under the Suggested column in 12 `--text-3`, always present.
- When your approach already matches the best known one: one line, "Matches the best known approach", and the Suggested column is hidden.
- On low-score items the Suggested column starts collapsed behind a "Show suggested approach" ghost button, as in the F6 note about hints.

### 4.5 Concepts and next steps

- **Concepts:** up to three rows, 12 apart. Each has a name in 14/500 `--text`, the pattern tag at the right in mono 12 `--text-3`, and the reason below in 13/20 `--text-2`. No chips, no boxes.
- **Next steps:** up to two lines. A muted index "1" and "2" in 12 `--text-3` in a 16px column, then the text in 13/20 `--text`.

### 4.6 Re-attempt and hints (F5)

Shown only when a score is at or below the threshold. Label "Re-attempt" in 12 `--text-3`.

```
Re-attempt on Nov 9
Hints                                     ›
```

- The date line is 14 `--text`, with the date in mono. No color, no alarm.
- The "Hints" row is a 48-tall disclosure with a `chevron-right` that turns to `chevron-down`. Opening it shows three rows:

```
1  Repeated work        Reveal
2  Bottleneck           Reveal
3  Structure            Reveal
```

- Each "Reveal" is a ghost button. Layer 2 stays disabled until layer 1 is revealed, and layer 3 until layer 2. A revealed layer replaces the button with a 13/20 `--text-2` sentence, with a 120 ms opacity fade.

### 4.7 Due tab

Two groups: "Due", which holds due today and overdue, and "Later". Group labels are 12 `--text-3`, 24 above and 8 below.

```
Two Sum                              Open ↗
Concept 4 · Nov 9
```

- Rows 48 tall, full width, hover is a surface step. Title 14/500, second line 12 `--text-3` with the date in mono. "Due today" shows a 6px `--accent` dot before the text. Overdue stays neutral, as "2 days ago".
- Clicking the row expands it to show the Hints disclosure from 4.6. The Open button navigates to the problem page. They are separate targets.
- Empty state: "Nothing due" in 14/500 and one line in 13 `--text-2`: "Low scores come back here on their re-attempt date". No illustration.

### 4.8 History tab

A flat list for the current problem. Rows 48 tall: date in 12 `--text-3`, the three scores in mono 13 as "7 · 8 · 6", and the current complexity class in mono 13 at the right. Clicking a row opens that analysis in the Result tab. Empty state: "No earlier solves".

### 4.9 Settings

The gear replaces the content with a settings view and an `arrow-left` back button in the header. Rows are 48 tall, label left at 14, control right. Three groups with a 24 gap.

- **Prompts:** Toast, a segmented control (On, Snooze 24 h, Off). Animation, a segmented control (Subtle, Off). Low score at or below, a stepper from 1 to 9, default 5.
- **Analysis:** Backend, a segmented control (Your key, Gemini Nano), with Nano disabled and a muted reason when unavailable. API key, a password field 32 tall with the 12 `--text-3` note "Stored unencrypted in this browser". Keep my code, a switch.
- **Data:** Export JSON and Delete all data as text buttons. Delete turns the row into an inline confirm, "Delete everything?" with Cancel and Delete, and no modal.

Segmented control: 32 tall, radius 8, `--surface` track, the selected segment is `--raised` with a 1px `--border` hairline. Switch: 36 by 20, off is `--border-strong`, on is `--accent`.

### 4.10 States

- **First run:** title "Set up", the Backend segmented control, the key field, a neutral Save button, and the 12 `--text-3` line "Your code goes only to the provider you choose".
- **Panel opened with no accepted solution:** "No analysis yet" and a 13 `--text-2` line, "Submit a solution and accept it". With an accepted solution detected: the same layout plus an accent **Analyze** button.
- **Analyzing:** the three numerals show "–" in `--text-3`, and a 13 `--text-2` line reads "Analyzing 3 s", counting up. A ghost Cancel. No skeleton blocks, no spinner.
- **Error:** "Couldn't analyze" in 14/500, the reason in 13 `--text-2` (for example "The provider rejected the key"), then a neutral Retry button and a ghost "Open settings".

Buttons: **primary** is the accent fill and is used only for Analyze. **Secondary** is transparent with a 1px `--border-strong` border and `--text`. **Ghost** has no border, `--text-2` text and a hover surface step. All are 32 tall with 12 side padding.

## 5. Milestone animation (F4)

- Plays on the changed score only, once per fresh analysis, 600 ms with the standard curve. The numeral counts from the previous value to the new one, or from 0 on a first analysis. At the same time a 1.5px `--accent` ring around the numeral scales from 1 to 1.15 and fades from 0.6 to 0.
- A click anywhere skips it to the final state.
- Under `prefers-reduced-motion` or with Animation set to Off: no count-up and no ring. The numeral appears at its final value and a 16 by 2 `--accent` underline sits beneath it. The milestone text line still shows, since it is information.
- No confetti, no sound, no full-panel effect.

## 6. Motion summary

Toast: 200 ms fade and 8px rise in, 120 ms fade out. Hover and press: 120 ms color or surface change, press scales to 0.98. Disclosures and score reasons: instant with a 120 ms opacity fade, never a height animation. Tabs: no transition. Nothing loops.

## 7. Accessibility

- Every text pair meets 4.5 to 1 (table above). Orange text on light uses `--accent-text`.
- Targets are at least 32 by 32.
- Focus ring: 2px `--accent`, 2px offset, visible on every control. The toast never takes focus, but its buttons are reachable by Tab.
- Escape closes the panel. Tabs follow the ARIA tab pattern. Disclosures use `aria-expanded`. The score row is a list with the label, value and delta readable in order: "Quality, 7 out of 10, up 2 versus last".
- Color is never the only signal. Deltas carry a sign and words, the confidence dot sits next to its words, and the tick has a text equivalent in the delta.
- Respect `prefers-reduced-motion`.

## 8. Left out on purpose

Leaderboards, points, badges, streak counters, push notifications, icon badges, confetti, sound, gradients, glows, emoji, illustrations, skeleton loaders, modal dialogs, onboarding tours, a dashboard or home screen. Each is either on your cut list or adds weight without information.

## 9. Check against the live page

- [ ] Sample LeetCode's real background, surface, border, text and orange in light and dark with an eyedropper, and update the tokens
- [ ] Find out how LeetCode marks its theme (a class, an attribute or storage) so `data-theme` follows it, and fall back to `prefers-color-scheme` otherwise
- [ ] Check that the bottom-right toast does not overlap LeetCode's own toasts or floating widgets
- [ ] Confirm the system font stack matches the page's rendering
- [ ] Confirm whether the panel is Chrome's side panel or an in-page drawer, and test widths from 320 to 400
- [ ] At 360 by 720, a non-low-score Result view should fit without scrolling (about 610px of content by my estimate); check it against a real render

## 10. Checklist

- [ ] One orange element per view
- [ ] All spacing on the 4px grid, equal things equal in size
- [ ] One grey ramp, three text roles, one accent, contrast verified
- [ ] No gradient, glow, emoji, badge or looping motion
- [ ] One icon set at 16px with a 1.5 stroke
- [ ] Two weights, sentence case, tabular numbers
- [ ] No exclamation marks, no trailing periods on short strings, no greeting text
- [ ] Nested radii add up
- [ ] Template check: swap in another product's name and the screen should stop fitting. The previous-solve tick, the Yours and Suggested comparison and the Due tab are what keep it this product's

Method adapted from the unslop-ui skill by Damir Sokolovsky (@heydamir), licensed CC BY 4.0.
