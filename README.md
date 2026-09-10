# Resumate

A full-stack AI-assisted resume builder with six sample-inspired resume formats, editable resume content, AI bullet generation, resume quality checks, and read-only ATS keyword analysis.

## Features

- Six distinct resume templates with different typography, alignment, density and section order.
- Editable resume name and structured resume editor.
- Import PDF/TXT resumes, including scanned/image PDFs when readable by the AI importer.
- AI-generated project and experience bullets based only on supplied facts.
- AI quality check for inconsistencies, placeholders, malformed links and wording risks.
- ATS keyword analysis against a pasted job description or public job URL.
- Shows matched keywords plus keywords to consider including or removing.
- ATS analysis never rewrites or changes the resume.
- Clickable LinkedIn, GitHub and Portfolio text links.
- Light/dark application theme and print-to-PDF resume output.
- AppDeploy backend APIs and managed database for saved resumes.

## Run

This project is deployed through AppDeploy. The `@appdeploy/client` and `@appdeploy/sdk` packages are provided by the AppDeploy runtime.

For local development, install dependencies and run the Vite dev server:

```bash
npm install
npm run dev
```

## Notes

The ATS score is a keyword-match estimate for the supplied job description, not a guaranteed employer ATS score. AI suggestions should be reviewed by the user before being added to a resume.

The deployed application uses AppDeploy's managed database rather than a separate MongoDB/Mongoose setup.

LIVE URL -
apna-resumate-aryaa.netlify.app
