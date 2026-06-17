# Requirements Document

## Introduction

This feature expands the existing **MCAT Command Center** — a client-side, single-page study tracker built with vanilla JavaScript, HTML, and CSS, persisting all data in browser `localStorage` under the key `mcat_command_center_v2`. The app already provides a Dashboard, Calendar, To-Do List, Pomodoro timer, Focus Topics, Wrong Answers log, Test Scores, Application kanban, Resources, theme toggle, and JSON export/import backup.

The expansion adds the capabilities described in the `MCAT-Prep-Tracker-Essentials.md` blueprint that the current app does not yet cover, and enhances several existing modules to match the blueprint. The work focuses on the gaps while integrating with the existing state object, navigation/view structure, and backup mechanism. The blueprint's "Build First" list is treated as the priority signal:

1. Dashboard (enhance — existing)
2. Calendar (existing, no new work required)
3. Practice Question Tracker (new — high priority)
4. Error Log enhancements (existing Wrong Answers — high priority)
5. Full-Length Exam Tracker enhancements (existing Test Scores — high priority)
6. Analytics by topic and section (new — high priority)
7. Content Review Tracker (new — high priority)

Lower-priority additions: CARS Practice Tracker, Review/Spaced-Repetition Tracker, Resource Tracker enhancements, Formula & Equation Sheet, High-Yield Notes, Goals & Milestones, Daily Study Log, Test-Day Readiness Checklist, In-app Reminders, and User Settings/Profile.

All new behavior MUST remain client-side with no backend, MUST persist through the existing `localStorage` state object, and MUST be preserved by the existing export/import backup, including a forward-compatible data migration for older saved states.

## Glossary

- **App**: The MCAT Command Center single-page web application running entirely in the browser.
- **State_Object**: The single in-memory JavaScript object persisted to `localStorage` under key `mcat_command_center_v2`, merged with defaults on load.
- **Storage_System**: The load/save logic that reads from and writes to `localStorage` and merges saved data over `defaultState`.
- **Backup_System**: The existing export (download JSON) and import (replace state from JSON) feature.
- **Dashboard**: The existing home view that summarizes progress.
- **Practice_Question_Tracker**: New module recording per-set practice question results.
- **Practice_Set**: A single recorded practice entry containing date, resource, section, topic, number correct, number attempted, timing flag, difficulty, and notes.
- **Content_Review_Tracker**: New module presenting the MCAT subject/topic tree with a review status per topic.
- **Content_Topic**: A single subject-tree leaf with an assigned review status.
- **Error_Log**: The existing Wrong Answers module, enhanced with mistake categories and review fields.
- **Mistake_Category**: One classification from a fixed taxonomy describing why a question was missed.
- **Full_Length_Tracker**: The existing Test Scores module, enhanced with percentiles, timing, conditions, review status, and lessons.
- **Full_Length_Record**: A single full-length exam entry.
- **Analytics_Page**: New view computing aggregate progress metrics from stored data.
- **CARS_Tracker**: New module recording per-passage CARS practice results.
- **CARS_Passage_Entry**: A single recorded CARS passage with accuracy, time, difficulty, and question-type data.
- **Review_Tracker**: New lightweight flashcard / spaced-repetition / memorization tracker.
- **Review_Item**: A single card or memorization item with a review state.
- **Resource_Tracker**: Enhancement adding completion and accuracy tracking to study resources.
- **Formula_Sheet**: New searchable reference of formulas with topic tags and a memorized flag.
- **Formula_Entry**: A single formula with name, expression, topic tags, and memorized flag.
- **Notes_Module**: New searchable, tagged personal notes feature with Markdown support.
- **Note_Entry**: A single note with title, body, tags, needs-review flag, and optional linked Error_Log entries.
- **Goals_Module**: New module tracking target score, study-hour and question goals, and milestones.
- **Milestone**: A single checklist goal item with a completion state.
- **Daily_Log**: New module recording one reflective study-log entry per day.
- **Daily_Log_Entry**: A single day's record of hours, questions, accuracy, subject, energy, confidence, and reflection.
- **Readiness_Checklist**: New test-day preparation checklist.
- **Reminder_System**: New in-app reminder/notification surface derived from existing data.
- **Settings_Module**: New user profile and preferences module.
- **MCAT_Section**: One of the four section codes used throughout the App: C/P, CARS, B/B, P/S.
- **Section_Score**: A scaled MCAT section score, an integer from 118 through 132.
- **Total_Score**: The sum of the four Section_Scores, an integer from 472 through 528.

## Requirements

### Requirement 1: Data Persistence and Migration for New Modules

**User Story:** As a returning user, I want my existing data preserved when new modules are added, so that upgrading the app never loses my study history.

#### Acceptance Criteria

