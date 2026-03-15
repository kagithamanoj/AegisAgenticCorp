import React from 'react';
import { CalendarClock, UserCircle } from 'lucide-react';

export type TaskStatus = 'inbox' | 'in_progress' | 'review' | 'done';

export interface TaskCardProps {
    title: string;
    status?: TaskStatus;
    priority?: string;
    assignee?: string;
    due?: string;
    isOverdue?: boolean;
    approvalsPendingCount?: number;
    tags?: Array<{ id: string; name: string; color: string }>;
    isBlocked?: boolean;
    blockedByCount?: number;
    onClick?: () => void;
    draggable?: boolean;
    isDragging?: boolean;
    onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
}

export function TaskCard({
    title,
    status,
    priority,
    assignee,
    due,
    isOverdue = false,
    approvalsPendingCount = 0,
    tags = [],
    isBlocked = false,
    blockedByCount = 0,
    onClick,
    draggable = false,
    isDragging = false,
    onDragStart,
    onDragEnd,
}: TaskCardProps) {
    const hasPendingApproval = approvalsPendingCount > 0;
    const needsLeadReview = status === 'review' && !isBlocked && !hasPendingApproval;

    let cardModifier = '';
    let leftBarClass = '';

    if (isBlocked) {
        cardModifier = 'oc-card-blocked';
        leftBarClass = 'oc-bar-blocked';
    } else if (hasPendingApproval) {
        cardModifier = 'oc-card-approval';
        leftBarClass = 'oc-bar-approval';
    } else if (needsLeadReview) {
        cardModifier = 'oc-card-review';
        leftBarClass = 'oc-bar-review';
    }

    const priorityClass = priority ? `oc-badge-${priority.toLowerCase()}` : 'oc-badge-default';
    const priorityLabel = priority ? priority.toUpperCase() : 'MEDIUM';
    const visibleTags = tags.slice(0, 3);

    return (
        <div
            className={`oc-task-card ${isDragging ? 'oc-card-dragging' : ''} ${cardModifier}`}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick?.();
                }
            }}
        >
            {leftBarClass && <span className={`oc-task-left-bar ${leftBarClass}`} />}

            <div className="oc-task-body">
                <div className="oc-task-content">
                    <p className="oc-task-title">{title}</p>

                    {isBlocked && (
                        <div className="oc-task-status-label status-blocked">
                            <span className="oc-dot dot-blocked" />
                            Blocked{blockedByCount > 0 ? ` · ${blockedByCount}` : ''}
                        </div>
                    )}

                    {hasPendingApproval && (
                        <div className="oc-task-status-label status-approval">
                            <span className="oc-dot dot-approval" />
                            Approval needed · {approvalsPendingCount}
                        </div>
                    )}

                    {needsLeadReview && (
                        <div className="oc-task-status-label status-review">
                            <span className="oc-dot dot-review" />
                            Waiting for lead review
                        </div>
                    )}

                    {visibleTags.length > 0 && (
                        <div className="oc-task-tags">
                            {visibleTags.map((tag) => (
                                <span key={tag.id} className="oc-task-tag">
                                    <span
                                        className="oc-tag-dot"
                                        style={{ backgroundColor: `#${tag.color}` }}
                                    />
                                    {tag.name}
                                </span>
                            ))}
                            {tags.length > visibleTags.length && (
                                <span className="oc-task-tag-overflow">
                                    +{tags.length - visibleTags.length}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="oc-task-right">
                    <span className={`oc-task-priority ${priorityClass}`}>
                        {priorityLabel}
                    </span>
                </div>
            </div>

            <div className="oc-task-footer">
                <div className="oc-task-assignee">
                    <UserCircle size={16} />
                    <span>{assignee ?? 'Unassigned'}</span>
                </div>

                {due && (
                    <div className={`oc-task-due ${isOverdue ? 'overdue' : ''}`}>
                        <CalendarClock size={16} />
                        <span>{due}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
