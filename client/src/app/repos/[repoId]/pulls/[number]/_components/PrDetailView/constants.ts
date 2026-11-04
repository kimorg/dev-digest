/** Max width of the PR detail body on the Findings / Files changed tabs. */
export const PR_BODY_MAX_WIDTH = 1080;

/**
 * Max width on the Overview tab: Intent and Blast Radius cards are 25% wider
 * than at `PR_BODY_MAX_WIDTH`. At 1080 px each card is (1080 − 64 padding − 16
 * gap) / 2 = 500 px; 625 px cards need 2 × 625 + 16 + 64 = 1330 px.
 */
export const OVERVIEW_MAX_WIDTH = 1330;
