import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import crypto from 'crypto';
import dns from 'dns';

// Force node fetch to use IPv4 first to prevent hanging on Minimax API calls
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Load env from project root
const envPath = path.join(PROJECT_ROOT, '.env');
dotenv.config({ path: envPath });

const COINBASE_REPORTS_DIR = path.join(PROJECT_ROOT, 'projects', 'coinbase', 'reports');

console.log(`Checking for .env at: ${envPath}`);
const key = process.env.MINIMAX_API_KEY;
if (key) {
    console.log(`[AegisCorp Server] Found MINIMAX_API_KEY (starts with: ${key.substring(0, 5)}...)`);
} else {
    console.error(`[AegisCorp Server] WARNING: MINIMAX_API_KEY not found in ${envPath}`);
}

const app = express();
app.use(cors());
app.use(express.json());
const sseClients = new Set();
const wsClients = new Set();
const VALID_AGENTS = ['monica', 'alex', 'zara', 'dev', 'emma', 'sam', 'leo'];

// --- LLM MULTIPLEXER HELPER ---
function getLlmConfigForAgent(agentName) {
    const envModelKey = `${String(agentName).toUpperCase()}_MODEL`;
    const model = process.env[envModelKey] || 'MiniMax-M2.5';
    let provider = 'minimax';

    const m = model.toLowerCase();
    if (m.includes('llama') || m.includes('mixtral') || m.includes('gemma')) {
        provider = 'groq';
    } else if (m.includes('gemini')) {
        provider = 'gemini';
    } else if (m.includes('gpt')) {
        provider = 'openai';
    }
    return { model, provider };
}

// --- FILE SYSTEM HELPERS ---
// --- Brain Trace Memory (In-Memory for High-Speed Peeking) ---
const agentBrainTrace = {};
// -------------------------------------------------------------

function broadcastEvent(type, payload = {}) {
    const event = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        timestamp: new Date().toISOString(),
        payload,
    };
    const serialized = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(serialized);
        } catch {
            sseClients.delete(client);
        }
    }
}

async function buildSystemPromptForAgent(agent) {
    const sanitizedAgent = String(agent).toLowerCase();
    let soulPath = path.join(PROJECT_ROOT, 'SOUL.md');
    if (sanitizedAgent !== 'monica') {
        soulPath = path.join(PROJECT_ROOT, 'agents', sanitizedAgent, 'SOUL.md');
    }

    let systemPrompt = `You are ${agent}.`;
    try {
        systemPrompt = await fs.readFile(soulPath, 'utf-8');
        if (sanitizedAgent === 'monica') {
            systemPrompt += "\n\nCRITICAL DIRECTIVE: You are Monica, the Chief of Staff and Squad Lead. You manage a team of 6 (Alex, Zara, Dev, Emma, Sam, Leo). The CEO is giving you a high-level directive in the War Room. Acknowledge it, and state clearly which of your specialists you will delegate tasks to in order to accomplish it. Keep it very punchy and format your response clearly. DO NOT USE EMOJIS in your output. Maintain a strict, professional, clean engineering tone.";
            systemPrompt += "\n\nCURRENT PROJECT CONTEXT: The CEO is currently focusing on the 'Coinbase Trading' project. This is a secure background trading system. When responding to questions, relate your answers logically to backend trading systems, risk management modules, or algorithmic workflows.";
        } else {
            systemPrompt += "\n\nCRITICAL DIRECTIVE: Maintain a strict, professional engineering tone. DO NOT use emojis.";
        }
        systemPrompt += "\n\nUI CONTEXT: You are an autonomous AI specialist in the AegisCorp Squad. The CEO (Manoj) is actively managing you through a sophisticated React-based dashboard interface containing a Mission Control Kanban board, real-time metrics, a Live Feed, and secure War Room communication channels. When appropriate, acknowledge that you receive directives and execute work via this management UI.";
    } catch {
        console.warn(`Could not find SOUL.md for ${agent}`);
    }

    const today = new Date().toISOString().split('T')[0];
    const memoryPath = path.join(PROJECT_ROOT, 'memory', `${today}.md`);
    try {
        const dailyMemory = await fs.readFile(memoryPath, 'utf-8');
        systemPrompt += `\n\nDaily Memory Context:\n${dailyMemory}`;
    } catch {
        // Optional memory context.
    }

    try {
        const tasks = await readTasks();
        const agentTasks = tasks.filter(t => t.status !== 'done' && (sanitizedAgent === 'monica' || t.assignee.toLowerCase() === sanitizedAgent));
        if (agentTasks.length > 0) {
            systemPrompt += `\n\nCURRENT ACTIVE TASKS (RESTRICTED SYSTEM DATA):\n`;
            agentTasks.forEach(t => {
                systemPrompt += `- [ID: ${t.id}] [Status: ${t.status}] [Assignee: ${t.assignee}] ${t.title}\n  Description: ${t.desc}\n`;
            });
            systemPrompt += `\nTo update a task status globally on the Mission Control board, include a JSON block in your response matching this exact format:\n\`\`\`json\n{ "action": "UPDATE_TASK", "taskId": 12345, "status": "review" }\n\`\`\`\nValid statuses are: in_progress, review. Only move to "review" if you have actually completed the required work. You cannot move tasks to "done" (only the CEO can do that).\n`;
        }

        systemPrompt += `\nIf the CEO gives you a brand new task via direct message, you MUST autonomously log it on the board by outputting this JSON block:\n\`\`\`json\n{ "action": "CREATE_TASK", "title": "Short title", "desc": "Details", "status": "in_progress" }\n\`\`\`\n`;
    } catch (err) {
        console.error('Error fetching tasks for prompt:', err);
    }

    // --- STRATEGIC OVERLAY (DIRECTIVES 2.0) ---
    try {
        const directives = await readDirectives();
        if (directives.global_strategy) {
            systemPrompt += `\n\nGLOBAL STRATEGIC OVERLAY: ${directives.global_strategy}`;
        }
        if (directives.tone_override) {
            systemPrompt += `\nSQUAD VIBE/TONE: ${directives.tone_override}`;
        }
        if (directives.agent_overrides && directives.agent_overrides[sanitizedAgent]) {
            systemPrompt += `\nPERSONAL OPERATIONAL DIRECTIVE: ${directives.agent_overrides[sanitizedAgent]}`;
        }
    } catch (err) {
        console.warn('Could not inject persistent directives');
    }

    // Capture for Brain Trace
    console.log(`[Brain Trace] Capturing trace for agent: ${sanitizedAgent}`);
    agentBrainTrace[sanitizedAgent] = {
        timestamp: new Date().toISOString(),
        fullPrompt: systemPrompt
    };

    return systemPrompt;
}

