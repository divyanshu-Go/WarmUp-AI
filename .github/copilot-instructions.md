# WarmUp

## Project

WarmUp helps people prepare for interviews using their resumes. The Next.js frontend handles resume upload and onboarding, email OTP and Google sign-in, and the dashboard. The FastAPI backend provides authentication and resume APIs, with SQLAlchemy models and Alembic migrations for persistence.

## UI theme

- Use a light interface: white backgrounds and surfaces, dark readable text, and reddish-orange primary actions.
- Use Google Sans as the primary interface font.
- Keep the UI simple, compact, and structured, with concise copy and no decorative elements that do not help the user.
- Use the established tablet style as the default for cards, panels, and buttons: rounded rectangular white surfaces, bold dark borders, and reddish-orange accent/shadows.
- Keep controls and cards bold and slightly rounded. Reuse the color, spacing, border, radius, and shadow tokens in `frontend/app/globals.css` instead of adding one-off values.
- Keep focus states, errors, success states, and reduced-motion behavior legible and usable.

## Engineering

- Keep changes focused and logic straightforward. Follow existing component, API, and service boundaries; avoid duplicate behavior and unnecessary abstractions.
- Preserve existing user flows and frontend/backend contracts. Handle errors explicitly and keep types, validation, and state transitions clear.
- Refactor related code into small, maintainable units when it improves clarity; avoid unrelated rewrites.
- For frontend changes, run `npm run lint` and `npm run build` from `frontend/`. Add or update focused tests when the change affects testable behavior.
- Inspect the relevant implementation before changing it, and verify the requested behavior rather than relying only on a successful build.