1. THE Storage_System SHALL persist all new module data as keys within the single State_Object stored under the localStorage key `mcat_command_center_v2`.
2. WHEN the App loads a State_Object that lacks a top-level key for a new module, THE Storage_System SHALL initialize that key with its documented default value before the App renders.
3. WHEN the App loads a State_Object in which a new module's key is present but is missing one or more documented sub-keys, THE Storage_System SHALL add each missing sub-key with its documented default value while leaving present sub-keys unchanged.
4. WHEN the App loads a State_Object saved by a prior version, THE Storage_System SHALL preserve, without modification, all values for every key and sub-key that is present.
5. WHEN any new module's data changes, THE Storage_System SHALL write the complete updated State_Object to localStorage before the next user-initiated change is accepted.
6. IF reading or parsing the stored State_Object fails, THEN THE Storage_System SHALL load the documented default State_Object, complete loading without throwing an unhandled error, and retain the unparseable stored value until the next successful save.
7. IF writing the State_Object to localStorage fails (for example, storage quota exceeded or access denied), THEN THE Storage_System SHALL both retain the in-memory State_Object unchanged and surface an error indication that the save did not complete, performing both responses without prioritizing one over the other.

### Requirement 2: Backup Export and Import Round-Trip

**User Story:** As a user, I want my new module data included in backups, so that I can move my full study history between browsers and devices.

#### Acceptance Criteria

1. WHEN the user exports a backup, THE Backup_System SHALL include every new module key and value held in the State_Object in the exported JSON file.
2. WHEN the user imports a previously exported backup, THE Backup_System SHALL replace the current State_Object with the values present in that file, including all new module data, and reflect those values in the App after the import completes.
3. FOR ALL valid State_Objects, exporting to JSON then importing that JSON SHALL produce a State_Object whose keys and values are deeply equal to the original, with no key added, removed, or changed in value (round-trip property).
4. WHEN the user imports a backup that lacks keys for one or more new modules, THE Backup_System SHALL initialize each missing key with its documented default value while preserving every key present in the file.
5. IF an imported file does not parse as valid JSON or does not parse to a JSON object, THEN THE Backup_System SHALL reject the import, retain the current State_Object unchanged, and display an error message indicating that the file could not be read.
6. WHEN the user selects a backup file to import, THE Backup_System SHALL prompt the user to confirm replacing the current data before applying the imported values.
7. IF the user cancels the import confirmation, THEN THE Backup_System SHALL retain the current State_Object unchanged and SHALL NOT apply the imported values.

### Requirement 3: Practice Question Tracker

**User Story:** As a student, I want to log each practice question set with its accuracy and conditions, so that I can see how I perform across resources, sections, and topics.

#### Acceptance Criteria

1. WHEN the user submits a Practice_Set with a date, an MCAT_Section equal to one of C/P, CARS, B/B, or P/S, a number attempted that is an integer from 1 to 9999, and a number correct that is an integer from 0 to the number attempted, THE Practice_Question_Tracker SHALL store the Practice_Set in the State_Object.
2. THE Practice_Question_Tracker SHALL store for each Practice_Set the following fields: date, resource (text up to 100 characters), MCAT_Section (one of C/P, CARS, B/B, P/S), topic (text up to 100 characters), number correct, number attempted, timed-or-untimed flag (one of timed or untimed), difficulty (one of easy, medium, hard), and notes (text up to 500 characters).
3. WHEN a Practice_Set is stored, THE Practice_Question_Tracker SHALL compute percent correct as the number correct divided by the number attempted, multiplied by 100 and rounded to the nearest whole number.
4. IF the user submits a Practice_Set where the number correct exceeds the number attempted, THEN THE Practice_Question_Tracker SHALL reject the entry without storing it in the State_Object and display an error message indicating that the number correct cannot exceed the number attempted.
5. IF the user submits a Practice_Set where the number attempted is not an integer from 1 to 9999, THEN THE Practice_Question_Tracker SHALL reject the entry without storing it in the State_Object and display an error message indicating that the number attempted must be a whole number from 1 to 9999.
6. IF the user submits a Practice_Set where the number correct is negative or is not an integer, THEN THE Practice_Question_Tracker SHALL reject the entry without storing it in the State_Object and display an error message indicating that the number correct must be a whole number of zero or greater.
7. WHEN the user deletes a Practice_Set, THE Practice_Question_Tracker SHALL remove that Practice_Set from the State_Object.
8. WHEN the user views recorded Practice_Sets, THE Practice_Question_Tracker SHALL display them as a list ordered by date from most recent to oldest, with each entry showing date, MCAT_Section, topic, number correct, number attempted, percent correct, and timed-or-untimed flag.

### Requirement 4: Practice Accuracy Graphs

**User Story:** As a student, I want graphs of my practice accuracy, so that I can see trends over time and identify weak areas.

#### Acceptance Criteria