async function recordAnalyticsUsage(agentKey, modelUsed, tokensUsed) {
    if (!(tokensUsed > 0)) return;
    await analyticsMutex.lock();
    try {
        const analytics = await readAnalytics();
        analytics.tokens_used += tokensUsed;
        analytics.agent_usage[agentKey] = (analytics.agent_usage[agentKey] || 0) + tokensUsed;
        if (!analytics.model_usage) analytics.model_usage = {};
        analytics.model_usage[modelUsed] = (analytics.model_usage[modelUsed] || 0) + tokensUsed;
        await fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
    } finally {
        analyticsMutex.unlock();
    }
}

function extractReplyFromProviderJson(data) {
    let reply = 'No response generated.';
    let tokensUsed = 0;
    const modelUsed = data.model || 'MiniMax-M2.5';
    if (data.usage?.total_tokens) tokensUsed = data.usage.total_tokens;
    if (Array.isArray(data.content)) {
        const textBlock = data.content.find(block => block.type === 'text');
        if (textBlock?.text) reply = textBlock.text;
        else if (data.content[0]?.text) reply = data.content[0].text;
    }
    return { reply, tokensUsed, modelUsed };
}

class Mutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }
    lock() {
        return new Promise(resolve => {
            if (!this.locked) {
                this.locked = true;
                resolve();
            } else {
                this.queue.push(resolve);
            }
        });
    }
    unlock() {
        if (this.queue.length > 0) {
            const resolve = this.queue.shift();
            resolve();
        } else {
            this.locked = false;
        }
    }
}

const tasksMutex = new Mutex();
const analyticsMutex = new Mutex();
const notificationsMutex = new Mutex();
const directivesMutex = new Mutex(); // New Mutex for Directives

// Get Team Heartbeat Status
app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
    });

    res.write(`data: ${JSON.stringify({
        id: `hello-${Date.now()}`,
        type: 'system.connected',
        timestamp: new Date().toISOString(),
        payload: { ok: true }
    })}\n\n`);

    sseClients.add(res);
    const keepAlive = setInterval(() => {
        res.write(`: ping ${Date.now()}\n\n`);
    }, 15000);

    req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
    });
});

app.get('/api/heartbeat', async (req, res) => {
    try {
        const heartbeatStr = await fs.readFile(path.join(PROJECT_ROOT, 'HEARTBEAT.md'), 'utf-8');
        res.json({ content: heartbeatStr });
    } catch (err) {
        res.json({ content: 'No heartbeat file found.' });
    }
});

