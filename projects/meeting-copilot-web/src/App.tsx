import React, { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// Browser-native SpeechRecognition types
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

interface TranscriptSegment {
  id: string;
  text: string;
  isInterim: boolean;
  timestamp: Date;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

function App() {
  // Speech Recognition State
  const [isRecording, setIsRecording] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState("");

  // WebSocket State
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const recognitionRef = useRef<any>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "System initialized. I am Monica, an Einstein-level intelligence Copilot. I am actively analyzing this space. Ask for strategic insights, coding optimizations, or interview guidance.",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");

  const transcriptsEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom(transcriptsEndRef);
  }, [transcripts, interimText]);

  useEffect(() => {
    scrollToBottom(messagesEndRef);
  }, [messages]);

  // Connect WebSocket
  useEffect(() => {
    const connectWs = () => {
      const socket = new WebSocket('ws://localhost:8000/ws');

      socket.onopen = () => {
        setWsConnected(true);
        console.log('WebSocket Connected');
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'answer') {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            sender: 'assistant',
            text: data.text,
            timestamp: new Date()
          }]);
        } else if (data.type === 'error') {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            sender: 'assistant',
            text: `Error: ${data.text}`,
            timestamp: new Date()
          }]);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        console.log('WebSocket Disconnected. Reconnecting in 3s...');
        setTimeout(connectWs, 3000);
      };

      wsRef.current = socket;
    };

    connectWs();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      setInterimText(currentInterim);

      if (finalTranscript !== '') {
        const newSegment: TranscriptSegment = {
          id: Date.now().toString() + Math.random().toString(),
          text: finalTranscript,
          isInterim: false,
          timestamp: new Date()
        };

        setTranscripts(prev => [...prev, newSegment]);

        // Send final chunk to backend for context via WS
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'transcript',
            text: finalTranscript,
            isFinal: true
          }));
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);

      // Show error in the interim text so the user actually sees it
      setInterimText(`(Mic Error: ${event.error} - Are you using Chrome/Edge with permissions granted?)`);

      if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'network') {
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if we are still supposed to be recording
      if (isRecordingRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.error(e);
        }
      }
    };

    recognitionRef.current = recognition;

  }, []); // Remove isRecording dependency, use ref instead to avoid recreating the object constantly

  // Create a ref for isRecording so onend can read the latest value without dependency loops
  const isRecordingRef = useRef(isRecording);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const toggleRecording = () => {
    if (!SpeechRecognition) {
      alert("Your browser doesn't support Web Speech API. Please use Chrome or Edge.");
      return;
    }

    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {
        console.error(e);
      }
      setIsRecording(false);
      setInterimText("");
    } else {
      setTranscripts([]);
      setInterimText("(Requesting microphone access...)");
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
        setInterimText("");
      } catch (err) {
        console.error(err);
        setInterimText("(Failed to start microphone. Please check permissions.)");
        setIsRecording(false);
      }
    }
  };

  const sendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !wsConnected) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMsg]);
    setInputValue("");

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'question',
        text: newMsg.text
      }));
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">MC</div>
          <h1 className="app-title">Interactive Meeting Copilot</h1>
        </div>
        <div className="status-badge">
          <div className={`status-dot ${wsConnected ? 'active' : 'inactive'}`}></div>
          {wsConnected ? 'Backend Connected' : 'Connecting to API...'}
        </div>
      </header>

      <div className="layout-container">
        {/* Transcription Pane (Left) */}
        <div className="glass-panel transcription-pane">
          <div className="pane-header">
            <h2 className="pane-title">Live Transcription</h2>
            <div className="status-badge">
              <div className={`status-dot ${isRecording ? 'active' : 'inactive'}`}></div>
              {isRecording ? 'Listening...' : 'Standing By'}
            </div>
          </div>

          <div className="pane-content">
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <strong>Note on System Audio (Mac):</strong> The Browser's native Speech Recognition only listens to your default microphone. To transcribe other people speaking (laptop audio), you must install a free virtual audio cable like <strong>BlackHole</strong>, set your Mac's output to a Multi-Output Device (Speakers + BlackHole), and select BlackHole as your default Microphone input in Chrome.
            </div>
            {transcripts.length === 0 && !interimText && (
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>
                Click "Start Meeting" and speak to see live transcription.
              </div>
            )}
            {transcripts.map((segment) => (
              <div key={segment.id} className="transcript-bubble">
                {segment.text}
              </div>
            ))}
            {interimText && (
              <div className="transcript-bubble interim">
                {interimText}
              </div>
            )}
            <div ref={transcriptsEndRef} />
          </div>

          <div className="controls-bar">
            <button
              className={`record-btn ${isRecording ? 'recording' : ''}`}
              onClick={toggleRecording}
            >
              {isRecording ? 'Stop Meeting' : 'Start Meeting'}
            </button>
          </div>
        </div>

        {/* Copilot Chat Pane (Right) */}
        <div className="glass-panel copilot-pane">
          <div className="pane-header">
            <h2 className="pane-title">Monica (Copilot)</h2>
          </div>

          <div className="pane-content">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-container" onSubmit={sendMessage}>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask me anything about the meeting..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={!wsConnected}
            />
            <button type="submit" className="send-btn" disabled={!wsConnected}>
              ↑
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export default App;
