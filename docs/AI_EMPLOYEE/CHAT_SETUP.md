# BUSNET Assistant chat setup

The admin chat calls the `assistant-chat` Supabase Edge Function. The function:

- requires an authenticated, active admin account;
- searches only verified, shared Knowledge Center entries the caller may read;
- sends the question, recent chat turns, and matching knowledge excerpts to the configured AI provider;
- does not access bookings or perform operational actions.

## Configure the model

In the Supabase Dashboard for the BUSNET project, open **Edge Functions → Secrets** and add:

| Secret | Value |
| --- | --- |
| `AI_API_URL` | HTTPS URL for an OpenAI-compatible Chat Completions endpoint |
| `AI_API_KEY` | API key issued by the selected provider |
| `AI_MODEL` | Model identifier supported by that provider |

Never put the API key in frontend code, `.env` files committed to Git, chat messages, or Knowledge Center records. The API provider receives chat text and matching verified shared knowledge; do not enter passenger personal data in this assistant until an approved privacy and data-handling design is in place.

If these secrets are absent or invalid, the chat reports a configuration/provider error rather than pretending it answered.