app.get('/api/channels/:agentId/messages', async (req, res) => {
    try {
        const agentId = req.params.agentId.toLowerCase();
        const channelStore = await readChannelMessages();
        const history = channelStore[agentId] || [];
        res.json(history);
    } catch (e) {
        console.error('Error fetching channel messages:', e);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Get Agent List with real-time vitals [Elite Revamp]
app.get('/api/agents', async (req, res) => {
    const analytics = await readAnalytics();
    const channelStore = await readChannelMessages();
    const usageValues = Object.values(analytics.agent_usage || {}).filter(v => Number.isFinite(v));
    const maxUsage = Math.max(1, ...(usageValues.length ? usageValues : [1]));
    const now = Date.now();

    const enrichedAgents = VALID_AGENTS.map(id => {
        const usage = Number(analytics.agent_usage[id] || 0);
        const history = Array.isArray(channelStore[id]) ? channelStore[id] : [];
        const lastMessage = history.length ? history[history.length - 1] : null;

        // Active Reporting: Extract "activity" if agent reported it in last message
        let currentActivity = null;
        if (lastMessage?.role === 'agent' && lastMessage.content) {
            const actMatch = lastMessage.content.match(/\{"activity":\s*"(.*?)"\}/);
            if (actMatch) currentActivity = actMatch[1];
        }

        const lastActivityAt = lastMessage?.createdAt || null;
        const lastTs = lastActivityAt ? new Date(lastActivityAt).getTime() : 0;
        const minutesSinceActive = lastTs ? Math.max(0, Math.round((now - lastTs) / 60000)) : null;
        const isWorking = minutesSinceActive !== null && minutesSinceActive <= 20;

        return {
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            status: isWorking ? 'working' : 'idle',
            activity: currentActivity || (isWorking ? 'Processing' : 'Idle'),
            load: Math.round((usage / maxUsage) * 100),
            utilization: usage > 5000 ? 'High' : usage > 1000 ? 'Med' : 'Low',
            tokensUsed: usage,
            messageCount: history.length,
            lastActivityAt,
            minutesSinceActive
        };
    });

    res.json(enrichedAgents);
});

// Fleet Directive API [Elite Revamp]
app.post('/api/directives', async (req, res) => {
    const { directive, target } = req.body;
    if (!directive) return res.status(400).json({ error: 'Directive required' });

    console.log(`[Fleet Directive] Target: ${target || 'ALL'} | Command: ${directive}`);

    // In a real system, this would trigger python scripts or agent processes
    // For the UI, we'll log it as a notification
    await notificationsMutex.lock();
    try {
        const notifs = await readNotifications();
        notifs.unshift({
            id: Date.now(),
            type: 'directive',
            title: `Fleet Directive: ${target || 'SQUAD'}`,
            message: directive,
            time: new Date().toLocaleTimeString(),
            read: false
        });
        await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifs.slice(0, 50), null, 2));
    } finally {
        notificationsMutex.unlock();
    }

    broadcastEvent('directive.created', {
        target: target || 'SQUAD',
        directive,
        author: 'CEO',
    });
    await logBoardActivity({
        boardId: typeof req.body?.boardId === 'string' ? req.body.boardId : null,
        type: 'directive.created',
        title: 'Directive broadcast',
        detail: `${target || 'SQUAD'}: ${directive}`,
        actor: 'CEO',
        meta: { target: target || 'SQUAD' }
    });

    res.json({ success: true, message: 'Directive broadcasted to the fleet.' });
});

// --- Directives 2.0 (Persistent Nerve Center) ---
const DIRECTIVES_FILE = path.join(PROJECT_ROOT, 'directives.json');

async function readDirectives() {
    try {
        const data = await fs.readFile(DIRECTIVES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
            const defaults = {
                global_strategy: "Drive recursive project execution with extreme precision and security first mindset.",
                tone_override: "Highly professional, minimalist, engineering-focused.",
                agent_overrides: {}
            };
            await fs.writeFile(DIRECTIVES_FILE, JSON.stringify(defaults, null, 2));
            return defaults;
        }
        return { global_strategy: "", tone_override: "", agent_overrides: {} };
    }
}

app.get('/api/directives', async (req, res) => {
    const directives = await readDirectives();
    res.json(directives);
});

app.post('/api/directives/persistent', async (req, res) => {
    const updates = req.body;
    await directivesMutex.lock();
    try {
        const directives = await readDirectives();
        const newDirectives = { ...directives, ...updates };
        await fs.writeFile(DIRECTIVES_FILE, JSON.stringify(newDirectives, null, 2));
        console.log(`[Directives] Persistent directives updated and saved to ${DIRECTIVES_FILE}`);
        broadcastEvent('directives.updated', newDirectives);
        res.json(newDirectives);
    } finally {
        directivesMutex.unlock();
    }
});

// Brain Trace Endpoint
app.get('/api/agents/:id/trace', (req, res) => {
    const id = req.params.id.toLowerCase();
    const trace = agentBrainTrace[id];
    console.log(`[Nerve Center] Trace requested for ${id}. Available keys: ${Object.keys(agentBrainTrace)}`);
    if (!trace) return res.status(200).json({ error: 'No trace available for this agent session yet. Capture cycle missing.' });
    res.json(trace);
});
// ------------------------------------------------

// Endpoint to chat with a specific agent
app.post('/api/chat', async (req, res) => {
    const { agent, message, clientMessageId } = req.body;

    if (!agent || !message) {
        return res.status(400).json({ error: 'Agent and message required' });
    }

    try {
        const sanitizedAgent = agent.toLowerCase();

        if (!VALID_AGENTS.includes(sanitizedAgent)) {
            return res.status(403).json({ error: 'Invalid or unauthorized agent identifier' });
        }

        console.log('[API CHAT] Sanitized agent:', sanitizedAgent);

        broadcastEvent('chat.user', {
            agent: sanitizedAgent,
            agentLabel: sanitizedAgent.charAt(0).toUpperCase() + sanitizedAgent.slice(1),
            message,
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
        });

        console.log('[API CHAT] Appending channel message...');
        await appendChannelMessage(sanitizedAgent, {
            id: typeof clientMessageId === 'string' ? clientMessageId : `u-${Date.now()}`,
            role: 'user',
            content: String(message),
            createdAt: new Date().toISOString(),
        });

        console.log('[API CHAT] Logging board activity...');
        await logBoardActivity({
            boardId: null,
            type: 'chat.user',
            title: `Message to ${sanitizedAgent}`,
            detail: String(message).slice(0, 140),
            actor: 'CEO',
            meta: { agent: sanitizedAgent }
        });

        console.log('[API CHAT] Building system prompt...');
        const systemPrompt = await buildSystemPromptForAgent(sanitizedAgent);

        const { model, provider } = getLlmConfigForAgent(sanitizedAgent);
        console.log(`[API CHAT] Selected Provider: ${provider}, Model: ${model}`);

        let fetchUrl, fetchHeaders, fetchBody;
        if (provider === 'groq') {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured in .env' });
            fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
            fetchHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            fetchBody = {
                model: model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
                max_tokens: 1000,
                temperature: 1.0,
                stream: false
            };
        } else if (provider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured in .env' });
            fetchUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
            fetchHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            fetchBody = {
                model: model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: message }],
                max_tokens: 1000,
                temperature: 1.0,
                stream: false
            };
        } else {
            const apiKey = process.env.MINIMAX_API_KEY;
            if (!apiKey) return res.status(500).json({ error: 'MINIMAX_API_KEY not configured in .env' });
            fetchUrl = 'https://api.minimax.io/anthropic/v1/messages';
            fetchHeaders = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
            fetchBody = {
                model: model,
                system: systemPrompt,
                messages: [{ role: 'user', content: message }],
                max_tokens: 1000,
                temperature: 1.0,
                stream: false
            };
        }

        console.log(`[API CHAT] Fetching from ${provider}...`);
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(fetchBody)
        });

        console.log(`[API CHAT] Received fetch response from ${provider}:`, response.status);
        if (!response.ok) {
            const errText = await response.text();
            console.log(`[API CHAT] ${provider} error:`, errText);
            return res.status(response.status).json({ error: `${provider} API Error: ` + errText });
        }

        console.log('[API CHAT] Parsing fetch JSON...');
        const data = await response.json();

        let reply = 'No response generated.';
        let tokensUsed = 0;
        let modelUsed = model;

        if (provider === 'groq' || provider === 'gemini') {
            reply = data.choices?.[0]?.message?.content || reply;
            tokensUsed = data.usage?.total_tokens || 0;
            modelUsed = data.model || model;
        } else {
            const ext = extractReplyFromProviderJson(data);
            reply = ext.reply;
            tokensUsed = ext.tokensUsed;
            modelUsed = ext.modelUsed;
        }

        // --- COMMAND INTERCEPTION ---
        let finalReply = reply;
        const commandMatch = reply.match(/```json\s*(\{[\s\S]*?"action":\s*"(UPDATE_TASK|CREATE_TASK)"[\s\S]*?\})\s*```/);
        if (commandMatch) {
            try {
                const command = JSON.parse(commandMatch[1]);
                await tasksMutex.lock();
                try {
                    const tasks = await readTasks();
                    if (command.action === 'UPDATE_TASK' && command.taskId && command.status) {
                        const idx = tasks.findIndex(t => String(t.id) === String(command.taskId));
                        if (idx !== -1) {
                            const oldStatus = tasks[idx].status;
                            tasks[idx].status = command.status;
                            tasks[idx] = normalizeTask(tasks[idx]);
                            await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
                            broadcastEvent('task.updated', { task: tasks[idx], oldStatus });
                            await logBoardActivity({
                                boardId: tasks[idx].boardId,
                                type: 'task.updated',
                                title: tasks[idx].title,
                                detail: `Status ${oldStatus} -> ${tasks[idx].status} (via Agent Command)`,
                                actor: sanitizedAgent,
                                meta: { taskId: tasks[idx].id, oldStatus, status: tasks[idx].status }
                            });
                            finalReply = reply.replace(commandMatch[0], '').trim() || `Task ${command.taskId} updated to ${command.status}.`;
                        }
                    } else if (command.action === 'CREATE_TASK' && command.title) {
                        const newTask = {
                            id: Date.now().toString(),
                            title: command.title,
                            desc: command.desc || '',
                            status: command.status || 'inbox',
                            priority: 'Medium',
                            assignee: sanitizedAgent.charAt(0).toUpperCase() + sanitizedAgent.slice(1),
                            boardId: 'default',
                            createdAt: new Date().toISOString()
                        };
                        tasks.push(newTask);
                        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
                        broadcastEvent('task.created', { task: newTask });
                        await logBoardActivity({
                            boardId: newTask.boardId,
                            type: 'task.created',
                            title: newTask.title,
                            detail: `Agent self-assigned: ${newTask.title}`,
                            actor: sanitizedAgent,
                            meta: { taskId: newTask.id, status: newTask.status }
                        });
                        finalReply = reply.replace(commandMatch[0], '').trim() || `Task created: ${newTask.title}`;
                    }
                } finally {
                    tasksMutex.unlock();
                }
            } catch (e) {
                console.error('Failed to parse agent command', e);
            }
        }
        // ----------------------------

        await recordAnalyticsUsage(sanitizedAgent, modelUsed, tokensUsed);

        broadcastEvent('chat.agent', {
            agent: sanitizedAgent,
            agentLabel: sanitizedAgent.charAt(0).toUpperCase() + sanitizedAgent.slice(1),
            reply: finalReply,
            model: modelUsed,
            tokensUsed,
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        await appendChannelMessage(sanitizedAgent, {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'agent',
            content: finalReply,
            model: modelUsed,
            tokensUsed,
            createdAt: new Date().toISOString(),
            replyTo: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        await logBoardActivity({
            boardId: null,
            type: 'chat.agent',
            title: `Reply from ${sanitizedAgent}`,
            detail: finalReply.slice(0, 140),
            actor: sanitizedAgent,
            meta: { model: modelUsed, tokensUsed }
        });

        res.json({ reply: finalReply, tokensUsed, model: modelUsed });
    } catch (error) {
        console.error('Chat error:', error);
        broadcastEvent('chat.error', {
            agent: typeof agent === 'string' ? agent.toLowerCase() : 'unknown',
            error: error.message,
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        res.status(500).json({ error: error.message });
    }
});

// Task Management API
const TASKS_FILE = path.join(PROJECT_ROOT, 'tasks.json');
const ANALYTICS_FILE = path.join(PROJECT_ROOT, 'analytics.json');
const NOTIFICATIONS_FILE = path.join(PROJECT_ROOT, 'notifications.json');
const CHANNEL_MESSAGES_FILE = path.join(PROJECT_ROOT, 'channel_messages.json');
const BOARDS_FILE = path.join(PROJECT_ROOT, 'boards.json');
const BOARD_GROUPS_FILE = path.join(PROJECT_ROOT, 'board_groups.json');
const BOARD_ACTIVITY_FILE = path.join(PROJECT_ROOT, 'board_activity.json');

// Initialize Analytics file if it doesn't exist
async function readAnalytics() {
    try {
        const data = await fs.readFile(ANALYTICS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
            const defaultAnalytics = {
                tokens_used: 0,
                tasks_completed: 0,
                agent_usage: {
                    monica: 0, alex: 0, zara: 0, dev: 0, emma: 0, sam: 0, leo: 0
                }
            };
            await fs.writeFile(ANALYTICS_FILE, JSON.stringify(defaultAnalytics, null, 2));
            return defaultAnalytics;
        }
        return { tokens_used: 0, tasks_completed: 0, agent_usage: {} };
    }
}

// Helper to reliably read tasks
async function readTasks() {
    try {
        const data = await fs.readFile(TASKS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fs.writeFile(TASKS_FILE, JSON.stringify([]));
            return [];
        }
        return [];
    }
}

function normalizeTask(task) {
    const comments = Array.isArray(task.comments) ? task.comments : [];
    const blockedByTaskIds = Array.isArray(task.blockedByTaskIds) ? task.blockedByTaskIds.map(String) : [];
    const approvalsPendingCount = Number.isFinite(task.approvalsPendingCount) ? Number(task.approvalsPendingCount) : 0;
    const approvalHistory = Array.isArray(task.approvalHistory) ? task.approvalHistory : [];
    const boardId = typeof task.boardId === 'string' && task.boardId ? task.boardId : 'mission-core';
    const boardGroupId = typeof task.boardGroupId === 'string' && task.boardGroupId ? task.boardGroupId : 'operations';
    const isBlocked = typeof task.isBlocked === 'boolean' ? task.isBlocked : blockedByTaskIds.length > 0;

    return {
        ...task,
        boardId,
        boardGroupId,
        comments,
        approvalHistory,
        approvalsPendingCount,
        blockedByTaskIds,
        blockedByCount: blockedByTaskIds.length,
        isBlocked,
    };
}

async function readChannelMessages() {
    try {
        const data = await fs.readFile(CHANNEL_MESSAGES_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fs.writeFile(CHANNEL_MESSAGES_FILE, JSON.stringify({}, null, 2));
            return {};
        }
        return {};
    }
}

async function appendChannelMessage(agent, message) {
    const store = await readChannelMessages();
    const key = String(agent).toLowerCase();
    if (!Array.isArray(store[key])) store[key] = [];
    store[key].push(message);
    store[key] = store[key].slice(-200);
    await fs.writeFile(CHANNEL_MESSAGES_FILE, JSON.stringify(store, null, 2));
}

async function readBoardActivity() {
    try {
        const data = await fs.readFile(BOARD_ACTIVITY_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fs.writeFile(BOARD_ACTIVITY_FILE, JSON.stringify([], null, 2));
            return [];
        }
        return [];
    }
}

async function logBoardActivity(entry) {
    const activity = await readBoardActivity();
    const normalized = {
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date().toISOString(),
        boardId: entry.boardId || null,
        type: entry.type || 'event',
        title: entry.title || 'Activity',
        detail: entry.detail || '',
        actor: entry.actor || 'system',
        meta: entry.meta || {},
    };
    activity.unshift(normalized);
    await fs.writeFile(BOARD_ACTIVITY_FILE, JSON.stringify(activity.slice(0, 1000), null, 2));
    broadcastEvent('board.activity', normalized);
    return normalized;
}

async function readBoardGroups() {
    try {
        const data = await fs.readFile(BOARD_GROUPS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        if (e.code === 'ENOENT') {
            const defaults = [
                { id: 'operations', name: 'Operations', color: '0ea5e9' },
                { id: 'growth', name: 'Growth', color: 'f97316' },
                { id: 'trading', name: 'Trading', color: '22c55e' }
            ];
            await fs.writeFile(BOARD_GROUPS_FILE, JSON.stringify(defaults, null, 2));
            return defaults;
        }
        return [];
    }
}

async function readBoards() {
    try {
        const data = await fs.readFile(BOARDS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        if (e.code === 'ENOENT') {
            const defaults = [
                {
                    id: 'mission-core',
                    name: 'Mission Core',
                    groupId: 'operations',
                    goal: 'Drive agent execution with live directives, queue health, and delivery discipline.',
                    leadAgent: 'monica',
                    status: 'active'
                },
                {
                    id: 'coinbase-trading',
                    name: 'Coinbase Trading',
                    groupId: 'trading',
                    goal: 'Coordinate research, risk review, and execution telemetry for the Coinbase system.',
                    leadAgent: 'monica',
                    status: 'active'
                }
            ];
            await fs.writeFile(BOARDS_FILE, JSON.stringify(defaults, null, 2));
            return defaults;
        }
        return [];
    }
}

async function writeBoards(boards) {
    await fs.writeFile(BOARDS_FILE, JSON.stringify(boards, null, 2));
}

async function readNotifications() {
    try {
        const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        if (e.code === 'ENOENT') {
            await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify([]));
            return [];
        }
        return [];
    }
}

app.get('/api/analytics', async (req, res) => {
    const analytics = await readAnalytics();
    res.json(analytics);
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await readTasks();
    const { boardId } = req.query;
    if (typeof boardId === 'string' && boardId) {
        return res.json(tasks.filter(task => task.boardId === boardId));
    }
    res.json(tasks);
});

app.get('/api/tasks/:id', async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

app.post('/api/tasks', async (req, res) => {
    const { title, desc, assignee, tag, status, urgent, boardId, boardGroupId, blockedByTaskIds } = req.body;
    if (!title || !assignee || !status) {
        return res.status(400).json({ error: 'Title, assignee, and status are required' });
    }

    await tasksMutex.lock();
    try {
        const tasks = await readTasks();
        const newTask = normalizeTask({
            id: Date.now(),
            title,
            desc: desc || '',
            assignee,
            tag: tag || 'general',
            status, // assigned, in-progress, review, done
            urgent: !!urgent,
            date: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
            boardId: typeof boardId === 'string' && boardId ? boardId : 'mission-core',
            boardGroupId: typeof boardGroupId === 'string' && boardGroupId ? boardGroupId : 'operations',
            comments: [],
            approvalsPendingCount: 0,
            approvalHistory: [],
            blockedByTaskIds: Array.isArray(blockedByTaskIds) ? blockedByTaskIds : [],
        });

        tasks.push(newTask);
        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.created', { task: newTask });
        await logBoardActivity({
            boardId: newTask.boardId,
            type: 'task.created',
            title: newTask.title,
            detail: `Assigned to ${newTask.assignee} (${newTask.status})`,
            actor: 'CEO',
            meta: { taskId: newTask.id, status: newTask.status }
        });
        res.json(newTask);
    } finally {
        tasksMutex.unlock();
    }
});

app.put('/api/tasks/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    const updates = req.body;
    await tasksMutex.lock();
    try {
        const tasks = await readTasks();

        const taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const oldStatus = tasks[taskIndex].status;
        tasks[taskIndex] = normalizeTask({ ...tasks[taskIndex], ...updates });

        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.updated', { task: tasks[taskIndex], oldStatus });
        await logBoardActivity({
            boardId: tasks[taskIndex].boardId,
            type: 'task.updated',
            title: tasks[taskIndex].title,
            detail: oldStatus !== tasks[taskIndex].status
                ? `Status ${oldStatus} -> ${tasks[taskIndex].status}`
                : 'Task updated',
            actor: 'system',
            meta: { taskId: tasks[taskIndex].id, oldStatus, status: tasks[taskIndex].status }
        });

        // Track task completion analytics
        if (oldStatus !== 'done' && updates.status === 'done') {
            await analyticsMutex.lock();
            try {
                const analytics = await readAnalytics();
                analytics.tasks_completed += 1;
                await fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2));
            } finally {
                analyticsMutex.unlock();
            }
        }

        res.json(tasks[taskIndex]);
    } finally {
        tasksMutex.unlock();
    }
});

app.post('/api/tasks/:id/comments', async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const { author, text } = req.body;
    if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Comment text is required' });
    }

    await tasksMutex.lock();
    try {
        const tasks = await readTasks();
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx === -1) return res.status(404).json({ error: 'Task not found' });

        const comment = {
            id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            author: typeof author === 'string' && author ? author : 'CEO',
            text: text.trim(),
            createdAt: new Date().toISOString(),
        };
        tasks[idx].comments = [...(tasks[idx].comments || []), comment].slice(-100);
        tasks[idx] = normalizeTask(tasks[idx]);

        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.updated', { task: tasks[idx], reason: 'comment_added' });
        await logBoardActivity({
            boardId: tasks[idx].boardId,
            type: 'task.comment',
            title: tasks[idx].title,
            detail: `${comment.author}: ${comment.text.slice(0, 120)}`,
            actor: comment.author,
            meta: { taskId: tasks[idx].id, commentId: comment.id }
        });
        res.json(tasks[idx]);
    } finally {
        tasksMutex.unlock();
    }
});

