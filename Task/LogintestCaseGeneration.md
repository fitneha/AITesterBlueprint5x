# ROLE: Lead QA Engineer / Senior SDET – Functional Test Design

Act as an experienced Lead QA Engineer with 10+ years of experience in web application testing, authentication testing, test strategy, risk-based testing, and enterprise-level quality engineering.

Your task is to analyze and design a comprehensive functional test suite for the existing login page:

**Application:** https://app.wingify.com  
**Module:** Login / Authentication  
**Testing Type:** Functional Testing (Positive and Negative)

The objective is to produce high-quality, execution-ready test cases that a professional QA team can directly use for test execution and Jira test management.

# 1. Understand the Application Before Designing Test Cases

First, inspect the existing Wingify login page and understand its actual UI and behavior.

Identify:
- All visible input fields.
- All buttons, checkboxes, links, and interactive elements.
- Available authentication methods.
- Field-level validation behavior.
- Existing error and success messages.
- Navigation and redirection behavior.
- Existing login-related functionality.

Do not start generating test cases based only on generic login-page knowledge.

Use the actual application as the primary source of truth. Official product documentation can be used as supporting information.

If authentication requires credentials or access that are unavailable, clearly identify what could not be verified. Never assume successful access or fabricate observations.

# 2. Functional Test Coverage – Comprehensive Test Design

Think like a Lead QA reviewing the completeness of a login test suite.

Cover the following categories wherever the functionality exists.

## A. UI and Field-Level Functional Validation
- Verify all login page elements are displayed correctly.
- Verify mandatory field validations.
- Verify placeholder text and field labels.
- Verify email field input handling.
- Verify password masking.
- Verify show/hide password functionality, if available.
- Verify checkbox selection and deselection.
- Verify button enabled/disabled behavior.
- Verify field focus and tab navigation.
- Verify keyboard-based interactions.
- Verify validation messages appear at the correct time.
- Verify error messages disappear or update appropriately after correcting input.

## B. Positive Functional Scenarios
- Login with valid registered credentials.
- Login with valid credentials using keyboard Enter.
- Login with valid credentials using the Sign In button.
- Verify successful authentication.
- Verify correct post-login redirection.
- Verify access to the expected workspace.
- Verify behavior when the user has access to multiple workspaces.
- Verify Remember me functionality when selected.
- Verify successful authentication through other existing login methods, where configured.

## C. Negative Functional Scenarios
- Both fields empty.
- Email empty and password populated.
- Email populated and password empty.
- Invalid email format.
- Unregistered email address.
- Incorrect password.
- Incorrect email and password combination.
- Whitespace-only values.
- Leading and trailing spaces.
- Special characters.
- Extremely long input values.
- Boundary-value inputs.
- Repeated unsuccessful login attempts.
- Invalid credentials followed by valid credentials.
- Existing error message validation.
- Authentication failure handling.

## D. Email and Password Input Behavior
Think beyond basic empty-field validation.

Evaluate:
- Valid and invalid email formats.
- Uppercase and lowercase email input.
- Special characters in email addresses.
- Spaces within and around email addresses.
- Minimum and maximum input lengths, where defined.
- Password case sensitivity.
- Password containing special characters.
- Password containing numbers and symbols.
- Password field copy/paste behavior, where applicable.
- Password visibility toggle behavior, where available.
- Handling of browser autofill and saved credentials.

Do not invent email or password restrictions that are not established by the application.

## E. Login Button and Interaction Behavior
- Clicking Sign In with valid inputs.
- Clicking Sign In with invalid inputs.
- Clicking Sign In repeatedly.
- Double-clicking the Sign In button.
- Pressing Enter after entering credentials.
- Pressing Enter with incomplete credentials.
- Behavior during an ongoing authentication request.
- Handling of delayed responses.
- Prevention of unintended duplicate submissions.
- Behavior when navigating away during authentication.

