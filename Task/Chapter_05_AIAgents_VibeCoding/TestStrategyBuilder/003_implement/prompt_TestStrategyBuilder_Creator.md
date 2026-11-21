# PROJECT: AI-POWERED TEST STRATEGY BUILDER

## R – ROLE

Act as a Senior Full-Stack Engineer, Solution Architect and QA Automation Architect with 10+ years of experience in:

- React and modern frontend development.
- Backend API development and system architecture.
- Jira REST API integration.
- LLM integration and prompt engineering.
- Software testing methodologies.
- Enterprise test strategy design.
- Test automation architecture.
- Requirement analysis and risk-based testing.
- Markdown document generation.

You are responsible for designing and implementing a lightweight, scalable, secure and user-friendly AI-Powered Test Strategy Builder.

Think like a technical architect building an enterprise-ready QA productivity tool, not a simple chatbot or document generator.

The application must follow clean architecture, separation of concerns, modular development and maintainable coding practices.

---

## I – INSTRUCTIONS

Build a lightweight React-based web application that allows QA engineers to generate comprehensive Test Strategy documents using Jira requirements.

### Primary Objective

The application should accept Jira inputs such as:

- Jira Issue ID (Story, Task or Bug).
- Jira Epic ID.
- Multiple Jira Issue IDs.
- Jira Project ID or Project Key, where supported.

It must retrieve the relevant requirements from Jira, analyze them using an AI model and generate a professional Test Strategy document based on the Test Strategy template supplied during the planning phase.

### Core Functional Requirements

#### 1. User Interface

Build a clean, modern and responsive React application.

The interface should contain:

- Application title: AI-Powered Test Strategy Builder.
- Jira Issue ID input.
- Jira Epic ID input.
- Support for multiple Jira issue IDs.
- Jira connection status.
- AI model configuration.
- Generate Test Strategy button.
- Loading and processing indicators.
- Generated Test Strategy preview.
- Download Markdown option.
- Regenerate and Edit options.

Provide clear validation messages for invalid Jira IDs, missing inputs and connection failures.

#### 2. Jira Integration

Integrate with Jira using its REST APIs.

The application must:

1. Authenticate securely with Jira.
2. Retrieve Jira issue details.
3. Retrieve issue summary and description.
4. Retrieve acceptance criteria.
5. Retrieve relevant labels, components and issue types.
6. Retrieve linked issues and dependencies.
7. Retrieve parent Epic information when applicable.
8. Retrieve child issues when an Epic is provided.
9. Retrieve relevant comments and attachments when authorized and necessary.
10. Support pagination for large Epic issue collections.

Extract and normalize the retrieved information before passing it to the AI layer.

Important:
- Do not assume every Jira issue contains acceptance criteria.
- Do not invent missing requirements.
- Respect Jira permissions and project access restrictions.
- Handle deleted, inaccessible and invalid Jira issues gracefully.
- Avoid retrieving unnecessary sensitive information.

#### 3. Requirement Analysis Engine

Before generating the Test Strategy, analyze the retrieved Jira information.

Identify:

- Business objectives.
- Functional requirements.
- Application modules.
- Critical workflows.
- User roles and permissions.
- System integrations.
- API dependencies.
- Data validation requirements.
- Security implications.
- Potential failure scenarios.
- Quality risks.
- Missing information.
- Dependencies and assumptions.

Categorize findings into:

A. Confirmed requirements  
B. Inferred requirements  
C. Missing information  
D. Assumptions requiring validation  
E. Risks and dependencies

Do not treat assumptions as confirmed requirements.

#### 4. AI Test Strategy Generation

Use the retrieved Jira requirements and the approved Test Strategy template.

The AI must think like an experienced QA Architect.

It must determine:

- What needs to be tested.
- Why specific testing types are required.
- How testing should be performed.
- Which areas require automation.
- Which areas require manual or exploratory testing.
- What risks could impact application quality.
- What testing tools are appropriate.
- What quality gates should be established.

Do not blindly recommend every testing type.

For example, recommend performance testing only when the application requirements, architecture or risk profile justify it.

#### 5. Test Strategy Template

Use the following structure for the generated document.

# TEST STRATEGY

1. Document Information
2. Executive Summary
3. Application Overview
4. Business Objectives
5. Testing Objectives
6. Scope of Testing
   - In Scope
   - Out of Scope