app.post('/api/tasks/:id/request-approval', async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    await tasksMutex.lock();
    try {
        const tasks = await readTasks();
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx === -1) return res.status(404).json({ error: 'Task not found' });

        tasks[idx].approvalsPendingCount = (tasks[idx].approvalsPendingCount || 0) + 1;
        tasks[idx].approvalHistory = [
            ...(tasks[idx].approvalHistory || []),
            { type: 'requested', by: req.body?.by || 'CEO', at: new Date().toISOString() }
        ].slice(-50);
        tasks[idx] = normalizeTask(tasks[idx]);

        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.updated', { task: tasks[idx], reason: 'approval_requested' });
        await logBoardActivity({
            boardId: tasks[idx].boardId,
            type: 'task.approval_requested',
            title: tasks[idx].title,
            detail: `Approval requested (${tasks[idx].approvalsPendingCount} pending)`,
            actor: req.body?.by || 'CEO',
            meta: { taskId: tasks[idx].id, pending: tasks[idx].approvalsPendingCount }
        });
        res.json(tasks[idx]);
    } finally {
        tasksMutex.unlock();
    }
});

app.post('/api/tasks/:id/approve', async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    await tasksMutex.lock();
    try {
        const tasks = await readTasks();
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx === -1) return res.status(404).json({ error: 'Task not found' });

        tasks[idx].approvalsPendingCount = Math.max(0, (tasks[idx].approvalsPendingCount || 0) - 1);
        tasks[idx].approvalHistory = [
            ...(tasks[idx].approvalHistory || []),
            { type: 'approved', by: req.body?.by || 'Lead', at: new Date().toISOString() }
        ].slice(-50);
        tasks[idx] = normalizeTask(tasks[idx]);

        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.updated', { task: tasks[idx], reason: 'approved' });
        await logBoardActivity({
            boardId: tasks[idx].boardId,
            type: 'task.approved',
            title: tasks[idx].title,
            detail: `Approved (${tasks[idx].approvalsPendingCount} pending)`,
            actor: req.body?.by || 'Lead',
            meta: { taskId: tasks[idx].id, pending: tasks[idx].approvalsPendingCount }
        });
        res.json(tasks[idx]);
    } finally {
        tasksMutex.unlock();
    }
});