## F. Remember Me and Session Management
Where supported by the existing implementation:
- Login with Remember me selected.
- Login without Remember me selected.
- Verify session persistence after browser refresh.
- Verify session behavior after closing and reopening the browser.
- Verify inactivity-based session expiration.
- Verify behavior after session expiration.
- Verify access after logout.
- Verify browser back navigation after logout.
- Verify direct navigation to an authenticated page without logging in.
- Verify multiple browser tabs and session consistency.

Do not assume session durations. Use documented or configured values.

## G. Existing Alternative Authentication Methods
Inspect whether the login page supports:
- Google sign-in.
- Single Sign-On (SSO).
- Passkey authentication.

For each method that is available and configured, consider:
- Successful authentication.
- Authentication cancellation.
- Authentication failure.
- Invalid or unsupported account.
- Identity provider unavailable.
- Redirect and callback handling.
- Returning to the login page after failure.
- Behavior when the user does not have access to the relevant workspace.

Do not include unavailable authentication methods as executable test cases.

## H. Forgot Password and Other Login Page Navigation
- Verify Forgot Password link visibility and navigation.
- Verify navigation to the existing password recovery page.
- Verify return navigation to the login page, if supported.
- Verify Start a free trial navigation.
- Verify Privacy Policy and Terms links.
- Verify correct link destinations.

Important: Do not expand into complete password reset or account registration test suites. Keep the scope limited to the login page and its existing entry-point interactions.

## I. Account and Authentication State Handling
Where the application's behavior and test data permit:
- Active user.
- Disabled user.
- Revoked user access.
- Unverified account.
- Expired password.
- User without an established password.
- User with access to multiple workspaces.
- User whose previously accessed workspace is unavailable.

Validate only existing, documented behavior. If the expected result depends on account configuration, mark it for clarification.

## J. Error Handling and Recovery
- Verify appropriate error messages for failed authentication.
- Verify no incorrect success indication is displayed.
- Verify the user can correct input and retry.
- Verify recovery from temporary authentication failures.
- Verify behavior when the authentication service is unavailable.
- Verify behavior during network interruption.
- Verify handling of slow authentication responses.
- Verify that the login page remains usable after an error.

## K. Security-Related Functional Checks
Include functional security checks relevant to the login interface:
- Password masking.
- No unintended password exposure in the UI.
- No unintended credential retention after logout.
- Unauthorized access prevention.
- Protected page access without authentication.
- Session invalidation after logout.
- Secure handling of authentication redirects.
- No sensitive information exposed through user-facing error messages.

Do not turn this assignment into a separate penetration testing or vulnerability assessment exercise.

## L. Browser and Responsive Functional Coverage
Where supported:
- Page behavior after refresh.
- Browser back and forward navigation.
- Login page in multiple tabs.
- Browser autofill behavior.
- Supported browser compatibility.
- Different viewport sizes.
- Mobile and desktop layout interactions.
- Login functionality after browser cache or session changes.

# 3. Apply Professional Test Design Techniques

Do not simply create one test case for each bullet point.

Use the following techniques to identify meaningful test scenarios:

1. Equivalence Partitioning.
2. Boundary Value Analysis.
3. Decision Table Testing.
4. State Transition Testing.
5. Negative Testing.
6. Error Guessing.
7. Risk-Based Testing.
8. Exploratory Test Thinking.

Consider combinations of input conditions where they provide meaningful additional coverage.

Identify:
- Missing scenarios.
- Overlapping scenarios.
- Redundant test cases.
- High-risk authentication paths.
- Important edge cases.

Each test case must have one clear testing objective and should be independently executable.

# 4. Strict Scope and Assumption Control

This is a critical requirement.

- Test only the existing application functionality.
- Do not introduce new features, workflows, or business requirements.
- Do not assume a particular validation rule without evidence.
- Do not invent error messages or expected results.
- Do not create duplicate test cases to inflate coverage.
- Do not execute destructive actions.
- Do not use real customer credentials.
- Use authorized test accounts and safe test data.
- Clearly separate verified behavior from assumptions and requirements needing clarification.

If a feature is unavailable, do not generate test cases for it.

# 5. Jira-Compatible Test Case Format

Generate test cases using the following Jira-compatible fields.

