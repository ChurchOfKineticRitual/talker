# Enterview Agent (eA)

Voice interview app for theKnowledge (tK) knowledge base.

## Features
- Session ID generation (`eS_DDMmmYY-N` format)
- Real-time transcript display
- Post-call transcript export
- Clean, focused interview UI

## Setup
1. Clone this repo
2. Copy `.env.example` to `.env` and add your Vapi keys
3. `npm install`
4. `npm run dev`

## Environment Variables
- `VITE_VAPI_PUBLIC_KEY` - Your Vapi public key
- `VITE_VAPI_ASSISTANT_ID` - The eA assistant ID

## Deployment
Configured for Netlify. Connect repo and set environment variables.
