

const SettingsView = () => {
    return (
        <div style={{ padding: '32px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px' }}>ORGANIZATION SETTINGS</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px' }}>
                Manage workspace tokens, integratons, and agent limits here.
            </p>

            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '24px', maxWidth: '600px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>API Configuration</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>Minimax API Key</label>
                        <input type="password" value="********************************" readOnly style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }} />
                        <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>Loaded dynamically from .env</p>
                    </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Database Connection</h3>
                <div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: 'var(--accent-green-light)', color: 'var(--accent-green)', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-green)' }}></span> Connected
                    </span>
                    <span style={{ marginLeft: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>Local tasks.json DB operational</span>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