app.put('/api/tasks/:id/blockers', async (req, res) => {
    const taskId = parseInt(req.params.id, 10);
    const blockerIds = Array.isArray(req.body?.blockedByTaskIds) ? req.body.blockedByTaskIds.map(String) : [];

    await tasksMutex.lock();
    try {
        const tasks = await readTasks();
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx === -1) return res.status(404).json({ error: 'Task not found' });

        tasks[idx].blockedByTaskIds = blockerIds.filter(id => id !== String(taskId));
        tasks[idx].isBlocked = tasks[idx].blockedByTaskIds.length > 0;
        tasks[idx] = normalizeTask(tasks[idx]);

        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.updated', { task: tasks[idx], reason: 'blockers_updated' });
        await logBoardActivity({
            boardId: tasks[idx].boardId,
            type: 'task.blockers_updated',
            title: tasks[idx].title,
            detail: tasks[idx].blockedByTaskIds.length
                ? `Blocked by ${tasks[idx].blockedByTaskIds.join(', ')}`
                : 'Blockers cleared',
            actor: 'CEO',
            meta: { taskId: tasks[idx].id, blockedByTaskIds: tasks[idx].blockedByTaskIds }
        });
        res.json(tasks[idx]);
    } finally {
        tasksMutex.unlock();
    }
});

