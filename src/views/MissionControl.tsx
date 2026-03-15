import React, { useEffect, useMemo, useState } from 'react';
import { AgentDispatch } from '../components/AgentDispatch';
import { TaskBoard } from '../components/TaskBoard';
import { useLiveEvents } from '../hooks/useLiveEvents';
import {
    ShieldCheck,
    Plus,
    Save,
    Trash2,
    GitBranch,
    MessageSquareMore,
} from 'lucide-react';
import './MissionControl.css';

// readLiveFeedPref removed since it was unused and cause for concern in lints

type BackendTaskStatus = 'assigned' | 'in-progress' | 'review' | 'done';

interface AgentSummary {
    id: string;
    name: string;
    status: string;
    load?: number;
    tokensUsed?: number;
    messageCount?: number;
    lastActivityAt?: string | null;
    minutesSinceActive?: number | null;
}

interface TaskComment {
    id: string;
    author: string;
    text: string;
    createdAt: string;
}

interface BackendTask {
    id: number;
    title: string;
    desc?: string;
    assignee: string;
    tag?: string;
    status: BackendTaskStatus;
    urgent?: boolean;
    date?: string;
    boardId?: string;
    boardGroupId?: string;
    approvalsPendingCount?: number;
    approvalHistory?: Array<{ type: string; by: string; at: string }>;
    comments?: TaskComment[];
    blockedByTaskIds?: string[];
    blockedByCount?: number;
    isBlocked?: boolean;
}

interface BoardGroup {
    id: string;
    name: string;
    color?: string;
}

interface Board {
    id: string;
    name: string;
    groupId: string;
    goal?: string;
    leadAgent?: string;
    status?: string;
    taskCount?: number;
    group?: BoardGroup | null;
}

interface BoardActivityEntry {
    id: string;
    ts: string;
    boardId: string | null;
    type: string;
    title: string;
    detail: string;
    actor: string;
    meta?: Record<string, unknown>;
}

const parseJsonSafe = async <T,>(res: Response): Promise<T | null> => {
    const text = await res.text();
    if (!text) return null;
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
};

// getAgentTone removed since it was unused

const getActivityTone = (type: string): 'healthy' | 'warning' | 'critical' => {
    if (type.includes('approved') || type.includes('done')) return 'healthy';
    if (type.includes('blocked') || type.includes('deleted') || type.includes('error')) return 'critical';
    if (type.includes('approval') || type.includes('warning')) return 'warning';
    return 'healthy';
};

