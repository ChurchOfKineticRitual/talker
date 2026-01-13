# Talker

Voice capture interface for Wisdom agents. Connects to Vapi assistants for voice conversations with real-time transcription.

## Features

- Session ID generation (`VS_DDMmmYY-N` format)
- Real-time transcript display
- Session context injection (guide the conversation)
- Post-call transcript export (copy or download)
- Clean, focused UI

## Workflow

1. Agent updates Vapi assistant with context (via MCP)
2. Agent provides app link: https://talker-app.netlify.app
3. User has voice conversation
4. User confirms session complete
5. Agent runs transcript-cleaner skill
6. Agent extracts entities from cleaned transcript

## Setup

1. Clone this repo
2. Copy `.env.example` to `.env` and add your Vapi keys
3. `npm install`
4. `npm run dev`

## Environment Variables

- `VITE_VAPI_PUBLIC_KEY` - Your Vapi public key
- `VITE_VAPI_ASSISTANT_ID` - The assistant ID

## Deployment

Configured for Netlify. Connect repo and set environment variables.

**Live:** https://talker-app.netlify.app