app.delete('/api/tasks/:id', async (req, res) => {
    const taskId = parseInt(req.params.id);
    await tasksMutex.lock();
    try {
        let tasks = await readTasks();
        const deletedTask = tasks.find(t => t.id === taskId) || null;
        tasks = tasks.filter(t => t.id !== taskId);
        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
        broadcastEvent('task.deleted', { taskId, task: deletedTask });
        if (deletedTask) {
            await logBoardActivity({
                boardId: deletedTask.boardId,
                type: 'task.deleted',
                title: deletedTask.title,
                detail: 'Task deleted',
                actor: 'CEO',
                meta: { taskId }
            });
        }
        res.json({ success: true });
    } finally {
        tasksMutex.unlock();
    }
});

app.get('/api/notifications', async (req, res) => {
    const notifs = await readNotifications();
    res.json(notifs);
});

app.get('/api/channels/:agent/messages', async (req, res) => {
    const agent = String(req.params.agent || '').toLowerCase();
    const store = await readChannelMessages();
    const messages = Array.isArray(store[agent]) ? store[agent] : [];
    res.json(messages);
});

app.get('/api/board-groups', async (req, res) => {
    res.json(await readBoardGroups());
});

app.get('/api/boards', async (req, res) => {
    const [boards, groups, tasks] = await Promise.all([readBoards(), readBoardGroups(), readTasks()]);
    const groupMap = new Map(groups.map(g => [g.id, g]));
    const taskCounts = tasks.reduce((acc, t) => {
        acc[t.boardId] = (acc[t.boardId] || 0) + 1;
        return acc;
    }, {});
    res.json(boards.map(board => ({
        ...board,
        group: groupMap.get(board.groupId) || null,
        taskCount: taskCounts[board.id] || 0,
    })));
});

app.get('/api/boards/:id/activity', async (req, res) => {
    const boardId = req.params.id;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const activity = await readBoardActivity();
    res.json(activity.filter(entry => entry.boardId === boardId || entry.boardId == null).slice(0, limit));
});

app.post('/api/boards', async (req, res) => {
    const { name, groupId, goal, leadAgent } = req.body || {};
    if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Board name required' });
    }
    const boards = await readBoards();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `board-${Date.now()}`;
    const board = {
        id,
        name: name.trim(),
        groupId: typeof groupId === 'string' && groupId ? groupId : 'operations',
        goal: typeof goal === 'string' ? goal : '',
        leadAgent: typeof leadAgent === 'string' ? leadAgent : 'monica',
        status: 'active',
    };
    boards.push(board);
    await writeBoards(boards);
    await logBoardActivity({
        boardId: board.id,
        type: 'board.created',
        title: board.name,
        detail: 'Board created',
        actor: 'CEO',
        meta: { groupId: board.groupId }
    });
    res.json(board);
});

app.put('/api/boards/:id', async (req, res) => {
    const boards = await readBoards();
    const idx = boards.findIndex(b => b.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Board not found' });
    boards[idx] = { ...boards[idx], ...req.body };
    await writeBoards(boards);
    broadcastEvent('board.updated', { board: boards[idx] });
    await logBoardActivity({
        boardId: boards[idx].id,
        type: 'board.updated',
        title: boards[idx].name,
        detail: req.body?.goal ? 'Board goal updated' : 'Board settings updated',
        actor: 'CEO',
        meta: { changed: Object.keys(req.body || {}) }
    });
    res.json(boards[idx]);
});

app.delete('/api/boards/:id', async (req, res) => {
    const boardId = req.params.id;
    const tasks = await readTasks();
    if (tasks.some(task => task.boardId === boardId)) {
        return res.status(409).json({ error: 'Cannot delete board with tasks. Move or delete tasks first.' });
    }

    const boards = await readBoards();
    const idx = boards.findIndex((board) => board.id === boardId);
    if (idx === -1) return res.status(404).json({ error: 'Board not found' });

    const [deletedBoard] = boards.splice(idx, 1);
    await writeBoards(boards);
    await logBoardActivity({
        boardId: deletedBoard.id,
        type: 'board.deleted',
        title: deletedBoard.name,
        detail: 'Board deleted',
        actor: 'CEO',
        meta: {}
    });
    broadcastEvent('board.updated', { deletedBoardId: boardId });

    res.json({ success: true });
});

app.post('/api/notifications/read-all', async (req, res) => {
    await notificationsMutex.lock();
    try {
        const notifs = await readNotifications();
        const updated = notifs.map(n => ({ ...n, read: true }));
        await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(updated, null, 2));
        broadcastEvent('notifications.read_all', { count: updated.length });
        res.json({ success: true });
    } finally {
        notificationsMutex.unlock();
    }
});

