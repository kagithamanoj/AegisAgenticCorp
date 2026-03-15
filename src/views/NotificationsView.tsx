import { useState, useEffect } from 'react';
import { ShieldAlert, Cpu, CheckCircle, Loader } from 'lucide-react';

interface NotificationItem {
    id: number | string;
    type?: string;
    title?: string;
    message?: string;
    time?: string;
    read?: boolean;
}

const NotificationsView = () => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications');
            const data: unknown = await res.json();
            setNotifications(Array.isArray(data) ? data as NotificationItem[] : []);
        } catch (e) {
            console.error("Failed to fetch notifications", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications/read-all', { method: 'POST' });
            fetchNotifications();
        } catch (e) {
            console.error("Failed to mark all as read", e);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                <Loader className="spin" size={24} />
            </div>
        );
    }

    return (
        <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', height: '100%' }}>
            <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                        System Notifications
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
                        Alerts, telemetry warnings, and squad task updates.
                    </p>
                </div>
                <button
                    onClick={markAllAsRead}
                    style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer' }}
                >
                    Mark All as Read
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {notifications.map(notif => {
                    const notifType = notif.type ?? 'system';
                    const icons: Record<string, React.ReactNode> = {
                        alert: <ShieldAlert size={18} color="var(--accent-red)" />,
                        success: <CheckCircle size={18} color="var(--accent-green)" />,
                        system: <Cpu size={18} color="var(--accent-blue)" />
                    };
                    const bgs: Record<string, string> = {
                        alert: 'var(--accent-red-light)',
                        success: 'var(--accent-green-light)',
                        system: 'var(--accent-blue-light)'
                    };

                    return (
                        <div key={notif.id} style={{
                            display: 'flex',
                            gap: '20px',
                            padding: '24px',
                            backgroundColor: 'var(--bg-panel)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--border-radius-lg)',
                            transition: 'border-color 0.2s ease',
                            opacity: notif.read ? 0.7 : 1
                        }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                backgroundColor: bgs[notifType] || 'var(--bg-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                {icons[notifType] || <Cpu size={18} />}
                            </div>

                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {notif.title} {!notif.read && <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>●</span>}
                                    </h4>
                                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{notif.time}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                    {notif.message}
                                </p>
                            </div>
                        </div>
                    );
                })}
                {notifications.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                        No notifications currently active.
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsView;