1. THE Practice_Question_Tracker SHALL display an accuracy-over-time graph that plots one point per recorded Practice_Set, ordered chronologically by date from earliest to latest, where each point's value is the Practice_Set percent-correct expressed as a number from 0 to 100.
2. THE Practice_Question_Tracker SHALL display accuracy aggregated by topic, with one value per distinct topic present in the recorded Practice_Sets.
3. THE Practice_Question_Tracker SHALL display accuracy aggregated by MCAT_Section, with one value per distinct MCAT_Section present in the recorded Practice_Sets.
4. THE Practice_Question_Tracker SHALL display a comparison of accuracy between timed and untimed Practice_Sets as two separate aggregated values.
5. WHEN aggregating accuracy for a group, THE Practice_Question_Tracker SHALL compute the percentage as the sum of correct across the group divided by the sum of attempted across the group, expressed as a number from 0 to 100 rounded to one decimal place.
6. IF a group has a sum of attempted questions equal to zero, THEN THE Practice_Question_Tracker SHALL omit that group from its graph rather than computing a percentage.
7. WHILE no Practice_Sets exist, THE Practice_Question_Tracker SHALL display an empty-state message in place of each graph, and SHALL present that empty-state message immediately when the user opens the App with no recorded Practice_Sets rather than only after the user navigates to the graphs section.

### Requirement 5: Content Review Tracker

**User Story:** As a student, I want to track my review status for every MCAT subject and topic, so that I know what I have covered and what still needs work.

#### Acceptance Criteria

1. THE Content_Review_Tracker SHALL present Content_Topics organized under the four MCAT_Sections (C/P, CARS, B/B, P/S) and their subject groupings as defined in the blueprint subject tree.
2. THE Content_Review_Tracker SHALL allow each Content_Topic to be assigned exactly one status from the set: not started, in progress, reviewed, needs practice, mastered.
3. WHEN the user changes the status of a Content_Topic, THE Content_Review_Tracker SHALL store the new status in the State_Object and refresh the displayed status within 1 second.
4. WHEN a Content_Topic has no stored status, THE Content_Review_Tracker SHALL display its status as not started.
5. WHEN the Content_Review_Tracker is displayed and WHEN any Content_Topic status changes, THE Content_Review_Tracker SHALL display the count of Content_Topics in each of the five statuses (not started, in progress, reviewed, needs practice, mastered), including a count of zero where no topic holds that status.
6. WHEN the user adds a custom Content_Topic under a section with a label of 1 to 100 non-whitespace characters that does not duplicate an existing topic in that section (compared case-insensitively), THE Content_Review_Tracker SHALL store the custom topic alongside the predefined topics with a default status of not started.
7. IF the user submits a custom Content_Topic that is empty, whitespace-only, exceeds 100 characters, or duplicates an existing topic in that section, THEN THE Content_Review_Tracker SHALL reject the addition, leave the State_Object unchanged, and display an indication of the reason for rejection.

### Requirement 6: Error Log Mistake Categories and Review Fields

**User Story:** As a student, I want to categorize why I missed each question and record what to do about it, so that I can find patterns in my mistakes instead of only looking at scores.

#### Acceptance Criteria

1. THE Error_Log SHALL allow each entry to be assigned exactly one Mistake_Category from the set: content gap, misread question, misread passage, calculation error, timing issue, wrong reasoning, trap answer, did not know formula, guessed.
2. THE Error_Log SHALL store for each entry a correct-answer explanation text field accepting 0 to 2000 characters, a user takeaway text field accepting 0 to 2000 characters, a needs-review flag defaulting to false, and a retest date.
3. WHEN the user loads an existing Error_Log entry that has no Mistake_Category, THE Error_Log SHALL display the category as "unset" and allow the user to assign one from the defined set.
4. WHEN the user sets a retest date on an Error_Log entry to a calendar date in ISO 8601 (YYYY-MM-DD) format, THE Error_Log SHALL store the retest date in the State_Object immediately upon the date being set, without requiring a separate submit action.
5. IF the user submits a retest date that is not a valid ISO 8601 calendar date, THEN THE Error_Log SHALL reject the input, retain the previously stored retest date, and display an indication that the date is invalid.
6. WHEN an entry's explanation or takeaway input exceeds 2000 characters, THE Error_Log SHALL reject the excess input, retain the last valid value, and display an indication that the maximum length was reached.
7. THE Error_Log SHALL display the count of entries for each of the 9 Mistake_Categories, showing 0 for any category with no entries, and a separate count of entries with an unset category.
8. THE Error_Log SHALL preserve the existing repeat-topic detection and open-or-resolved status behavior for all entries.

### Requirement 7: Full-Length Exam Tracker Enhancements

**User Story:** As a student, I want to capture full details and a review for each full-length exam, so that I learn the most from every practice test.

#### Acceptance Criteria

