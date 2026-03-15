import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal, Bot, User, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import './AgentDispatch.css';

interface Message {
    id: string;
    sender: 'user' | 'agent';
    agentName?: string;
    text: string;
    timestamp: Date;
    status?: 'sending' | 'delivered' | 'read';
}

const INITIAL_MESSAGES: Message[] = [
    {
        id: '1',
        sender: 'agent',
        agentName: 'Orchestrator',
        text: 'AegisCorp Agentic Intelligence Mission Control initialized. All autonomous squads are standing by. How can I direct the operation today, Commander?',
        timestamp: new Date(Date.now() - 60000)
    }
];

export const AgentDispatch: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSend = async () => {
        if (!inputValue.trim() || isTyping) return;

        const userText = inputValue.trim();
        const newUserMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            text: userText,
            timestamp: new Date(),
            status: 'delivered'
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputValue('');
        setIsTyping(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent: 'monica', message: userText })
            });
            const data = await res.json();

            const newAgentMsg: Message = {
                id: (Date.now() + 1).toString(),
                sender: 'agent',
                agentName: 'Orchestrator',
                text: data.reply || (data.error ? `Error: ${data.error}` : 'No response generated.'),
                timestamp: new Date()
            };
            setMessages(prev => [...prev, newAgentMsg]);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown network error';
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                sender: 'agent',
                agentName: 'System',
                text: `Connection Error: ${errorMessage}`,
                timestamp: new Date()
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="agent-dispatch-container glass-panel">
            <div className="dispatch-header">
                <div className="dispatch-title">
                    <Terminal size={18} className="text-accent-primary" />
                    <h3>Agent Dispatch Terminal</h3>
                </div>
                <div className="dispatch-telemetry">
                    <span className="telemetry-badge active"><Activity size={12} /> Live Link</span>
                </div>
            </div>

            <div className="dispatch-messages">
                {messages.map(msg => (
                    <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
                        {msg.sender === 'agent' && (
                            <div className="message-avatar agent-avatar">
                                <Bot size={16} />
                            </div>
                        )}
                        <div className="message-content">
                            {msg.sender === 'agent' && <div className="message-sender-name">{msg.agentName}</div>}
                            <div className={`message-bubble ${msg.sender}`}>
                                {msg.text}
                            </div>
                            <div className="message-meta">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {msg.sender === 'user' && <CheckCircle2 size={12} className="msg-status-icon" />}
                            </div>
                        </div>
                        {msg.sender === 'user' && (
                            <div className="message-avatar user-avatar">
                                <User size={16} />
                            </div>
                        )}
                    </div>
                ))}

                {isTyping && (
                    <div className="message-wrapper agent">
                        <div className="message-avatar agent-avatar">
                            <Bot size={16} />
                        </div>
                        <div className="message-content">
                            <div className="message-sender-name">Orchestrator</div>
                            <div className="message-bubble typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="dispatch-input-area">
                <div className="input-prefix"><ChevronRight size={18} /></div>
                <textarea
                    className="dispatch-input"
                    placeholder="Dispatch instruction to squads..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                />
                <button
                    className="btn-send"
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                >
                    <Send size={18} />
                </button>
            </div>
        </div>
    );
};
