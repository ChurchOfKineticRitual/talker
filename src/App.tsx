import { useState, useEffect, useRef } from 'react';

// Session ID format: eS_DDMmmYY-N
function generateSessionId(): string {
  const now = new Date();
  const day = now.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[now.getMonth()];
  const year = String(now.getFullYear()).slice(-2);
  
  // Get session number from localStorage (resets daily)
  const dateKey = `${day}${month}${year}`;
  const storedDate = localStorage.getItem('eS_date');
  let sessionNum = 1;
  
  if (storedDate === dateKey) {
    sessionNum = parseInt(localStorage.getItem('eS_num') || '0') + 1;
  }
  
  localStorage.setItem('eS_date', dateKey);
  localStorage.setItem('eS_num', String(sessionNum));
  
  return `eS_${day}${month}${year}-${sessionNum}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function formatTranscriptForExport(sessionId: string, duration: string, messages: Message[]): string {
  const now = new Date();
  const startTime = `T-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  
  let transcript = `---\nsession_id: ${sessionId}\nduration: ${duration}\nstart_time: ${startTime}\nsummary: [TO BE FILLED]\n---\n\n`;
  
  messages.forEach(msg => {
    const speaker = msg.role === 'user' ? 'Jordan' : 'eA';
    transcript += `**${speaker}:** ${msg.text}\n\n`;
  });
  
  return transcript;
}

type AppState = 'idle' | 'connecting' | 'conversation' | 'ended';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
}