| Field | Requirement |
|---|---|
| Test Case ID | Unique ID: LOGIN_TC_001, LOGIN_TC_002, etc. |
| Issue Type | Test |
| Summary | Clear and concise test case title |
| Test Category | UI / Functional / Authentication / Session / Navigation / Security |
| Test Type | Positive / Negative |
| Priority | Critical / High / Medium / Low |
| Preconditions | Required application and account state |
| Test Steps | Numbered, detailed execution instructions |
| Test Data | Specific input values or test data references |
| Expected Result | Clear, observable outcome |
| Actual Result | Blank |
| Execution Status | Not Executed |
| Labels | Login, Functional, Positive/Negative |

Test case writing standards:
- Use action-oriented test case titles.
- Keep each test case focused on one objective.
- Avoid combining unrelated validations.
- Write clear and sequential steps.
- Mention exact test data wherever possible.
- Make expected results measurable and verifiable.
- Ensure another QA engineer can execute the test without additional explanation.

# 6. Risk-Based Prioritization

Assign priority based on business impact and authentication risk.

Suggested guidelines:

**Critical**
- Successful authentication.
- Unauthorized access prevention.
- Authentication bypass.
- Session invalidation.

**High**
- Invalid credential handling.
- Login validation.
- Session expiration.
- Alternative authentication failures.

**Medium**
- Input boundary conditions.
- Remember me behavior.
- Navigation and browser interactions.

**Low**
- Minor UI interaction issues that do not affect authentication.

Adjust priority based on actual application behavior and business risk.

# 7. Excel Workbook – Mandatory Deliverable

Generate a downloadable, professionally formatted Excel workbook (.xlsx).

Create the following worksheets:

### Sheet 1: Test Case Summary
Include:
- Total number of test cases.
- Positive test case count.
- Negative test case count.
- Priority-wise distribution.
- Category-wise distribution.
- Coverage overview.

### Sheet 2: Positive Test Cases
Include all positive test cases using the Jira-compatible fields.

### Sheet 3: Negative Test Cases
Include all negative test cases using the Jira-compatible fields.

### Sheet 4: Assumptions and Clarifications
Include:
- Features that could not be verified.
- Missing application requirements.
- Expected behaviors requiring confirmation.
- Test data or environment dependencies.

### Excel Formatting Requirements
- Professional QA documentation layout.
- Bold and clearly distinguishable headers.
- Filters on all test case columns.
- Freeze the header row.
- Appropriate column widths.
- Text wrapping for test steps and expected results.
- Consistent priority formatting.
- Unique test case IDs.
- No merged cells in the test case data sheets.
- All test cases must be included without truncation or omission.

# 8. Final Lead QA Review

Before delivering the workbook, conduct a quality review.

Check the following:

1. Is every visible login element covered?
2. Are all existing authentication methods considered?
3. Are positive and negative scenarios adequately represented?
4. Have input combinations and boundary conditions been considered?
5. Are session and navigation scenarios covered?
6. Are error handling and recovery scenarios covered?
7. Are test cases independent and non-duplicative?
8. Are priorities assigned logically?
9. Are expected results specific and testable?
10. Are unsupported assumptions excluded?
11. Are all test cases represented in the Excel workbook?
12. Can another QA engineer execute these cases independently?

# 9. Expected Final Output

Deliver the following:

**Deliverable 1:** Application functionality and scope summary.

**Deliverable 2:** Jira-compatible functional test cases, organized into positive and negative scenarios.

**Deliverable 3:** Downloadable Excel workbook containing all test cases and summary sheets.

**Deliverable 4:** Coverage analysis highlighting important areas covered and any remaining gaps.

**Deliverable 5:** List of assumptions and clarification points.

Final instruction:

Think and review like a Lead QA Engineer responsible for approving the completeness of a login test suite before it enters the QA execution cycle.

Prioritize application-specific accuracy, meaningful coverage, test independence, and execution readiness over test case quantity.

Do not stop at basic happy-path and negative-path scenarios. Identify the meaningful combinations, edge cases, and authentication states that an experienced QA engineer would expect to validate.