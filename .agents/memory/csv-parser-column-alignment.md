---
name: CSV parser column alignment bug
description: The regex-based CSV parser skips empty fields, causing column index misalignment when optional columns are blank — correct_answer and explanation silently become empty strings.
---

# CSV Parser: Always Use Character-by-Character parseCsvLine

## Rule
Never parse CSV lines with a regex like `line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)`. It skips empty fields entirely, causing every column after a blank optional field to shift left and land on the wrong index.

**Why:** When a row has blank `option_c` and `option_d` (e.g. `"Q1","A","B",,,B,"Explanation"`), the regex only matches 5 tokens instead of 7. `cols[5]` (correct_answer) and `cols[6]` (explanation) become undefined → empty string. On the server, empty `correct_answer` causes the question to be skipped or saved with null, so `user_answers` rows are never written and Answer Sheet + Solutions tabs are empty.

**How to apply:** Always use the character-by-character `parseCsvLine` function (defined in both AdminTestManagementPage and AdminQuizzesPage after this fix). It preserves empty fields as empty strings so column indices stay stable.

## Also: validateQuestionClient must handle MCQ/NAT
The client-side preview validator must accept MCQ correct_answers (e.g. "A,C") and NAT numeric answers, not just A/B/C/D. Otherwise valid MCQ/NAT rows show "Error" in the preview table and users can't confirm their import before submitting.

## No SQL changes required
The schema (quiz_questions + user_answers) already has correct_answer NOT NULL, explanation TEXT, video_solution_url TEXT — all correct.