const MissionControl = () => {
    const [tasks, setTasks] = useState<BackendTask[]>([]);
    const [agents, setAgents] = useState<AgentSummary[]>([]);
    const [boards, setBoards] = useState<Board[]>([]);
    const [activity, setActivity] = useState<BoardActivityEntry[]>([]);
    const [selectedBoardId, setSelectedBoardId] = useState<string>('');
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [showNewTaskForm, setShowNewTaskForm] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [dependencySelection, setDependencySelection] = useState<string[]>([]);
    const [errorMsg, setErrorMsg] = useState<string>('');
    const [busyAction, setBusyAction] = useState<string>('');
    const [newTask, setNewTask] = useState({ title: '', desc: '', assignee: 'monica', urgent: false });
    const [taskDraft, setTaskDraft] = useState<{ title: string; desc: string; assignee: string; urgent: boolean } | null>(null);

    const fetchCore = async () => {
        const [tRes, aRes, bRes, gRes] = await Promise.allSettled([
            fetch('/api/tasks'),
            fetch('/api/agents'),
            fetch('/api/boards'),
            fetch('/api/board-groups')
        ]);

        const getArray = async <T,>(
            settled: PromiseSettledResult<Response>,
            label: string,
            { required = false }: { required?: boolean } = {}
        ): Promise<T[]> => {
            if (settled.status !== 'fulfilled') {
                if (required) throw new Error(`Failed to fetch ${label}`);
                console.warn(`MissionControl: ${label} request failed`, settled.reason);
                return [];
            }

            const payload = await parseJsonSafe<unknown>(settled.value);
            if (!settled.value.ok) {
                if (required) {
                    const err = typeof payload === 'object' && payload && 'error' in payload
                        ? String((payload as { error?: unknown }).error ?? '')
                        : '';
                    throw new Error(err || `Failed to load ${label}`);
                }
                console.warn(`MissionControl: ${label} endpoint unavailable`, settled.value.status);
                return [];
            }

            return Array.isArray(payload) ? (payload as T[]) : [];
        };

        const nextTasks = await getArray<BackendTask>(tRes, 'tasks', { required: true });
        const nextAgents = await getArray<AgentSummary>(aRes, 'agents', { required: true });
        let nextBoards = await getArray<Board>(bRes, 'boards');
        let nextGroups = await getArray<BoardGroup>(gRes, 'board groups');

        if (nextGroups.length === 0 && nextBoards.length > 0) {
            const groupMap = new Map<string, BoardGroup>();
            nextBoards.forEach((board) => {
                if (!groupMap.has(board.groupId)) {
                    groupMap.set(board.groupId, {
                        id: board.groupId,
                        name: board.groupId.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
                    });
                }
            });
            nextGroups = Array.from(groupMap.values());
        }

        if (nextBoards.length === 0 && nextTasks.length > 0) {
            const boardMap = new Map<string, Board>();
            nextTasks.forEach((task) => {
                const boardId = task.boardId || 'mission';
                if (!boardMap.has(boardId)) {
                    boardMap.set(boardId, {
                        id: boardId,
                        name: boardId === 'mission'
                            ? 'Mission Board'
                            : boardId.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
                        groupId: task.boardGroupId || 'operations',
                        leadAgent: 'monica',
                        goal: '',
                    });
                }
            });
            nextBoards = Array.from(boardMap.values());
            if (nextGroups.length === 0) {
                const groupIds = new Set(nextBoards.map((b) => b.groupId || 'operations'));
                nextGroups = Array.from(groupIds).map((id) => ({
                    id,
                    name: id.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
                }));
            }
        }

        setTasks(nextTasks);
        setAgents(nextAgents);
        setBoards(nextBoards);
        setErrorMsg('');

        setSelectedBoardId(prev => {
            if (prev && nextBoards.some(b => b.id === prev)) return prev;
            return nextBoards[0]?.id || '';
        });
        setSelectedTaskId(prev => (prev && nextTasks.some(t => t.id === prev)) ? prev : null);
    };

    const fetchBoardActivity = async (boardId: string) => {
        if (!boardId) return;
        try {
            const res = await fetch(`/api/boards/${boardId}/activity?limit=80`);
            const data = await parseJsonSafe<unknown>(res);
            if (!res.ok) {
                setActivity([]);
                return;
            }
            setActivity(Array.isArray(data) ? (data as BoardActivityEntry[]) : []);
        } catch (e) {
            console.warn('MissionControl: board activity unavailable', e);
            setActivity([]);
        }
    };

    useEffect(() => {
        const run = async () => {
            try {
                await fetchCore();
            } catch (e) {
                console.error('MissionControl fetch failed', e);
                setErrorMsg('Failed to load mission data.');
            }
        };
        void run();
        const interval = setInterval(run, 12000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!selectedBoardId) return;
        void fetchBoardActivity(selectedBoardId);
    }, [selectedBoardId]);

    useEffect(() => {
        if (!selectedBoardId) return;
        void fetchBoardActivity(selectedBoardId);
    }, [selectedBoardId]);

    useLiveEvents((event) => {
        if (event.type.startsWith('task.') || event.type === 'board.updated' || event.type === 'board.activity') {
            void fetchCore();
            if (selectedBoardId) void fetchBoardActivity(selectedBoardId);
        }
    });

    const selectedBoard = useMemo(
        () => boards.find((b) => b.id === selectedBoardId) || null,
        [boards, selectedBoardId]
    );

    const boardTasks = useMemo(
        () => tasks.filter((task) => !selectedBoard || task.boardId === selectedBoard.id),
        [tasks, selectedBoard]
    );

    const selectedTask = useMemo(
        () => boardTasks.find((task) => task.id === selectedTaskId) || null,
        [boardTasks, selectedTaskId]
    );

    // useEffect for boardGoalDraft removed since setBoardGoalDraft was missing and unused

    useEffect(() => {
        if (!selectedTask) {
            setTaskDraft(null);
            setDependencySelection([]);
            return;
        }
        setTaskDraft({
            title: selectedTask.title,
            desc: selectedTask.desc || '',
            assignee: selectedTask.assignee,
            urgent: Boolean(selectedTask.urgent),
        });
        setDependencySelection((selectedTask.blockedByTaskIds || []).map(String));
    }, [selectedTask]);

    const blockers = useMemo(() => {
        if (!selectedTask) return [];
        const blockerSet = new Set((selectedTask.blockedByTaskIds || []).map(String));
        return boardTasks.filter((t) => blockerSet.has(String(t.id)));
    }, [boardTasks, selectedTask]);

    const dependents = useMemo(() => {
        if (!selectedTask) return [];
        return boardTasks.filter((t) => (t.blockedByTaskIds || []).map(String).includes(String(selectedTask.id)));
    }, [boardTasks, selectedTask]);

    // groupsWithBoards removed since it was unused

    const metrics = useMemo(() => {
        const total = boardTasks.length;
        const inProgress = boardTasks.filter((t) => t.status === 'in-progress').length;
        const blocked = boardTasks.filter((t) => t.isBlocked).length;
        const pendingApprovals = boardTasks.reduce((sum, t) => sum + (t.approvalsPendingCount || 0), 0);
        const done = boardTasks.filter((t) => t.status === 'done').length;
        const activeAgents = agents.filter((a) => a.status === 'working').length;
        return {
            total,
            inProgress,
            blocked,
            pendingApprovals,
            done,
            activeAgents,
            completionRate: total ? Math.round((done / total) * 100) : 0,
        };
    }, [boardTasks, agents]);

    const runAction = async (label: string, fn: () => Promise<void>) => {
        setErrorMsg('');
        setBusyAction(label);
        try {
            await fn();
        } catch (e) {
            console.error(label, e);
            setErrorMsg(e instanceof Error ? e.message : `Failed: ${label}`);
        } finally {
            setBusyAction('');
        }
    };

    const createTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBoard || !newTask.title.trim()) return;
        await runAction('create-task', async () => {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...newTask,
                    status: 'assigned',
                    tag: 'mission',
                    boardId: selectedBoard.id,
                    boardGroupId: selectedBoard.groupId,
                })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to create task');
            setShowNewTaskForm(false);
            setNewTask({ title: '', desc: '', assignee: agents[0]?.id || 'monica', urgent: false });
            await fetchCore();
            await fetchBoardActivity(selectedBoard.id);
        });
    };

    const saveTaskDetails = async () => {
        if (!selectedTask || !taskDraft) return;
        await runAction('save-task', async () => {
            const res = await fetch(`/api/tasks/${selectedTask.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: taskDraft.title.trim(),
                    desc: taskDraft.desc,
                    assignee: taskDraft.assignee,
                    urgent: taskDraft.urgent,
                })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to save task');
            await fetchCore();
            if (selectedBoard?.id) await fetchBoardActivity(selectedBoard.id);
        });
    };

    const deleteTask = async () => {
        if (!selectedTask) return;
        await runAction('delete-task', async () => {
            const res = await fetch(`/api/tasks/${selectedTask.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete task');
            const boardId = selectedBoard?.id || '';
            setSelectedTaskId(null);
            await fetchCore();
            if (boardId) await fetchBoardActivity(boardId);
        });
    };

    const saveDependencies = async () => {
        if (!selectedTask) return;
        await runAction('save-dependencies', async () => {
            const res = await fetch(`/api/tasks/${selectedTask.id}/blockers`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ blockedByTaskIds: dependencySelection.map(String) })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to update dependencies');
            await fetchCore();
            if (selectedBoard?.id) await fetchBoardActivity(selectedBoard.id);
        });
    };

    const addComment = async () => {
        if (!selectedTask || !commentDraft.trim()) return;
        await runAction('add-comment', async () => {
            const res = await fetch(`/api/tasks/${selectedTask.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ author: 'CEO', text: commentDraft.trim() })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to add comment');
            setCommentDraft('');
            await fetchCore();
            if (selectedBoard?.id) await fetchBoardActivity(selectedBoard.id);
        });
    };

    const requestApproval = async () => {
        if (!selectedTask) return;
        await runAction('request-approval', async () => {
            const res = await fetch(`/api/tasks/${selectedTask.id}/request-approval`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ by: 'CEO' })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to request approval');
            await fetchCore();
            if (selectedBoard?.id) await fetchBoardActivity(selectedBoard.id);
        });
    };

    const approveTask = async () => {
        if (!selectedTask) return;
        await runAction('approve-task', async () => {
            const res = await fetch(`/api/tasks/${selectedTask.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ by: 'Monica' })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to approve task');
            await fetchCore();
            if (selectedBoard?.id) await fetchBoardActivity(selectedBoard.id);
        });
    };

    // saveBoardGoal removed since it was unused

    // createBoard removed since it was unused

    // deleteBoard removed since it was unused

    const moveTask = async (taskId: number, nextStatus: BackendTaskStatus) => {
        await runAction('move-task', async () => {
            const res = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus })
            });
            if (!res.ok) throw new Error('Failed to move task');
            await fetchCore();
            if (selectedBoard?.id) await fetchBoardActivity(selectedBoard.id);
        });
    };

    return (
        <div className="hq-command-center">
            {/* Left Panel: Agent Dispatch Console */}
            <div className="hq-dispatch-zone">
                <AgentDispatch />
            </div>

            {/* Right Panel: Mission Board & Operations */}
            <div className="hq-operations-zone">
                <div className="ops-header glass-panel">
                    <div className="ops-header-title">
                        <h2>{selectedBoard?.name || 'Mission Board'}</h2>
                        <span className="ops-badge">{metrics.inProgress} Active</span>
                        <span className="ops-badge alert">{metrics.pendingApprovals} Approvals</span>
                    </div>

                    <div className="ops-header-actions">
                        <select
                            className="openclaw-input ops-select"
                            value={selectedBoardId}
                            onChange={(e) => setSelectedBoardId(e.target.value)}
                        >
                            {boards.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        <button className="openclaw-btn secondary-btn" onClick={() => setShowNewTaskForm(v => !v)}>
                            <Plus size={14} /> Task
                        </button>
                    </div>
                </div>

                <div className="ops-board-container glass-panel" style={{ padding: 16 }}>

                    <section className="ocx-board-center">
                        {showNewTaskForm && (
                            <form className="openclaw-form" onSubmit={createTask}>
                                <div className="ocx-task-form-grid">
                                    <input className="openclaw-input" placeholder="Task title" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} required />
                                    <select className="openclaw-input" value={newTask.assignee} onChange={(e) => setNewTask({ ...newTask, assignee: e.target.value })}>
                                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                                <textarea className="openclaw-input" placeholder="Task description" value={newTask.desc} onChange={(e) => setNewTask({ ...newTask, desc: e.target.value })} style={{ minHeight: 72, marginBottom: 12 }} />
                                <div className="ocx-row-between">
                                    <label className="ocx-check">
                                        <input type="checkbox" checked={newTask.urgent} onChange={(e) => setNewTask({ ...newTask, urgent: e.target.checked })} />
                                        Urgent
                                    </label>
                                    <div className="ocx-row-actions">
                                        <button type="button" className="openclaw-btn secondary-btn" onClick={() => setShowNewTaskForm(false)}>Cancel</button>
                                        <button type="submit" className="openclaw-btn" disabled={!!busyAction}>Create Task</button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {errorMsg && <div className="ocx-error">{errorMsg}</div>}

                        <TaskBoard
                            tasks={boardTasks.map((t) => ({
                                id: String(t.id),
                                title: t.title,
                                status: t.status === 'assigned' ? 'inbox' : (t.status === 'in-progress' ? 'in_progress' : t.status),
                                priority: t.urgent ? 'high' : 'medium',
                                assignee: t.assignee,
                                due: t.date,
                                approvalsPendingCount: t.approvalsPendingCount || 0,
                                isBlocked: Boolean(t.isBlocked),
                                blockedByCount: t.blockedByCount || 0,
                                tags: t.tag ? [{ id: t.tag, name: t.tag.toUpperCase(), color: '64748b' }] : [],
                            }))}
                            onTaskSelect={(task) => setSelectedTaskId(Number(task.id))}
                            onTaskMove={(taskId, status) => {
                                const mappedStatus = status === 'inbox' ? 'assigned' : (status === 'in_progress' ? 'in-progress' : status);
                                void moveTask(Number(taskId), mappedStatus as BackendTaskStatus);
                            }}
                        />
                    </section>

                    <aside className="ocx-inspector">
                        <section className="ocx-side-panel">
                            <div className="ocx-panel-header">
                                <span>Board Activity Timeline</span>
                                <button type="button" className="openclaw-btn secondary-btn" onClick={() => selectedBoard && fetchBoardActivity(selectedBoard.id)}>
                                    Refresh
                                </button>
                            </div>
                            <div className="ocx-timeline">
                                {activity.map((item) => (
                                    <div key={item.id} className={`ocx-timeline-item ${getActivityTone(item.type)}`}>
                                        <div className="ocx-timeline-dot" />
                                        <div className="ocx-timeline-body">
                                            <div className="ocx-timeline-head">
                                                <strong>{item.title}</strong>
                                                <span>{new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="ocx-timeline-detail">{item.detail}</div>
                                            <div className="ocx-timeline-meta">{item.actor} · {item.type}</div>
                                        </div>
                                    </div>
                                ))}
                                {activity.length === 0 && <div className="ocx-empty">No activity for this board yet.</div>}
                            </div>
                        </section>

                        <section className="ocx-side-panel">
                            <div className="ocx-panel-header">
                                <span>{selectedTask ? `Task #${selectedTask.id}` : 'Task Inspector'}</span>
                            </div>
                            {!selectedTask || !taskDraft ? (
                                <div className="ocx-empty">Select a task from the board to edit details, dependencies, approvals, and comments.</div>
                            ) : (
                                <div className="ocx-task-inspector-body">
                                    <div className="ocx-form-stack">
                                        <input className="openclaw-input" value={taskDraft.title} onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })} />
                                        <textarea className="openclaw-input" value={taskDraft.desc} onChange={(e) => setTaskDraft({ ...taskDraft, desc: e.target.value })} style={{ minHeight: 70 }} />
                                        <select className="openclaw-input" value={taskDraft.assignee} onChange={(e) => setTaskDraft({ ...taskDraft, assignee: e.target.value })}>
                                            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                        </select>
                                        <label className="ocx-check"><input type="checkbox" checked={taskDraft.urgent} onChange={(e) => setTaskDraft({ ...taskDraft, urgent: e.target.checked })} /> Urgent</label>
                                        <div className="ocx-row-actions">
                                            <button type="button" className="openclaw-btn secondary-btn" onClick={saveTaskDetails} disabled={!!busyAction}><Save size={14} /> Save Task</button>
                                            <button type="button" className="openclaw-btn secondary-btn ocx-danger-btn" onClick={deleteTask} disabled={!!busyAction}><Trash2 size={14} /> Delete Task</button>
                                        </div>
                                    </div>

                                    <div className="ocx-divider" />

                                    <div className="ocx-panel-header">
                                        <span><ShieldCheck size={14} /> Approvals</span>
                                        <span className="ocx-badge">{selectedTask.approvalsPendingCount || 0} pending</span>
                                    </div>
                                    <div className="ocx-row-actions">
                                        <button type="button" className="openclaw-btn secondary-btn" onClick={requestApproval} disabled={!!busyAction}>Request</button>
                                        <button type="button" className="openclaw-btn secondary-btn" onClick={approveTask} disabled={!!busyAction}>Approve</button>
                                    </div>

                                    <div className="ocx-divider" />

                                    <div className="ocx-panel-header">
                                        <span><GitBranch size={14} /> Dependency Graph</span>
                                        <button type="button" className="openclaw-btn secondary-btn" onClick={saveDependencies} disabled={!!busyAction}>
                                            <Save size={14} /> Save
                                        </button>
                                    </div>

                                    <div className="ocx-dependency-graph">
                                        <div className="ocx-dep-col">
                                            <div className="ocx-dep-title">Blockers</div>
                                            {blockers.length ? blockers.map((task) => (
                                                <button key={task.id} type="button" className="ocx-dep-node" onClick={() => setSelectedTaskId(task.id)}>
                                                    #{task.id} {task.title}
                                                </button>
                                            )) : <div className="ocx-empty">None</div>}
                                        </div>
                                        <div className="ocx-dep-center">
                                            <div className="ocx-dep-node active">#{selectedTask.id} {selectedTask.title}</div>
                                        </div>
                                        <div className="ocx-dep-col">
                                            <div className="ocx-dep-title">Dependents</div>
                                            {dependents.length ? dependents.map((task) => (
                                                <button key={task.id} type="button" className="ocx-dep-node" onClick={() => setSelectedTaskId(task.id)}>
                                                    #{task.id} {task.title}
                                                </button>
                                            )) : <div className="ocx-empty">None</div>}
                                        </div>
                                    </div>

                                    <div className="ocx-dependency-selector">
                                        {boardTasks.filter((t) => t.id !== selectedTask.id).map((task) => {
                                            const checked = dependencySelection.includes(String(task.id));
                                            return (
                                                <label key={task.id} className="ocx-dependency-option">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            setDependencySelection((prev) => {
                                                                const next = new Set(prev);
                                                                if (e.target.checked) next.add(String(task.id));
                                                                else next.delete(String(task.id));
                                                                return Array.from(next);
                                                            });
                                                        }}
                                                    />
                                                    <span>#{task.id}</span>
                                                    <span className="ocx-dependency-title">{task.title}</span>
                                                </label>
                                            );
                                        })}
                                        {boardTasks.filter((t) => t.id !== selectedTask.id).length === 0 && <div className="ocx-empty">No other tasks available in this board.</div>}
                                    </div>

                                    <div className="ocx-divider" />

                                    <div className="ocx-panel-header">
                                        <span><MessageSquareMore size={14} /> Comments</span>
                                        <span className="ocx-badge">{selectedTask.comments?.length || 0}</span>
                                    </div>
                                    <div className="ocx-comments">
                                        {(selectedTask.comments || []).slice().reverse().map((comment) => (
                                            <div key={comment.id} className="ocx-comment">
                                                <div className="ocx-comment-meta">{comment.author} · {new Date(comment.createdAt).toLocaleString()}</div>
                                                <div className="ocx-comment-text">{comment.text}</div>
                                            </div>
                                        ))}
                                        {(selectedTask.comments?.length || 0) === 0 && <div className="ocx-empty">No comments yet.</div>}
                                    </div>
                                    <textarea className="openclaw-input" value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)} placeholder="Add comment" style={{ minHeight: 72 }} />
                                    <button type="button" className="openclaw-btn" onClick={addComment} disabled={!commentDraft.trim() || !!busyAction}>Add Comment</button>
                                </div>
                            )}
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default MissionControl;