function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<'user' | 'assistant' | null>(null);

  const vapiRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Duration timer
  useEffect(() => {
    if (appState === 'conversation') {
      timerRef.current = window.setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [appState]);

  // Initialize Vapi
  useEffect(() => {
    const initVapi = async () => {
      try {
        const VapiModule = await import('@vapi-ai/web');
        const Vapi = VapiModule.default;

        const publicKey = import.meta.env.VITE_VAPI_PUBLIC_KEY;
        if (!publicKey) {
          console.error('Missing VITE_VAPI_PUBLIC_KEY');
          return;
        }

        vapiRef.current = new Vapi(publicKey);
        setIsConnected(true);
        setupEventListeners();
      } catch (error) {
        console.error('Failed to initialize Vapi:', error);
      }
    };

    initVapi();

    return () => {
      if (vapiRef.current) {
        try { vapiRef.current.stop(); } catch (e) { /* ignore */ }
      }
    };
  }, []);

  const setupEventListeners = () => {
    if (!vapiRef.current) return;
    const vapi = vapiRef.current;

    vapi.on('call-start', () => {
      setAppState('conversation');
      setMessages([]);
      setDuration(0);
    });

    vapi.on('call-end', () => {
      setAppState('ended');
      setIsSpeaking(null);
    });

    vapi.on('message', (message: any) => {
      if (message.type === 'transcript' || message.transcript) {
        handleTranscript(message);
      }
    });

    vapi.on('error', (error: any) => {
      console.error('Vapi error:', error);
      setAppState('idle');
    });
  };

  const handleTranscript = (message: any) => {
    const role = message.role || 'assistant';
    const transcript = message.transcript || message.text || '';
    const transcriptType = message.transcriptType || 'final';
    const isFinal = transcriptType === 'final';

    if (!transcript) return;

    // Show speaking indicator for interim results
    if (!isFinal) {
      setIsSpeaking(role);
      return;
    }

    // Only add final transcripts to the message list
    setIsSpeaking(null);
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      role,
      text: transcript,
      isFinal: true,
    }]);
  };

  const startCall = async () => {
    if (!vapiRef.current || !isConnected) return;

    const assistantId = import.meta.env.VITE_VAPI_ASSISTANT_ID;
    if (!assistantId) {
      console.error('Missing VITE_VAPI_ASSISTANT_ID');
      return;
    }

    try {
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      setAppState('connecting');
      await vapiRef.current.start(assistantId);
    } catch (error) {
      console.error('Failed to start call:', error);
      setAppState('idle');
    }
  };

  const endCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
    }
  };

  const toggleMute = () => {
    if (!vapiRef.current) return;
    const newState = !isMuted;
    vapiRef.current.setMuted(newState);
    setIsMuted(newState);
  };

  const copyTranscript = () => {
    const text = formatTranscriptForExport(sessionId, formatDuration(duration), messages);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTranscript = () => {
    const text = formatTranscriptForExport(sessionId, formatDuration(duration), messages);
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionId}_sT_raw.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const newSession = () => {
    setAppState('idle');
    setMessages([]);
    setDuration(0);
    setSessionId('');
    setCopied(false);
    setIsSpeaking(null);
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col">
      {/* Header */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-300">Enterview Agent</h1>
        {sessionId && (
          <p className="text-sm text-gray-500 font-mono mt-1">{sessionId}</p>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        {appState === 'idle' && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={startCall}
              disabled={!isConnected}
              className={`px-12 py-6 rounded-xl text-2xl font-bold transition-all ${
                isConnected
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isConnected ? 'START SESSION' : 'Connecting...'}
            </button>
          </div>
        )}

        {appState === 'connecting' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-pulse">🎙️</div>
              <p className="text-xl text-gray-400">Connecting...</p>
            </div>
          </div>
        )}

        {appState === 'conversation' && (
          <>
            {/* Timer */}
            <div className="text-center mb-4">
              <span className="text-sm text-gray-500 font-mono">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Transcript */}
            <div className="flex-1 bg-gray-800 rounded-lg p-4 mb-4 overflow-y-auto transcript-box" style={{ maxHeight: '60vh' }}>
              {messages.length === 0 && !isSpeaking ? (
                <p className="text-gray-500 text-center">Listening...</p>
              ) : (
                <div className="space-y-3">
                  {messages.map(msg => (
                    <div key={msg.id} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
                      <span className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-200'
                      }`}>
                        {msg.text}
                      </span>
                    </div>
                  ))}
                  {/* Speaking indicator */}
                  {isSpeaking && (
                    <div className={isSpeaking === 'user' ? 'text-right' : 'text-left'}>
                      <span className={`inline-block px-3 py-2 rounded-lg ${
                        isSpeaking === 'user'
                          ? 'bg-blue-600/50 text-white/70'
                          : 'bg-gray-700/50 text-gray-400'
                      }`}>
                        <span className="inline-flex gap-1">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>•</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>•</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>•</span>
                        </span>
                      </span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <button
                onClick={endCall}
                className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-500 font-semibold"
              >
                END
              </button>
              <button
                onClick={toggleMute}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  isMuted ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {isMuted ? 'UNMUTE' : 'MUTE'}
              </button>
            </div>
          </>
        )}

        {appState === 'ended' && (
          <>
            {/* Session Summary */}
            <div className="bg-gray-800 rounded-lg p-6 mb-4">
              <h2 className="text-xl font-bold mb-4">Session Complete</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Session ID:</span>
                  <p className="font-mono text-green-400">{sessionId}</p>
                </div>
                <div>
                  <span className="text-gray-500">Duration:</span>
                  <p className="font-mono">{formatDuration(duration)}</p>
                </div>
              </div>
            </div>

            {/* Transcript Preview */}
            <div className="bg-gray-800 rounded-lg p-4 mb-4 flex-1 overflow-y-auto transcript-box" style={{ maxHeight: '40vh' }}>
              <h3 className="text-sm text-gray-500 mb-3">Transcript</h3>
              <div className="space-y-2 text-sm">
                {messages.map(msg => (
                  <p key={msg.id} className={msg.role === 'user' ? 'text-blue-400' : 'text-gray-300'}>
                    <strong>{msg.role === 'user' ? 'Jordan' : 'eA'}:</strong> {msg.text}
                  </p>
                ))}
              </div>
            </div>

            {/* Export Actions */}
            <div className="flex justify-center gap-4 mb-4">
              <button
                onClick={copyTranscript}
                className={`px-6 py-3 rounded-lg font-semibold ${
                  copied ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {copied ? 'COPIED!' : 'COPY'}
              </button>
              <button
                onClick={downloadTranscript}
                className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold"
              >
                DOWNLOAD
              </button>
            </div>

            {/* New Session */}
            <div className="text-center">
              <button
                onClick={newSession}
                className="px-8 py-3 rounded-lg bg-green-600 hover:bg-green-500 font-semibold"
              >
                NEW SESSION
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