1. THE Full_Length_Tracker SHALL store for each Full_Length_Record: exam source (text up to 100 characters), date taken, the four Section_Scores (each an integer from 118 through 132), a percentile for each Section_Score and for the Total_Score (each an integer from 0 through 100), time taken in whole minutes (integer from 1 through 1440), testing conditions, per-exam review status, and biggest lessons (text up to 2000 characters).
2. WHEN the user records the four Section_Scores for a Full_Length_Record, THE Full_Length_Tracker SHALL compute and display the Total_Score as their sum, an integer from 472 through 528.
3. THE Full_Length_Tracker SHALL allow the testing conditions of a Full_Length_Record to record any combination of the following indicators: timed, single sitting, with breaks, and real test conditions.
4. THE Full_Length_Tracker SHALL allow each Full_Length_Record to have a review status of exactly one of: not reviewed, reviewed.
5. WHEN the user loads a Full_Length_Record saved before this enhancement, THE Full_Length_Tracker SHALL display its existing Section_Scores and display the new fields (percentiles, time taken, testing conditions, review status, and biggest lessons) as unset.
6. THE Full_Length_Tracker SHALL preserve the existing total-score-over-time line chart plotted against the target score defined in the Goals_Module.
7. WHEN at least one Full_Length_Record exists, THE Full_Length_Tracker SHALL display a score trend for each of the four MCAT_Sections across recorded Full_Length_Records ordered by date taken, and SHALL display the per-section score trend even when one or more existing Full_Length_Records contain incomplete data.
8. IF the user submits a Full_Length_Record in which any Section_Score is outside the range 118 through 132, THEN THE Full_Length_Tracker SHALL reject the entry, retain the previously entered values, and notify the user with an error message identifying each invalid Section_Score independently, reporting every invalid Section_Score regardless of whether other Section_Scores in the same record are valid.
9. WHILE no Full_Length_Records exist, THE Full_Length_Tracker SHALL display an empty-state message in place of the per-section score trend.

### Requirement 8: Analytics and Progress Reports

**User Story:** As a student, I want a single analytics page, so that I can answer where I am weak and whether I am improving.

#### Acceptance Criteria

1. THE Analytics_Page SHALL display accuracy by MCAT_Section computed as the sum of correct divided by the sum of attempted across all Practice_Sets in that MCAT_Section, expressed as a percentage rounded to the nearest whole number.
2. THE Analytics_Page SHALL display accuracy by topic computed as the sum of correct divided by the sum of attempted across all Practice_Sets sharing that topic, expressed as a percentage rounded to the nearest whole number.
3. THE Analytics_Page SHALL display practice volume per calendar week (Monday through Sunday) computed as the sum of questions attempted across all Practice_Sets dated within that week.
4. THE Analytics_Page SHALL display study hours per calendar week (Monday through Sunday) computed as the sum of logged study-session durations within that week.
5. THE Analytics_Page SHALL display a weakness ranking of topics ordered from lowest to highest computed accuracy, with topics of equal accuracy ordered by greater number of questions attempted first.
6. THE Analytics_Page SHALL display the count of Error_Log entries per Mistake_Category ordered from most to least frequent, with categories of equal count ordered alphabetically by category name.
7. THE Analytics_Page SHALL display the full-length Total_Score of each Full_Length_Record ordered chronologically by date taken.
8. WHILE no recorded data contributes to a given metric, THE Analytics_Page SHALL display an empty-state message in place of that metric.
9. WHERE at least two Full_Length_Records exist, THE Analytics_Page SHALL display a predicted Total_Score range, derived from the recorded Full_Length_Records' Total_Scores, expressed as a lower bound and an upper bound that are each integers from 472 through 528 inclusive with the lower bound not exceeding the upper bound.

### Requirement 9: Dashboard Enhancements

**User Story:** As a student, I want the dashboard to summarize my newest metrics, so that I can answer "what should I do today and how am I doing" at a glance.

#### Acceptance Criteria

1. THE Dashboard SHALL display the average practice accuracy computed as the sum of number correct across all recorded Practice_Sets divided by the sum of number attempted across all recorded Practice_Sets, expressed as a percentage rounded to the nearest whole number.
2. THE Dashboard SHALL display the three lowest-accuracy topics from the analytics weakness ranking, or all ranked topics when fewer than three topics exist.
3. WHERE the Review_Tracker contains Review_Items whose next-due date is on or before the current date, THE Dashboard SHALL display the count of those due Review_Items.
4. THE Dashboard SHALL display progress toward the weekly study-hour goal as the number of study hours logged in the current week relative to the weekly study-hour goal defined in the Goals_Module, expressed as a percentage rounded to the nearest whole number.
5. THE Dashboard SHALL preserve the existing test-date countdown, study heatmap, study streak, today's priority tasks, and repeat-misses panels.
6. WHILE a displayed metric has no underlying recorded data, THE Dashboard SHALL display an empty-state message in place of that specific metric's value independently, such that a metric with missing data SHALL NOT cause an empty-state message to be displayed for any other metric that has underlying recorded data.

### Requirement 10: CARS Practice Tracker

**User Story:** As a student, I want a dedicated CARS tracker, so that I can monitor passage accuracy, timing, and reasoning mistakes separately from the science sections.

#### Acceptance Criteria

