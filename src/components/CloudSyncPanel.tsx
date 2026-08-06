import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { CloudSyncStatus } from "../hooks/useCloudSync";

interface CloudSyncPanelProps {
  configured: boolean;
  email: string | null;
  status: CloudSyncStatus;
  message: string;
  onSignIn: (email: string) => Promise<{ error: string | null }>;
  onSignOut: () => Promise<void>;
  onSynchronize: () => Promise<void>;
}

const STATUS_LABELS: Record<CloudSyncStatus, string> = {
  unconfigured: "未配置",
  "signed-out": "未登录",
  syncing: "同步中",
  synced: "已同步",
  offline: "离线，等待网络",
  error: "同步失败",
};

export default function CloudSyncPanel({
  configured,
  email,
  status,
  message,
  onSignIn,
  onSignOut,
  onSynchronize,
}: CloudSyncPanelProps) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = input.trim();
    if (!normalized) return;
    setSubmitting(true);
    await onSignIn(normalized);
    setSubmitting(false);
  };

  return (
    <section className="cloud-sync-panel" aria-label="云端同步">
      <div className="cloud-sync-heading">
        {configured ? <Cloud size={18} /> : <CloudOff size={18} />}
        <div>
          <strong>云端同步</strong>
          <p>{configured ? STATUS_LABELS[status] : "配置后可在手机和桌面同步"}</p>
        </div>
      </div>
      {!configured && <p className="cloud-sync-help">此设备仍会保留本地进度。配置免费 Supabase 后再开启同步。</p>}
      {configured && !email && (
        <form className="cloud-sign-in" onSubmit={(event) => void submit(event)}>
          <input
            type="email"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="用于同步的邮箱"
            autoComplete="email"
            required
          />
          <button type="submit" className="quiet-button compact" disabled={submitting}>
            <LogIn size={15} />
            登录
          </button>
        </form>
      )}
      {configured && email && (
        <div className="cloud-sync-actions">
          <span title={email}>{email}</span>
          <button type="button" className="icon-button" aria-label="立即同步" title="立即同步" onClick={() => void onSynchronize()}>
            <RefreshCw size={16} />
          </button>
          <button type="button" className="icon-button" aria-label="退出云端账号" title="退出云端账号" onClick={() => void onSignOut()}>
            <LogOut size={16} />
          </button>
        </div>
      )}
      {message && <p className="cloud-sync-message" role="status">{message}</p>}
    </section>
  );
}
