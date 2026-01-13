import { useState, useEffect, useRef } from 'react';
import { useSpring, useTrail, animated } from '@react-spring/web';

// Session ID format: VS_DDMmmYY-N (Voice Session)
function generateSessionId(): string {
  const now = new Date();
  const day = now.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[now.getMonth()];
  const year = String(now.getFullYear()).slice(-2);

  // Get session number from localStorage (resets daily)
  const dateKey = `${day}${month}${year}`;
  const storedDate = localStorage.getItem('VS_date');
  let sessionNum = 1;

  if (storedDate === dateKey) {
    sessionNum = parseInt(localStorage.getItem('VS_num') || '0') + 1;
  }

  localStorage.setItem('VS_date', dateKey);
  localStorage.setItem('VS_num', String(sessionNum));

  return `VS_${day}${month}${year}-${sessionNum}`;
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
    const speaker = msg.role === 'user' ? 'Jordan' : 'cA';
    transcript += `**${speaker}:** ${msg.text}\n\n`;
  });
  
  return transcript;
}

// Get context from URL parameter
function getContextFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('context') || '';
}

// Cascading Text Component with react-spring animations
const CascadingText = ({ 
  text, 
  isVisible 
}: { 
  text: string; 
  isVisible: boolean;
}) => {
  const lines = Array.from({ length: 25 }, (_, i) => ({ text, id: i }));
  
  const [trail, api] = useTrail(
    lines.length,
    () => ({
      opacity: 0,
      transform: 'translateY(50px)',
      config: { 
        mass: 1, 
        tension: 200, 
        friction: 50,
      },
    }),
    []
  );

  useEffect(() => {
    if (isVisible) {
      api.start((index) => ({
        opacity: 1,
        transform: 'translateY(0px)',
        delay: index * 50,
      }));
    } else {
      api.start(() => ({
        opacity: 0,
        transform: 'translateY(50px)',
      }));
    }
  }, [isVisible, api]);

  const glowSpring = useSpring({
    loop: { reverse: true },
    from: { brightness: 0.8 },
    to: { brightness: 1.2 },
    config: { duration: 1500 },
    pause: !isVisible,
  });

  return (
    <div className="flex flex-col space-y-1 overflow-hidden h-full items-center">
      {trail.map((style, index) => (
        <animated.div
          key={lines[index].id}
          className="text-4xl sm:text-6xl md:text-8xl font-bold text-black select-none whitespace-nowrap text-center"
          style={{
            ...style,
            filter: glowSpring.brightness.to(b => `brightness(${b})`),
          }}
        >
          {text}
        </animated.div>
      ))}
    </div>
  );
};

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
  const [showTranscript, setShowTranscript] = useState(false);

  const vapiRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Generate session ID on mount
  useEffect(() => {
    setSessionId(generateSessionId());
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-return to idle after "Ciao for Now"
  useEffect(() => {
    if (appState === 'ended' && !showTranscript) {
      const timer = setTimeout(() => {
        setAppState('idle');
        setMessages([]);
        setSessionId(generateSessionId());
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [appState, showTranscript]);

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

    if (!isFinal) {
      setIsSpeaking(role);
      return;
    }

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
      setAppState('connecting');

      const urlContext = getContextFromUrl();
      const callOptions: { assistantOverrides?: { variableValues?: { sessionContext: string } } } = {};
      if (urlContext.trim()) {
        callOptions.assistantOverrides = {
          variableValues: {
            sessionContext: urlContext.trim()
          }
        };
      }

      await vapiRef.current.start(assistantId, callOptions);
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
    setSessionId(generateSessionId());
    setCopied(false);
    setIsSpeaking(null);
    setShowTranscript(false);
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {appState === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <p className="text-lg text-gray-400 font-mono">{sessionId}</p>
          <button
            onClick={startCall}
            disabled={!isConnected}
            className={`px-12 py-6 rounded-xl text-2xl font-bold transition-all ${
              isConnected
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isConnected ? 'TALK' : 'Connecting...'}
          </button>
        </div>
      )}

      {appState === 'connecting' && (
        <div className="flex-1 bg-gray-300 p-8 overflow-hidden">
          <CascadingText text="CONNECTING" isVisible={true} />
        </div>
      )}

      {appState === 'conversation' && (
        <div className="flex-1 flex flex-col p-6">
          {/* Timer */}
          <div className="text-center mb-4">
            <span className="text-sm text-gray-500 font-mono">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Transcript */}
          <div className="flex-1 bg-gray-800 rounded-lg p-4 mb-4 overflow-y-auto" style={{ maxHeight: '60vh' }}>
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
        </div>
      )}

      {appState === 'ended' && !showTranscript && (
        <div className="flex-1 bg-gray-300 p-8 overflow-hidden relative">
          <CascadingText text="CIAO FOR NOW" isVisible={true} />
          {messages.length > 0 && (
            <button
              onClick={() => setShowTranscript(true)}
              className="absolute bottom-8 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg bg-gray-800 text-white font-semibold hover:bg-gray-700"
            >
              VIEW TRANSCRIPT
            </button>
          )}
        </div>
      )}

      {appState === 'ended' && showTranscript && (
        <div className="flex-1 flex flex-col p-6">
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
          <div className="bg-gray-800 rounded-lg p-4 mb-4 flex-1 overflow-y-auto" style={{ maxHeight: '40vh' }}>
            <h3 className="text-sm text-gray-500 mb-3">Transcript</h3>
            <div className="space-y-2 text-sm">
              {messages.map(msg => (
                <p key={msg.id} className={msg.role === 'user' ? 'text-blue-400' : 'text-gray-300'}>
                  <strong>{msg.role === 'user' ? 'Jordan' : 'cA'}:</strong> {msg.text}
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
        </div>
      )}
    </div>
  );
}

export default App;