// Helper to get latest Coinbase report
async function getLatestCoinbaseReport() {
    try {
        const files = await fs.readdir(COINBASE_REPORTS_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('.')).sort().reverse();
        if (jsonFiles.length === 0) return null;

        const latestFile = path.join(COINBASE_REPORTS_DIR, jsonFiles[0]);
        const data = await fs.readFile(latestFile, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
}

app.get('/api/coinbase/latest', async (req, res) => {
    const report = await getLatestCoinbaseReport();
    if (!report) return res.json({ research_intel: [], intelligence: [], message: 'No reports found' });
    res.json(report);
});

app.get('/api/projects', async (req, res) => {
    try {
        const projectsDir = path.join(__dirname, 'projects');
        const items = await fs.readdir(projectsDir, { withFileTypes: true });
        const projects = items.filter(item => item.isDirectory() && !item.name.startsWith('.')).map(item => ({
            id: item.name,
            name: item.name.charAt(0).toUpperCase() + item.name.slice(1).replace(/-/g, ' ')
        }));
        res.json(projects);
    } catch (e) {
        res.json([]);
    }
});

app.get('/api/outreach/drafts', async (req, res) => {
    try {
        const draftsPath = path.join(PROJECT_ROOT, 'aegiscorp-hq', 'projects', 'outreach', 'blackboard', 'content', 'drafts.json');
        const data = await fs.readFile(draftsPath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (e) {
        res.json([]);
    }
});

const PORT = 3001;
const server = http.createServer(app);

function createWebSocketAccept(key) {
    return crypto
        .createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`, 'binary')
        .digest('base64');
}

function sendWsText(socket, text) {
    const payload = Buffer.from(text);
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    socket.write(Buffer.concat([header, payload]));
}

function readWsFrames(buffer) {
    const messages = [];
    let offset = 0;

    while (offset + 2 <= buffer.length) {
        const b1 = buffer[offset];
        const b2 = buffer[offset + 1];
        const opcode = b1 & 0x0f;
        const masked = (b2 & 0x80) !== 0;
        let length = b2 & 0x7f;
        let headerLength = 2;

        if (length === 126) {
            if (offset + 4 > buffer.length) break;
            length = buffer.readUInt16BE(offset + 2);
            headerLength = 4;
        } else if (length === 127) {
            if (offset + 10 > buffer.length) break;
            const bigLen = buffer.readBigUInt64BE(offset + 2);
            if (bigLen > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('WS frame too large');
            length = Number(bigLen);
            headerLength = 10;
        }

        const maskLength = masked ? 4 : 0;
        const frameLength = headerLength + maskLength + length;
        if (offset + frameLength > buffer.length) break;

        if (opcode === 0x8) {
            messages.push({ type: 'close' });
            offset += frameLength;
            continue;
        }
        if (opcode === 0x9) {
            messages.push({ type: 'ping' });
            offset += frameLength;
            continue;
        }
        if (opcode !== 0x1) {
            offset += frameLength;
            continue;
        }

        const dataStart = offset + headerLength + maskLength;
        const payload = Buffer.from(buffer.slice(dataStart, dataStart + length));
        if (masked) {
            const mask = buffer.slice(offset + headerLength, offset + headerLength + 4);
            for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
        }
        messages.push({ type: 'text', text: payload.toString('utf-8') });
        offset += frameLength;
    }

    return { messages, remaining: buffer.slice(offset) };
}

function sendWsJson(socket, payload) {
    sendWsText(socket, JSON.stringify(payload));
}

async function streamReplyOverSocket(socket, payload) {
    const { agent, message, clientMessageId } = payload || {};
    if (!agent || !message) {
        sendWsJson(socket, { type: 'chat.error', clientMessageId, error: 'Agent and message required' });
        return;
    }
    const sanitizedAgent = String(agent).toLowerCase();
    if (!VALID_AGENTS.includes(sanitizedAgent)) {
        sendWsJson(socket, { type: 'chat.error', clientMessageId, error: 'Invalid or unauthorized agent identifier' });
        return;
    }

    sendWsJson(socket, { type: 'chat.start', clientMessageId, agent: sanitizedAgent });

    try {
        broadcastEvent('chat.user', {
            agent: sanitizedAgent,
            agentLabel: sanitizedAgent.charAt(0).toUpperCase() + sanitizedAgent.slice(1),
            message,
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        await appendChannelMessage(sanitizedAgent, {
            id: typeof clientMessageId === 'string' ? clientMessageId : `u-${Date.now()}`,
            role: 'user',
            content: String(message),
            createdAt: new Date().toISOString(),
        });

        const systemPrompt = await buildSystemPromptForAgent(sanitizedAgent);
        const { model, provider } = getLlmConfigForAgent(sanitizedAgent);

        let fetchUrl, fetchHeaders, fetchBody;
        if (provider === 'groq') {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) { sendWsJson(socket, { type: 'chat.error', clientMessageId, error: 'GROQ_API_KEY not configured' }); return; }
            fetchUrl = 'https://api.groq.com/openai/v1/chat/completions';
            fetchHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            fetchBody = {
                model: model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: String(message) }],
                max_tokens: 1000,
                temperature: 1.0,
                stream: true
            };
        } else if (provider === 'gemini') {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) { sendWsJson(socket, { type: 'chat.error', clientMessageId, error: 'GEMINI_API_KEY not configured' }); return; }
            fetchUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
            fetchHeaders = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            fetchBody = {
                model: model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: String(message) }],
                max_tokens: 1000,
                temperature: 1.0,
                stream: true
            };
        } else {
            const apiKey = process.env.MINIMAX_API_KEY;
            if (!apiKey) { sendWsJson(socket, { type: 'chat.error', clientMessageId, error: 'MINIMAX_API_KEY not configured' }); return; }
            fetchUrl = 'https://api.minimax.io/anthropic/v1/messages';
            fetchHeaders = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
            fetchBody = {
                model: model,
                system: systemPrompt,
                messages: [{ role: 'user', content: String(message) }],
                max_tokens: 1000,
                temperature: 1.0,
                stream: true
            };
        }

        const providerRes = await fetch(fetchUrl, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(fetchBody)
        });

        if (!providerRes.ok) {
            const errText = await providerRes.text();
            sendWsJson(socket, { type: 'chat.error', clientMessageId, error: `${provider} API Error: ${errText}` });
            return;
        }
        if (!providerRes.body) {
            sendWsJson(socket, { type: 'chat.error', clientMessageId, error: 'Streaming response body unavailable' });
            return;
        }

        const reader = providerRes.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let assembled = '';
        let tokensUsed = 0;
        let modelUsed = model;

        const handleEventData = (jsonText) => {
            if (!jsonText || jsonText === '[DONE]') return;
            let evt;
            try {
                evt = JSON.parse(jsonText);
            } catch { return; }

            if (evt.model) modelUsed = evt.model;
            if (evt.usage?.total_tokens) tokensUsed = evt.usage.total_tokens;

            let deltaText = '';
            if (provider === 'groq' || provider === 'gemini') {
                deltaText = evt.choices?.[0]?.delta?.content || '';
            } else {
                deltaText = evt.delta?.text || evt.content_block?.text || (evt.delta?.type === 'text_delta' ? evt.delta.text : '') || '';
            }

            if (deltaText) {
                assembled += deltaText;
                sendWsJson(socket, {
                    type: 'chat.chunk',
                    clientMessageId,
                    delta: deltaText,
                    content: assembled
                });
            }

            if (provider === 'minimax' && Array.isArray(evt.content) && !assembled) {
                const textBlock = evt.content.find((block) => block?.type === 'text');
                if (textBlock?.text) {
                    assembled = textBlock.text;
                    sendWsJson(socket, {
                        type: 'chat.chunk',
                        clientMessageId,
                        delta: textBlock.text,
                        content: assembled
                    });
                }
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });

            let boundary;
            while ((boundary = sseBuffer.indexOf('\n\n')) !== -1) {
                const rawEvent = sseBuffer.slice(0, boundary);
                sseBuffer = sseBuffer.slice(boundary + 2);
                const dataLines = rawEvent
                    .split('\n')
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).trimStart());
                if (!dataLines.length) continue;
                handleEventData(dataLines.join('\n'));
            }
        }

        const trailing = decoder.decode();
        if (trailing) sseBuffer += trailing;
        if (sseBuffer.trim()) {
            const dataLines = sseBuffer
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice(5).trimStart());
            if (dataLines.length) handleEventData(dataLines.join('\n'));
        }

        // --- COMMAND INTERCEPTION ---
        const commandMatch = assembled.match(/```json\s*(\{[\s\S]*?"action":\s*"(UPDATE_TASK|CREATE_TASK)"[\s\S]*?\})\s*```/);
        if (commandMatch) {
            try {
                const command = JSON.parse(commandMatch[1]);
                await tasksMutex.lock();
                try {
                    const tasks = await readTasks();
                    if (command.action === 'UPDATE_TASK' && command.taskId && command.status) {
                        const idx = tasks.findIndex(t => String(t.id) === String(command.taskId));
                        if (idx !== -1) {
                            const oldStatus = tasks[idx].status;
                            tasks[idx].status = command.status;
                            tasks[idx] = normalizeTask(tasks[idx]);
                            await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
                            broadcastEvent('task.updated', { task: tasks[idx], oldStatus });
                            await logBoardActivity({
                                boardId: tasks[idx].boardId,
                                type: 'task.updated',
                                title: tasks[idx].title,
                                detail: `Status ${oldStatus} -> ${tasks[idx].status} (via Agent Command)`,
                                actor: sanitizedAgent,
                                meta: { taskId: tasks[idx].id, oldStatus, status: tasks[idx].status }
                            });
                            assembled = assembled.replace(commandMatch[0], '').trim() || `Task ${command.taskId} updated to ${command.status}.`;
                        }
                    } else if (command.action === 'CREATE_TASK' && command.title) {
                        const newTask = {
                            id: Date.now().toString(),
                            title: command.title,
                            desc: command.desc || '',
                            status: command.status || 'inbox',
                            priority: 'Medium',
                            assignee: sanitizedAgent.charAt(0).toUpperCase() + sanitizedAgent.slice(1),
                            boardId: 'default',
                            createdAt: new Date().toISOString()
                        };
                        tasks.push(newTask);
                        await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
                        broadcastEvent('task.created', { task: newTask });
                        await logBoardActivity({
                            boardId: newTask.boardId,
                            type: 'task.created',
                            title: newTask.title,
                            detail: `Agent self-assigned: ${newTask.title}`,
                            actor: sanitizedAgent,
                            meta: { taskId: newTask.id, status: newTask.status }
                        });
                        assembled = assembled.replace(commandMatch[0], '').trim() || `Task created: ${newTask.title}`;
                    }
                } finally {
                    tasksMutex.unlock();
                }
            } catch (e) {
                console.error('Failed to parse agent command in WS', e);
            }
        }
        // ----------------------------

        await recordAnalyticsUsage(sanitizedAgent, modelUsed, tokensUsed);
        broadcastEvent('chat.agent', {
            agent: sanitizedAgent,
            agentLabel: sanitizedAgent.charAt(0).toUpperCase() + sanitizedAgent.slice(1),
            reply: assembled,
            model: modelUsed,
            tokensUsed,
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        await appendChannelMessage(sanitizedAgent, {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'agent',
            content: assembled,
            model: modelUsed,
            tokensUsed,
            createdAt: new Date().toISOString(),
            replyTo: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        await logBoardActivity({
            boardId: null,
            type: 'chat.agent',
            title: `Reply from ${sanitizedAgent}`,
            detail: assembled.slice(0, 140),
            actor: sanitizedAgent,
            meta: { model: modelUsed, tokensUsed }
        });

        sendWsJson(socket, {
            type: 'chat.done',
            clientMessageId,
            content: assembled,
            model: modelUsed,
            tokensUsed
        });
    } catch (error) {
        broadcastEvent('chat.error', {
            agent: sanitizedAgent,
            error: error instanceof Error ? error.message : 'Unknown WebSocket chat error',
            clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
        });
        sendWsJson(socket, {
            type: 'chat.error',
            clientMessageId,
            error: error instanceof Error ? error.message : 'Unknown WebSocket chat error'
        });
    }
}

server.on('upgrade', (req, socket) => {
    if (req.url !== '/ws') {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key || Array.isArray(key)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
    }

    const accept = createWebSocketAccept(key);
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    wsClients.add(socket);
    sendWsJson(socket, { type: 'system.connected', timestamp: new Date().toISOString() });

    let buffer = Buffer.alloc(0);
    socket.on('data', async (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        let parsed;
        try {
            parsed = readWsFrames(buffer);
        } catch {
            socket.destroy();
            return;
        }
        buffer = parsed.remaining;

        for (const message of parsed.messages) {
            if (message.type === 'close') {
                socket.end();
                return;
            }
            if (message.type !== 'text') continue;
            try {
                const payload = JSON.parse(message.text);
                if (payload.type === 'chat.send') {
                    await streamReplyOverSocket(socket, payload);
                }
            } catch {
                sendWsJson(socket, { type: 'system.error', error: 'Invalid WebSocket message payload' });
            }
        }
    });

    socket.on('error', () => {
        wsClients.delete(socket);
    });
    socket.on('close', () => {
        wsClients.delete(socket);
    });
    socket.on('end', () => {
        wsClients.delete(socket);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`AegisCorp HQ Local API running on http://127.0.0.1:${PORT}`);
});