1. WHEN the user submits a CARS_Passage_Entry containing a date (a valid calendar date not later than the current date), an accuracy value (a number from 0 to 100 inclusive, representing percent correct), and a time taken (a number greater than 0 and less than or equal to 600 minutes), THE CARS_Tracker SHALL store the entry in the State_Object and display the stored entry in the entry list within 1 second.
2. THE CARS_Tracker SHALL store for each CARS_Passage_Entry the following fields: number of passages completed (integer from 1 to 99), accuracy (0 to 100 inclusive), time per passage (in minutes, greater than 0), difficulty (one of: easy, medium, hard), question types (zero or more of: main idea, author's tone, inference, function, detail, new information/application), and notes on reasoning mistakes (text up to 2000 characters).
3. WHEN at least one CARS_Passage_Entry exists, THE CARS_Tracker SHALL display the average minutes per passage computed as the total recorded time divided by the total number of passages completed across all entries, rounded to one decimal place.
4. WHEN at least one CARS_Passage_Entry exists, THE CARS_Tracker SHALL display accuracy aggregated by each of the six question types (main idea, author's tone, inference, function, detail, new information/application) as a percent value from 0 to 100 rounded to one decimal place, computed only from entries tagged with that question type.
5. IF the user submits a CARS_Passage_Entry with a time taken that is not a number, is less than or equal to 0, or exceeds 600 minutes, THEN THE CARS_Tracker SHALL reject the entry, leave the State_Object unchanged, and display an error message indicating that time taken must be greater than 0 and within the allowed maximum.
6. IF the user submits a CARS_Passage_Entry with an accuracy value that is not a number or falls outside the range 0 to 100 inclusive, THEN THE CARS_Tracker SHALL reject the entry, leave the State_Object unchanged, and display an error message indicating that accuracy must be between 0 and 100.
7. WHILE no CARS_Passage_Entries exist, THE CARS_Tracker SHALL display an empty-state message and SHALL NOT display average minutes per passage or accuracy-by-question-type values.

### Requirement 11: Review and Spaced-Repetition Tracker

**User Story:** As a student, I want to track flashcard or memorization review, so that I know what is due and which topics have low retention.

#### Acceptance Criteria

1. THE Review_Tracker SHALL store for each Review_Item: a topic label (1 to 100 characters), content text (1 to 2000 characters), a review state (one of: new, due, reviewed, mature, missed), and a next-due date.
2. WHEN a Review_Item is created and has never been marked reviewed or missed, THE Review_Tracker SHALL classify it as new.
3. WHILE a Review_Item's next-due date is on or before the current date, THE Review_Tracker SHALL classify it as due.
4. WHEN the user marks a Review_Item as reviewed, THE Review_Tracker SHALL advance the item's next-due interval to the next value in the ascending sequence 1, 3, 7, 21 days (capping at 21 days), set the next-due date to the current date plus that interval, and set its state to reviewed.
5. WHEN the user marks a Review_Item as reviewed and its resulting next-due interval reaches 21 days, THE Review_Tracker SHALL classify it as mature.
6. WHEN the user marks a Review_Item as missed, THE Review_Tracker SHALL reset the item's next-due interval to 1 day, set the next-due date to the current date plus 1 day, and set its state to missed.
7. THE Review_Tracker SHALL display the count of Review_Items whose next-due date is on or before the current date.
8. IF the combined number of reviewed and missed marks across all Review_Items is zero, THEN THE Review_Tracker SHALL display the retention rate as "N/A" and SHALL NOT compute the retention-rate percentage formula while that combined number is zero.
9. IF the combined number of reviewed and missed marks across all Review_Items is greater than zero, THEN THE Review_Tracker SHALL display the retention rate as the number of reviewed marks divided by the combined number of reviewed and missed marks, expressed as a percentage rounded to the nearest whole number (0 to 100).
10. THE Review_Tracker SHALL display topics ordered by ascending retention rate, and WHERE two topics have equal retention rates, THE Review_Tracker SHALL order them alphabetically by topic label.

### Requirement 12: Resource Tracker Enhancements

**User Story:** As a student, I want to track how much of each study resource I have completed, so that I can prioritize my remaining work.

#### Acceptance Criteria

1. THE Resource_Tracker SHALL store for each tracked resource the following fields: name (text, 1 to 200 characters), type, total questions (integer, 0 to 999,999), questions completed (integer, 0 to 999,999), accuracy (percentage, 0 to 100), priority level (one of a fixed set of selectable levels ordered from highest to lowest), and notes (text, 0 to 2,000 characters).
2. WHEN the user records questions completed and total questions for a resource where total questions is greater than 0, THE Resource_Tracker SHALL compute completion percentage as (questions completed divided by total questions) multiplied by 100, rounded to one decimal place, and display the value followed by a percent sign.
3. IF the user records a resource where total questions equals 0, THEN THE Resource_Tracker SHALL display the completion percentage as 0% and SHALL NOT perform the division.
4. IF the user enters questions completed greater than total questions for a resource, THEN THE Resource_Tracker SHALL reject the entry, retain the previously stored values for that resource, and display a visible message indicating that questions completed cannot exceed total questions.
5. IF the user enters a negative value or a non-integer value for questions completed or total questions, THEN THE Resource_Tracker SHALL reject the entry, retain the previously stored values for that resource, and display a visible message indicating that the value must be a whole number of 0 or greater.
6. THE Resource_Tracker SHALL preserve the existing resource links to local tip-sheet, PDF, and document files such that activating a resource link opens the same local file referenced before the enhancement.
7. WHEN the user selects ordering by priority level, THE Resource_Tracker SHALL display resources sorted from highest priority level to lowest priority level.
8. IF priority sorting fails for technical reasons, THEN THE Resource_Tracker SHALL display an error message and keep the current view unchanged, applying no fallback reordering.

### Requirement 13: Formula and Equation Sheet

**User Story:** As a student, I want a searchable formula reference I can mark as memorized, so that I can quickly review and self-test equations.

#### Acceptance Criteria

1. THE Formula_Sheet SHALL store for each Formula_Entry the following fields: a name (1 to 100 characters), an expression (1 to 500 characters), zero or more topic tags (each 1 to 50 characters), and a memorized flag with a value of either true or false.
2. WHEN the user enters a search term of 1 or more characters, THE Formula_Sheet SHALL display only Formula_Entries whose name, expression, or any topic tag contains the search term as a case-insensitive substring.
3. IF a search term matches no Formula_Entries, THEN THE Formula_Sheet SHALL display zero Formula_Entries and a message indicating that no matches were found.
4. WHEN the user clears the search term to 0 characters and no topic tag filter is active, THE Formula_Sheet SHALL display all Formula_Entries regardless of any other entry properties; WHEN the user clears the search term to 0 characters while a topic tag filter is active, THE Formula_Sheet SHALL display all Formula_Entries that satisfy the currently active topic tag filter.
5. WHEN the user marks a Formula_Entry as memorized, THE Formula_Sheet SHALL set that entry's memorized flag to true in the State_Object and persist the change so that it is retained after a page reload.
6. WHEN the user unmarks a Formula_Entry as memorized, THE Formula_Sheet SHALL set that entry's memorized flag to false in the State_Object and persist the change so that it is retained after a page reload.
7. WHEN the user activates practice recall on a Formula_Entry, THE Formula_Sheet SHALL hide that entry's expression and display a reveal control.
8. WHEN the user activates the reveal control on a Formula_Entry in practice recall, THE Formula_Sheet SHALL display that entry's expression.
9. WHEN the user selects one or more topic tags as a filter, THE Formula_Sheet SHALL display only Formula_Entries that include at least one of the selected topic tags.

### Requirement 14: High-Yield Notes

**User Story:** As a student, I want searchable, tagged personal notes with Markdown, so that I can keep and quickly find my study notes and link them to missed questions.

#### Acceptance Criteria

1. THE Notes_Module SHALL store for each Note_Entry the following fields: a title (1 to 200 characters), body text (0 to 50,000 characters), up to 20 tags (each 1 to 50 characters), and a needs-review flag that defaults to false.
2. THE Notes_Module SHALL render the body of a Note_Entry from Markdown into formatted output, including at minimum headings, bold, italic, ordered lists, unordered lists, links, and inline code spans.
3. WHEN the user enters a search term, THE Notes_Module SHALL display only Note_Entries whose title, body, or any tag contains the search term as a case-insensitive substring.
4. WHERE the user links a Note_Entry to one or more Error_Log entries, THE Notes_Module SHALL store the links and provide navigation to each linked Error_Log entry.
5. WHEN the user sets the needs-review flag on a Note_Entry, THE Notes_Module SHALL store the flag in the State_Object.
6. THE Notes_Module SHALL preserve the raw Markdown body text so that the stored text equals, character for character, the text the user entered.
7. WHILE a search term matches no Note_Entries, THE Notes_Module SHALL display an empty-state message indicating that no notes match.
8. WHEN a Note_Entry's Markdown body contains embedded HTML or script content, THE Notes_Module SHALL render that content as inert text without executing it.
9. IF the user navigates to a linked Error_Log entry that no longer exists, THEN THE Notes_Module SHALL indicate that the linked entry is unavailable and SHALL NOT navigate.

### Requirement 15: Goals and Milestones

**User Story:** As a student, I want to set goals and track milestones, so that my studying stays structured and motivating.

#### Acceptance Criteria

1. THE Goals_Module SHALL store the following values: a target score as an integer from 472 to 528 inclusive, a weekly study-hour goal as a number from 0 to 168, a daily question goal as an integer from 0 to 9999, and a list of up to 100 Milestones.
2. WHEN the Goals_Module is displayed, THE Goals_Module SHALL display progress toward the weekly study-hour goal as the sum of logged study-session hours from Monday 00:00 through Sunday 23:59 of the current calendar week, shown relative to the weekly study-hour goal.
3. WHEN the Goals_Module is displayed, THE Goals_Module SHALL display progress toward the daily question goal as the count of questions in Practice_Sets logged from 00:00 through 23:59 of the current calendar day, shown relative to the daily question goal.
4. WHEN the Goals_Module is displayed, THE Goals_Module SHALL display the count of completed Full_Length_Records as an integer of 0 or greater.
5. WHEN the user marks a Milestone complete, THE Goals_Module SHALL store the Milestone's completion state such that it is retained across page reloads.
6. WHEN the user sets a target score that is an integer from 472 to 528 inclusive, THE Goals_Module SHALL store that value and use it as the target across the Dashboard and Full_Length_Tracker chart.
7. IF the user submits a target score that is not an integer or is outside the range 472 to 528 inclusive, THEN THE Goals_Module SHALL reject the value, retain the previously stored target score, and display an error message indicating the valid integer range of 472 to 528.

### Requirement 16: Daily Study Log

**User Story:** As a student, I want a reflective daily log, so that I can track consistency and capture what to review next.

#### Acceptance Criteria

1. WHEN the user submits a Daily_Log_Entry for a date, THE Daily_Log SHALL store: a date, hours studied (a number from 0 to 24 with up to one decimal place), questions completed (an integer from 0 to 9999), accuracy (a percentage from 0 to 100), subject studied, energy level (an integer from 1 to 5), confidence level (an integer from 1 to 5), and reflection notes (text up to 2000 characters).
2. IF the user submits a Daily_Log_Entry for a date that already has an entry, THEN THE Daily_Log SHALL update the existing entry for that date rather than creating a duplicate.
3. IF the user submits a Daily_Log_Entry with a missing or invalid date, or with any numeric field outside its allowed range, THEN THE Daily_Log SHALL reject the submission, retain any existing entry for that date unchanged, and display an indication of the reason for rejection.
4. THE Daily_Log SHALL display the reflection prompts: what did I learn today, what confused me, what should I review tomorrow, and what mistake pattern showed up.
5. THE Daily_Log SHALL display recorded Daily_Log_Entries ordered by date, most recent first.
6. WHILE no Daily_Log_Entries exist, THE Daily_Log SHALL keep the entry display area visible, display an empty-state message within that area, and indicate that recorded entries will appear there ordered by date with the most recent first.

### Requirement 17: Test-Day Readiness Checklist

**User Story:** As a student approaching the exam, I want a test-day checklist, so that I complete my final preparation.

#### Acceptance Criteria

1. THE Readiness_Checklist SHALL present the 10 predefined test-day preparation items listed in the blueprint (test location confirmed, valid ID ready, AAMC login ready, snacks packed, break plan made, sleep schedule adjusted, last full-length completed, formulas reviewed, weak topics reviewed, no heavy studying day before).
2. WHEN the user checks or unchecks a checklist item, THE Readiness_Checklist SHALL store the item's updated checked state in the State_Object such that the state persists across page reloads and browser sessions.
3. WHEN any checklist item's checked state changes, THE Readiness_Checklist SHALL update and display the count of completed items as a value from 0 to the total number of items (predefined plus custom).
4. WHEN the user adds a custom checklist item containing 1 to 100 characters, including items composed only of whitespace characters, THE Readiness_Checklist SHALL store the custom item alongside the predefined items in the State_Object, up to a maximum of 50 custom items.
5. IF the user attempts to add a custom checklist item that is completely empty with zero characters, exceeds 100 characters, or would exceed the 50-item maximum, THEN THE Readiness_Checklist SHALL reject the addition, retain the existing checklist unchanged, and display a message indicating the reason for rejection.

### Requirement 18: In-App Reminders

**User Story:** As a student, I want in-app reminders, so that I stay consistent without relying on a backend service.

#### Acceptance Criteria

1. WHEN the App loads and WHEN any underlying data (test date, Review_Items, scheduled full-length events, or Error_Log entries) changes, THE Reminder_System SHALL recompute the active reminder set from existing data, including the test-date countdown, each Review_Item with a due date at or before the current date, each scheduled full-length event dated on the current date, and each Error_Log entry with a retest date at or before the current date.
2. WHILE one or more reminders are active and have not been dismissed for the current calendar day, THE Reminder_System SHALL display each active reminder in a persistent reminder area visible on every primary view of the App, showing the reminder type and its associated due or event date.
3. IF no reminders are active after recomputation, THEN THE Reminder_System SHALL display no reminder entries and SHALL hide the reminder area.
4. WHEN the user dismisses a reminder, THE Reminder_System SHALL stop displaying that specific reminder for the remainder of the current calendar day, including across App reloads, and SHALL redisplay it on the next calendar day if it remains active.
5. THE Reminder_System SHALL operate entirely within the browser and SHALL make zero network requests when computing, displaying, or dismissing reminders.

### Requirement 19: User Settings and Profile

**User Story:** As a user, I want a settings and profile area, so that I can personalize the dashboard and store my study context.

#### Acceptance Criteria

1. THE Settings_Module SHALL store the following fields: name (text, maximum 100 characters), test date (calendar date), target score (integer from 472 to 528 inclusive), starting diagnostic score (integer from 472 to 528 inclusive), weekly availability (integer hours from 0 to 168 inclusive), preferred resources (text, maximum 1000 characters), and study phase.
2. THE Settings_Module SHALL constrain study phase to exactly one of: content review, practice-heavy, AAMC phase, final review.
3. WHEN the user changes the test date in the Settings_Module, THE Settings_Module SHALL update the test date used by the Dashboard countdown within 1 second of the change being saved.
4. WHEN the user changes the target score in the Settings_Module, THE Settings_Module SHALL update the target score used by the Goals_Module and Full_Length_Tracker chart within 1 second of the change being saved, allowing partial updates such that the Settings_Module SHALL proceed to apply the update to the remaining target even if updating either the Goals_Module or the Full_Length_Tracker chart fails.
5. THE Settings_Module SHALL preserve the existing theme preference and export/import controls without altering their behavior.
6. IF the user enters a target score or starting diagnostic score outside the range 472 to 528, THEN THE Settings_Module SHALL reject only the invalid entry, display an error indication identifying the invalid field and its valid range, and retain the previously saved value for that field; WHEN the user enters a target score or starting diagnostic score that is a valid integer from 472 to 528 inclusive, THE Settings_Module SHALL accept and store that value normally without displaying an error.
7. IF the user enters a test date that is not a valid calendar date or is earlier than the current date, THEN THE Settings_Module SHALL reject the entry, display an error indication identifying the invalid test date, and retain the previously saved test date.
8. WHEN the user saves valid changes in the Settings_Module, THE Settings_Module SHALL persist all stored fields to client-side storage so that the values remain available after a page reload.

### Requirement 20: Navigation Integration

**User Story:** As a user, I want the new modules reachable from the existing navigation, so that the expanded app stays consistent and easy to use.

#### Acceptance Criteria

1. THE App SHALL add exactly one navigation entry for each of the following ten new views: Practice Questions, Content Tracker, CARS Tracker, Review, Analytics, Notes, Goals, Daily Log, Settings, and Readiness Checklist.
2. WHEN the user selects a navigation entry, THE App SHALL mark that entry as the active entry and SHALL mark all other navigation entries as not active.
3. WHEN the user selects a navigation entry, THE App SHALL make the corresponding view visible and SHALL hide all other views, such that exactly one view is visible at any time.
4. THE App SHALL preserve all navigation entries and views that existed before the new entries were added, and selecting any preserved entry SHALL produce the same view-switching outcome defined in criteria 2 and 3.
5. WHEN the user selects a view that renders a chart or aggregated data, THE App SHALL recompute that view's displayed data from the current State_Object before that view becomes visible.
6. IF the user selects a view whose required data in the current State_Object is empty or absent, THEN THE App SHALL display the view with an empty-state indication in place of the chart or aggregated data and SHALL leave the State_Object unchanged.
7. WHEN the user selects a view whose required data in the current State_Object is neither empty nor absent, THE App SHALL display the view's chart or aggregated data according to the normal data display rules rather than an empty-state indication.

### Requirement 21: Customizable Sidebar Navigation

**User Story:** As a user, I want to reorder and hide sidebar navigation entries, so that I can tailor the menu to show only the views I use most in the order I prefer.

#### Acceptance Criteria

1. THE App SHALL display a "✎ Customize menu" toggle button in the sidebar footer that switches the sidebar between normal mode and edit mode.
2. WHILE the sidebar is in edit mode, THE App SHALL display each navigation entry as a draggable item that the user can reorder by dragging to a new position within the sidebar list.
3. WHILE the sidebar is in edit mode, THE App SHALL display a visibility toggle icon on each navigation entry that allows the user to hide or show that entry.
4. WHEN the user reorders navigation entries in edit mode, THE App SHALL store the updated order as a navOrder array in state.settings within the State_Object and persist the change to localStorage.
5. WHEN the user hides or shows a navigation entry in edit mode, THE App SHALL store the hidden entries as a navHidden array in state.settings within the State_Object and persist the change to localStorage.
6. WHILE the sidebar is in normal mode, THE App SHALL display navigation entries in the order defined by the navOrder array and SHALL hide entries listed in the navHidden array.
7. IF the user attempts to hide the last visible navigation entry, THEN THE App SHALL reject the action, retain the entry as visible, and leave the navHidden array unchanged.
8. WHEN the active view is hidden by the user, THE App SHALL redirect to the first visible view in the navOrder and mark that view's navigation entry as active.
9. WHILE the sidebar is in edit mode, THE App SHALL suppress navigation clicks so that selecting a navigation entry does not switch the active view.
10. WHEN the App loads, THE App SHALL read the navOrder and navHidden arrays from the persisted State_Object in localStorage and apply them to the sidebar, preserving the user's customization across page reloads.
11. WHEN the State_Object lacks a navOrder array or a navHidden array, THE App SHALL use the default navigation order with all entries visible.