7. Requirements Analysis
8. Application Modules and Critical Workflows
9. Testing Approach
   - Functional Testing
   - UI Testing
   - API Testing
   - Integration Testing
   - Regression Testing
   - Security Testing
   - Performance Testing
   - Accessibility Testing
   - Exploratory Testing
10. Risk-Based Testing Strategy
11. Test Automation Strategy
   - Automation Objectives
   - Automation Scope
   - UI Automation
   - API Automation
   - Framework Recommendations
   - CI/CD Integration
   - Reporting
12. Test Environment Strategy
13. Test Data Management
14. Defect Management
15. Entry Criteria
16. Exit Criteria
17. Quality Gates and Release Readiness
18. Roles and Responsibilities
19. Risks, Assumptions, Dependencies and Constraints
20. Test Metrics and Reporting
21. Test Deliverables
22. Tools and Technologies
23. Open Questions and Recommendations
24. Requirements Traceability

The generated document must contain meaningful application-specific information.

Do not fill sections with generic statements merely to complete the template.

If information is unavailable, explicitly mention "Not provided – requires confirmation."

#### 6. Strategy Quality Validation

Before displaying the generated strategy, validate:

- All relevant Jira requirements are considered.
- Critical business workflows are identified.
- Testing types are justified.
- Automation recommendations are practical.
- Risks have corresponding mitigation strategies.
- Entry and exit criteria are measurable.
- Missing information is clearly documented.
- No unsupported application features are introduced.
- The generated content follows the supplied template.
- The output is a Test Strategy, not a feature-level Test Plan.

Provide a quality validation summary with:
- Requirements analyzed.
- Requirements with missing information.
- Identified risks.
- Unresolved assumptions.
- Strategy completeness assessment.

#### 7. Document Management

Provide the following functionality:

- Preview generated Test Strategy.
- Edit generated content.
- Regenerate selected sections.
- Download as Markdown (.md).
- Download as PDF if supported.
- Preserve the source Jira issue references.
- Include generation timestamp and document version.

---

## C – CONTEXT

### Business Context

QA engineers spend considerable time manually reviewing Jira requirements, understanding application workflows, identifying testing risks and preparing Test Strategy documents.

This application aims to reduce repetitive documentation work through AI-assisted requirement analysis and Test Strategy generation.

### Target Users

- QA Engineers.
- Senior SDETs.
- QA Leads.
- Test Managers.
- QA Architects.

### Application Context

The application should support generating Test Strategies using Jira requirements at different levels:

1. Individual Jira Story.
2. Jira Task.
3. Multiple Jira Stories.
4. Jira Epic with its associated Stories and Tasks.
5. Multiple related Jira Epics, where explicitly selected.

The application must distinguish between application-level Test Strategy and feature-level Test Plan.

A Jira Story may not contain enough information to create an application-wide Test Strategy. In such cases, clearly identify the scope limitation and request additional application documentation or context.

### Template Context

A predefined Markdown Test Strategy template will be supplied during the planning phase.

Treat this template as the source of truth for document structure.

Do not introduce a different structure without explicit approval.

---

## E – EXAMPLES

### Example Input

Jira Epic: IAM-1000

Epic Summary: User Lifecycle Management

Associated Stories:
- IAM-1001: Create User
- IAM-1002: Update User
- IAM-1003: Delete User
- IAM-1004: Assign Roles
- IAM-1005: User Provisioning

### Expected AI Analysis

Business objective:
Manage the complete user lifecycle within the identity management platform.

Identified modules:
- User Management
- Role Management
- Provisioning

Critical workflows:
- User creation.
- User updates.
- User deletion.
- Role assignment.
- User provisioning.

Potential testing areas:
- Functional testing.
- API testing.
- Integration testing.
- Security testing.
- Regression testing.

Potential risks:
- Unauthorized role assignment.
- Incorrect user provisioning.
- Inconsistent user data.
- Failure to deprovision inactive users.

These are candidate risks to validate against actual requirements and architecture.

### Expected Output

A comprehensive `TEST_STRATEGY.md` containing:

- Application-specific testing approach.
- Relevant testing types and justification.
- Risk-based testing recommendations.
- Automation strategy.
- Environment and test data requirements.
- Entry and exit criteria.
- Quality gates.
- Requirements traceability.

The AI must link each major testing recommendation to the relevant Jira issue wherever possible.

---

## P – PERSONA

The application should deliver outputs that reflect the thinking of a Senior QA Architect.

The AI must:

- Think critically before generating documents.
- Challenge incomplete requirements.
- Prioritize business-critical functionality.
- Focus on risk-based testing.
- Recommend maintainable automation solutions.
- Avoid unnecessary testing activities.
- Use clear and professional QA terminology.
- Provide actionable recommendations.
- Explain why a testing approach is recommended.

The generated document should be suitable for review by QA Leads, Engineering Managers and Product Owners.

---

## O – OUTPUT

### Application Output

Build a React application with the following screens or sections:

1. Dashboard.
2. Jira Input and Connection.
3. Requirement Analysis.
4. Test Strategy Generation.
5. Strategy Preview and Editing.
6. Document Export.

### Generated Artifacts

- TEST_STRATEGY.md
- REQUIREMENT_ANALYSIS.md
- STRATEGY_VALIDATION_REPORT.md

### Expected UI Experience

The user should be able to:

1. Enter Jira credentials or connect Jira securely.
2. Enter an Epic ID or Story ID.
3. Retrieve Jira requirements.
4. Review retrieved requirements.
5. Initiate AI analysis.
6. Review missing information and assumptions.
7. Generate Test Strategy.
8. Preview and edit the document.
9. Download the final Markdown document.

The generated document must retain traceability to the Jira source issues.

---

## T – TOOLS AND TECHNOLOGY

### Frontend
- React.
- TypeScript.
- Vite.
- Tailwind CSS or an equivalent lightweight UI framework.

### Backend
- Python FastAPI or Node.js with Express.
- REST API architecture.
- Secure Jira API integration.

### AI Integration
- Claude API or OpenAI API.
- Configurable LLM provider.
- Structured prompts.
- Context-aware requirement analysis.
- Output validation.

### Integrations
- Jira REST API.
- GitHub/GitLab (optional future enhancement).

### Storage
- PostgreSQL or SQLite for lightweight persistence, if required.
- Secure configuration management.
- Document versioning.

### Document Generation
- Markdown generation.
- PDF export as an optional capability.

### Development Standards
- Modular architecture.
- Reusable components.
- Input validation.
- Centralized error handling.
- Secure secrets management.
- Logging and monitoring.
- Unit and integration testing.
- API documentation.
- Maintainable code.

---

## NON-FUNCTIONAL REQUIREMENTS

1. Security: Jira credentials and AI API keys must never be exposed in frontend code.
2. Performance: Handle Jira retrieval and AI generation asynchronously.
3. Reliability: Implement retries and meaningful error handling.
4. Scalability: Support multiple Jira issues and larger Epics through pagination and controlled context processing.
5. Maintainability: Keep Jira integration, AI orchestration and document generation separate.
6. Usability: Keep the UI simple enough for non-technical QA users.
7. Traceability: Maintain source Jira references for generated strategy decisions.

---

## IMPLEMENTATION APPROACH

Follow these development phases.

### Phase 1 – Planning
- Understand requirements.
- Review the supplied Test Strategy template.
- Define architecture.
- Define API contracts.
- Define Jira authentication approach.
- Create implementation plan.

### Phase 2 – Backend
- Implement Jira integration.
- Retrieve and normalize issue data.
- Implement requirement analysis.
- Implement AI generation.
- Implement document validation.

### Phase 3 – Frontend
- Build Jira input interface.
- Implement retrieval status.
- Build requirement analysis view.
- Build Test Strategy preview.
- Implement editing and download functionality.

### Phase 4 – Validation
- Test valid Jira Story.
- Test valid Jira Epic.
- Test multiple Jira issue IDs.
- Test invalid Jira IDs.
- Test inaccessible Jira issues.
- Test missing acceptance criteria.
- Test incomplete requirements.
- Test large Epics and pagination.
- Test AI hallucination and unsupported assumptions.
- Test generated Markdown formatting.

### Phase 5 – Delivery
- Provide complete source code.
- Provide README.md.
- Provide environment configuration example.
- Provide setup and execution instructions.
- Provide unit and integration tests.
- Provide architecture documentation.

## FINAL INSTRUCTIONS

Before writing code:

1. Inspect all supplied project files and the Test Strategy template.
2. Understand the complete requirements.
3. Present the proposed architecture and implementation plan.
4. Identify technical dependencies and missing information.
5. Avoid making unapproved assumptions.

After planning approval, implement the application incrementally.

Do not generate a mock-only frontend and claim that Jira integration or AI generation is complete.

All primary workflows must be functional and tested before declaring the MVP complete.