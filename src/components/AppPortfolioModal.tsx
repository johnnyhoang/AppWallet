import React, { useState, useMemo, useEffect } from 'react';
import {
  ExternalLinkIcon,
  RefreshIcon,
  EditIcon,
  TrashIcon,
  PlusIcon,
  ShareIcon,
} from './icons';
import { ShareAppsModal } from './ShareAppsModal';
import type { AppProject, BacklogItem } from '../data/mappers';
import { interpretHealth } from '../utils/health';
import { supabase } from '../utils/supabaseClient';
import { appProjectToRow, backlogItemToRow } from '../data/mappers';
import { newId } from '../utils/ids';

interface AppPortfolioModalProps {
  app: AppProject;
  canEdit: boolean;
  initialTab?: string;
  onClose: () => void;
  onUpdateApp: (updatedApp: AppProject) => void;
  onDeleteApp: (appId: string) => void;
  onBacklogChange: (backlog: BacklogItem[]) => void;
}

const GRADIENTS = [
  'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  'linear-gradient(135deg, #f97316 0%, #eab308 100%)',
];

function getAppGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

function getAppInitials(title: string): string {
  if (!title) return 'APP';
  const parts = title.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return title.slice(0, 2).toUpperCase();
}

function getFaviconCandidates(url?: string, id?: string): string[] {
  const candidates: string[] = [];
  if (id) {
    candidates.push(`/favicons/${id}.svg`);
  }
  if (url && url.trim()) {
    try {
      const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
      const parsed = new URL(formattedUrl);
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1' && parsed.hostname.includes('.')) {
        candidates.push(`${parsed.origin}/favicon.svg`);
        candidates.push(`${parsed.origin}/favicon.ico`);
        candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`);
      }
    } catch {
      // ignore
    }
  }
  return candidates;
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} style={{ color: '#f8fafc', fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          style={{
            background: 'rgba(99, 102, 241, 0.15)',
            color: '#a5b4fc',
            padding: '0.12rem 0.35rem',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '0.85em',
            border: '1px solid rgba(99, 102, 241, 0.25)',
          }}
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function SpecDocRenderer({ content, emptyText }: { content: string; emptyText?: string }) {
  if (!content || !content.trim()) {
    return (
      <div style={{ opacity: 0.6, fontStyle: 'italic', padding: '0.75rem 0', color: '#94a3b8' }}>
        {emptyText || 'Chưa có nội dung đặc tả.'}
      </div>
    );
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let inList = false;

  const flushList = (keyPrefix: string) => {
    if (inList && listItems.length > 0) {
      elements.push(
        <ul
          key={`ul-${keyPrefix}-${elements.length}`}
          style={{ paddingLeft: '1.25rem', marginBottom: '0.75rem', lineHeight: '1.65' }}
        >
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(`${index}`);
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(`${index}`);
      elements.push(
        <h1
          key={index}
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#60a5fa',
            paddingBottom: '0.35rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            marginTop: index === 0 ? '0' : '1.25rem',
            marginBottom: '0.65rem',
            letterSpacing: '-0.01em',
          }}
        >
          {formatInline(trimmed.substring(2))}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(`${index}`);
      elements.push(
        <h2
          key={index}
          style={{
            fontSize: '1.05rem',
            fontWeight: 700,
            color: '#38bdf8',
            marginTop: '1.25rem',
            marginBottom: '0.5rem',
            letterSpacing: '-0.01em',
          }}
        >
          {formatInline(trimmed.substring(3))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(`${index}`);
      elements.push(
        <h3
          key={index}
          style={{
            fontSize: '0.95rem',
            fontWeight: 600,
            color: '#a7f3d0',
            marginTop: '0.95rem',
            marginBottom: '0.35rem',
          }}
        >
          {formatInline(trimmed.substring(4))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      listItems.push(
        <li key={index} style={{ marginBottom: '0.3rem', color: '#cbd5e1' }}>
          {formatInline(trimmed.substring(2))}
        </li>
      );
      return;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      flushList(`${index}`);
      const text = trimmed.replace(/^\d+\.\s/, '');
      const numMatch = trimmed.match(/^\d+\./);
      elements.push(
        <div
          key={index}
          style={{
            display: 'flex',
            gap: '0.45rem',
            marginBottom: '0.45rem',
            lineHeight: '1.6',
          }}
        >
          <span style={{ fontWeight: 700, color: '#818cf8', minWidth: '1.2rem' }}>
            {numMatch ? numMatch[0] : ''}
          </span>
          <span style={{ color: '#cbd5e1' }}>{formatInline(text)}</span>
        </div>
      );
      return;
    }

    flushList(`${index}`);
    elements.push(
      <p key={index} style={{ marginBottom: '0.55rem', color: '#cbd5e1', lineHeight: '1.65' }}>
        {formatInline(trimmed)}
      </p>
    );
  });

  flushList('final');

  return <div style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: '1.65' }}>{elements}</div>;
}

const I18N = {
  vi: {
    specsTab: 'Đặc Tả',
    settingsTab: 'Cấu Hình & Quản Lý',
    permissionLabel: 'Quyền hạn',
    permissionAdmin: 'Admin / Toàn quyền',
    permissionViewer: 'Viewer / Chỉ xem',
    launchApp: 'Mở Trực Tiếp',
    healthCheck: 'Check Health',
    checking: 'Đang check...',
    verifiedBadge: 'Đã xác minh',
    manualCheck: 'Xác Nhận Check',
    manualChecked: 'Đã Check Tay',
    shareBtn: 'Chia Sẻ',
    sec1Overview: '1. Tổng quan & Thông tin hệ thống',
    appIntro: 'Giới Thiệu Ứng Dụng',
    noDesc: 'Chưa có mô tả chi tiết cho ứng dụng này.',
    openWebApp: 'Truy cập Web App',
    editDetails: 'Chỉnh Sửa Thông Tin',
    author: 'Tác giả',
    hosting: 'Hạ tầng',
    category: 'Danh mục',
    database: 'Cơ sở dữ liệu',
    status: 'Trạng thái',
    priority: 'Ưu tiên',
    repo: 'GitHub Repo',
    techNotesTitle: 'Kiến Trúc & Ghi Chú Kỹ Thuật',
    sec2Roadmap: '2. Lộ trình & Nhiệm vụ',
    tasksSummary: (completed: number, total: number, percent: number) =>
      `${completed}/${total} task (${percent}%)`,
    addTaskPlaceholder: 'Nhập tên nhiệm vụ / tính năng mới cần làm...',
    addTaskBtn: 'Thêm Task',
    noBacklog: 'Dự án này hiện chưa có nhiệm vụ backlog nào.',
    sec3Specs: '3. Đặc tả chi tiết',
    specUpdated: (date: string) => `Cập nhật: ${date}`,
    editSpecBtn: 'Sửa Đặc Tả',
    noSpecText: 'Chưa có tài liệu đặc tả tiếng Việt cho dự án này.',
    // Form labels
    formTitle: 'Cấu Hình & Quản Lý Toàn Diện Ứng Dụng',
    savedSuccess: 'Đã lưu thay đổi thành công!',
    secForm1: '1. Thông Tin Nhận Diện',
    formAppName: 'Tên ứng dụng:',
    formAuthor: 'Tác giả / Developer:',
    formCategory: 'Danh mục (Category):',
    secForm2: '2. Hạ Tầng & Kết Nối Môi Trường',
    formFrontendUrl: 'URL Frontend Web App:',
    formHosting: 'Hosting / Vercel Project:',
    formGithub: 'GitHub Repository URL:',
    secForm3: '3. Trạng Thái & Cơ Sở Dữ Liệu',
    formDb: 'Database Supabase:',
    formStatus: 'Trạng thái (Status):',
    formPriority: 'Mức độ ưu tiên:',
    secForm4: '4. Mô Tả & Ghi Chú Kỹ Thuật',
    formDesc: 'Mô tả tóm tắt ứng dụng:',
    formTechNotes: 'Ghi chú kỹ thuật & Kiến trúc (Tech Notes):',
    secForm5: '5. Tài Liệu Đặc Tả Kỹ Thuật (SRS Markdown)',
    formSpecVi: 'Đặc tả Tiếng Việt (Markdown):',
    formSpecEn: 'Đặc tả English (Markdown):',
    deleteAppBtn: 'Xóa Vĩnh Viễn Ứng Dụng',
    confirmDelete: (title: string) => `Bạn có chắc muốn xóa vĩnh viễn ứng dụng "${title}"?`,
    backToDetailsBtn: 'Quay lại xem đặc tả',
    saveAllBtn: 'Lưu Tất Cả Thay Đổi',
    savingBtn: 'Đang lưu...',
    healthStatus: {
      healthy: 'Healthy',
      failed: 'Down',
      checking: 'Checking...',
      unknown: 'Chưa check',
    },
  },
  en: {
    specsTab: 'Specifications',
    settingsTab: 'Settings & Config',
    permissionLabel: 'Role',
    permissionAdmin: 'Admin / Full Access',
    permissionViewer: 'Viewer / Read-only',
    launchApp: 'Launch App',
    healthCheck: 'Health Check',
    checking: 'Checking...',
    verifiedBadge: 'Verified',
    manualCheck: 'Verify App',
    manualChecked: 'Verified',
    shareBtn: 'Share',
    sec1Overview: '1. Overview & System Info',
    appIntro: 'Application Overview',
    noDesc: 'No detailed description available for this application.',
    openWebApp: 'Open Web App',
    editDetails: 'Edit Details',
    author: 'Author',
    hosting: 'Hosting',
    category: 'Category',
    database: 'Database',
    status: 'Status',
    priority: 'Priority',
    repo: 'GitHub Repo',
    techNotesTitle: 'Architecture & Technical Notes',
    sec2Roadmap: '2. Roadmap & Tasks',
    tasksSummary: (completed: number, total: number, percent: number) =>
      `${completed}/${total} tasks (${percent}%)`,
    addTaskPlaceholder: 'Enter new backlog task / feature title...',
    addTaskBtn: 'Add Task',
    noBacklog: 'No backlog tasks for this project yet.',
    sec3Specs: '3. Technical Specifications',
    specUpdated: (date: string) => `Updated: ${date}`,
    editSpecBtn: 'Edit Specs',
    noSpecText: 'No English specification available for this project.',
    // Form labels
    formTitle: 'Application Configuration & Management',
    savedSuccess: 'Changes saved successfully!',
    secForm1: '1. Identification & Identity',
    formAppName: 'Application Name:',
    formAuthor: 'Author / Developer:',
    formCategory: 'Category:',
    secForm2: '2. Infrastructure & Environment',
    formFrontendUrl: 'Frontend Web App URL:',
    formHosting: 'Hosting / Vercel Project:',
    formGithub: 'GitHub Repository URL:',
    secForm3: '3. Status & Database',
    formDb: 'Database Supabase:',
    formStatus: 'Status:',
    formPriority: 'Priority:',
    secForm4: '4. Description & Technical Notes',
    formDesc: 'Application Summary Description:',
    formTechNotes: 'Technical Notes & Architecture:',
    secForm5: '5. Technical Specification (SRS Markdown)',
    formSpecVi: 'Vietnamese Specification (Markdown):',
    formSpecEn: 'English Specification (Markdown):',
    deleteAppBtn: 'Delete Application Permanently',
    confirmDelete: (title: string) => `Are you sure you want to permanently delete "${title}"?`,
    backToDetailsBtn: 'Back to Specifications',
    saveAllBtn: 'Save All Changes',
    savingBtn: 'Saving...',
    healthStatus: {
      healthy: 'Healthy',
      failed: 'Down',
      checking: 'Checking...',
      unknown: 'Unchecked',
    },
  },
};

export function AppPortfolioModal({
  app,
  canEdit,
  initialTab = 'details',
  onClose,
  onUpdateApp,
  onDeleteApp,
  onBacklogChange,
}: AppPortfolioModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'settings'>(
    initialTab === 'settings' ? 'settings' : 'details'
  );
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [newBacklogTitle, setNewBacklogTitle] = useState('');

  // Edit form state for admin settings tab
  const [formData, setFormData] = useState<AppProject>({ ...app });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('');

  const strings = I18N[lang];

  useEffect(() => {
    setFormData({ ...app });
  }, [app]);

  const candidates = useMemo(() => getFaviconCandidates(app.frontendUrl, app.id), [app.frontendUrl, app.id]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const initials = getAppInitials(app.title);
  const bgGradient = getAppGradient(app.title + app.id);
  const currentSrc = candidateIndex < candidates.length ? candidates[candidateIndex] : null;

  const backlog = app.backlog || [];
  const completedCount = backlog.filter((b) => b.isCompleted).length;
  const progressPercent = backlog.length > 0 ? Math.round((completedCount / backlog.length) * 100) : 0;

  const handleCheckHealth = async () => {
    if (!app.frontendUrl) return;
    setIsCheckingHealth(true);

    const nowTimeStr = new Date().toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    let status: 'healthy' | 'failed' = 'failed';
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(app.frontendUrl)}`;
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(9000) });
      if (res.ok) {
        const data = await res.json();
        const httpCode = data.status?.http_code;
        status = interpretHealth(httpCode) === 'healthy' ? 'healthy' : 'failed';
      }
    } catch {
      status = 'failed';
    }

    const updated: AppProject = {
      ...app,
      healthStatus: status,
      healthCheckedAt: nowTimeStr,
    };

    try {
      const row = appProjectToRow(updated);
      await supabase.from('aw_app_projects').update(row).eq('id', app.id);
      onUpdateApp(updated);
      setFormData(updated);
    } catch (err) {
      console.error('Lỗi lưu kết quả health check:', err);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const handleToggleManualCheck = async () => {
    if (!canEdit) return;
    const nextChecked = !app.manualChecked;
    const nextCheckedAt = nextChecked
      ? new Date().toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';

    const updated: AppProject = {
      ...app,
      manualChecked: nextChecked,
      manualCheckedAt: nextCheckedAt,
    };

    try {
      const row = appProjectToRow(updated);
      const { error } = await supabase.from('aw_app_projects').update(row).eq('id', app.id);
      if (error) throw error;
      onUpdateApp(updated);
      setFormData(updated);
    } catch (err: any) {
      alert('Lỗi cập nhật xác nhận kiểm tra: ' + (err?.message || ''));
    }
  };

  const handleToggleBacklog = async (item: BacklogItem) => {
    if (!canEdit) return;
    const nextCompleted = !item.isCompleted;
    const nextBacklog = backlog.map((b) =>
      b.id === item.id ? { ...b, isCompleted: nextCompleted } : b
    );

    try {
      await supabase
        .from('aw_app_backlog_items')
        .update({ is_completed: nextCompleted })
        .eq('id', item.id);
      onBacklogChange(nextBacklog);
    } catch (err: any) {
      alert('Lỗi cập nhật task: ' + (err?.message || ''));
    }
  };

  const handleAddBacklog = async () => {
    if (!canEdit || !newBacklogTitle.trim()) return;
    const newItem: BacklogItem = {
      id: newId('bl'),
      title: newBacklogTitle.trim(),
      isCompleted: false,
    };
    const nextBacklog = [...backlog, newItem];

    try {
      const row = backlogItemToRow(newItem, app.id);
      await supabase.from('aw_app_backlog_items').insert(row);
      onBacklogChange(nextBacklog);
      setNewBacklogTitle('');
    } catch (err: any) {
      alert('Lỗi thêm task: ' + (err?.message || ''));
    }
  };

  const handleDeleteBacklog = async (itemId: string) => {
    if (!canEdit) return;
    const nextBacklog = backlog.filter((b) => b.id !== itemId);
    try {
      await supabase.from('aw_app_backlog_items').delete().eq('id', itemId);
      onBacklogChange(nextBacklog);
    } catch (err: any) {
      alert('Lỗi xóa task: ' + (err?.message || ''));
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !formData.title?.trim()) return;
    setIsSaving(true);
    setSaveSuccessMessage('');

    try {
      const updated: AppProject = {
        ...app,
        ...formData,
        title: formData.title.trim(),
        author: formData.author?.trim() || '',
        hosting: formData.hosting?.trim() || '',
        github: formData.github?.trim() || '',
        techStack: formData.techStack || '',
        category: formData.category || 'Web App',
        database: formData.database || 'JH Supabase NoData',
        status: formData.status || 'Development',
        priority: formData.priority || 'Medium',
        frontendUrl: formData.frontendUrl?.trim() || '',
        description: formData.description || '',
        techNotes: formData.techNotes || '',
        specVi: formData.specVi || '',
        specEn: formData.specEn || '',
        specUpdatedAt: new Date().toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      const row = appProjectToRow(updated);
      const { error } = await supabase.from('aw_app_projects').upsert(row);
      if (error) throw error;

      onUpdateApp(updated);
      setFormData(updated);
      setSaveSuccessMessage(strings.savedSuccess);
      setTimeout(() => setSaveSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Save project error:', err);
      alert('Lỗi lưu thông tin app: ' + (err?.message || 'Không rõ nguyên nhân'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="portfolio-modal-overlay" onClick={onClose}>
      <div className="portfolio-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header / Hero Bar */}
        <div className="portfolio-hero-header">
          <div className="portfolio-hero-left">
            <div className="portfolio-icon" style={{ background: bgGradient }}>
              {currentSrc ? (
                <img
                  key={currentSrc}
                  src={currentSrc}
                  alt={app.title}
                  onError={() => setCandidateIndex((prev) => prev + 1)}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    padding: '8px',
                    background: 'rgba(15, 23, 42, 0.75)',
                    backdropFilter: 'blur(4px)',
                    borderRadius: '16px',
                  }}
                />
              ) : (
                initials
              )}
            </div>

            <div className="portfolio-title-meta">
              <div className="portfolio-title-row">
                <h1 className="portfolio-app-title">{app.title}</h1>
                <span className="portfolio-status-pill">{app.status}</span>
                {app.priority && (
                  <span className={`portfolio-priority-pill ${app.priority.toLowerCase()}`}>
                    {app.priority}
                  </span>
                )}
              </div>

              <div className="portfolio-meta-tags">
                <span className="portfolio-category-badge">🏷️ {app.category || 'Web App'}</span>
                <span
                  className="portfolio-category-badge"
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                  }}
                >
                  👤 {app.author || 'johnnyhoang'}
                </span>
                {app.hosting && (
                  <span
                    className="portfolio-category-badge"
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    ☁️ {app.hosting}
                  </span>
                )}
                {app.database && (
                  <span className="portfolio-db-badge">🗄️ {app.database}</span>
                )}
                <div
                  className="portfolio-health-tag"
                  title={app.healthCheckedAt ? `Checked: ${app.healthCheckedAt}` : 'Unchecked'}
                >
                  <span className={`store-health-dot ${app.healthStatus || 'unknown'}`} />
                  <span>
                    {app.healthStatus === 'healthy'
                      ? strings.healthStatus.healthy
                      : app.healthStatus === 'failed'
                      ? strings.healthStatus.failed
                      : app.healthStatus === 'checking'
                      ? strings.healthStatus.checking
                      : strings.healthStatus.unknown}
                  </span>
                </div>
                {app.manualChecked && (
                  <span
                    className="portfolio-verified-badge"
                    title={`Check: ${app.manualCheckedAt || 'N/A'}`}
                  >
                    ✓ {strings.verifiedBadge} {app.manualCheckedAt ? `(${app.manualCheckedAt})` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="portfolio-hero-actions">
            {app.frontendUrl && (
              <a
                href={app.frontendUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary portfolio-btn-launch"
              >
                <span>{strings.launchApp}</span>
                <ExternalLinkIcon size={15} />
              </a>
            )}

            <button
              className="btn btn-secondary portfolio-btn-health"
              onClick={handleCheckHealth}
              disabled={isCheckingHealth || !app.frontendUrl}
              title="Health check"
            >
              <RefreshIcon size={14} className={isCheckingHealth ? 'spin-icon' : ''} />
              <span>{isCheckingHealth ? strings.checking : strings.healthCheck}</span>
            </button>

            {canEdit && (
              <button
                className="btn btn-secondary portfolio-btn-verify"
                onClick={handleToggleManualCheck}
                title="Verify"
              >
                <span>{app.manualChecked ? `✓ ${strings.manualChecked}` : `○ ${strings.manualCheck}`}</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary portfolio-btn-share"
              onClick={() => setIsShareModalOpen(true)}
              title={strings.shareBtn}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ShareIcon size={15} />
              <span>{strings.shareBtn}</span>
            </button>

            <button className="portfolio-close-btn" onClick={onClose} title="Đóng modal (Esc)">
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Bar with Unified Global Language Switcher */}
        <div className="portfolio-nav-bar">
          <div className="portfolio-tabs-list">
            <button
              className={`portfolio-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              <span>📄</span>
              <span>{strings.specsTab}</span>
              {backlog.length > 0 && (
                <span className="portfolio-tab-badge">
                  {completedCount}/{backlog.length} task
                </span>
              )}
            </button>

            {canEdit && (
              <button
                className={`portfolio-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <span>⚙️</span>
                <span>{strings.settingsTab}</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Global Language Switcher */}
            <div className="portfolio-lang-segmented-control">
              <button
                type="button"
                className={`portfolio-lang-seg-btn ${lang === 'vi' ? 'active' : ''}`}
                onClick={() => setLang('vi')}
                title="Tiếng Việt toàn trang"
              >
                🇻🇳 Tiếng Việt
              </button>
              <button
                type="button"
                className={`portfolio-lang-seg-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
                title="English whole page"
              >
                🇬🇧 English
              </button>
            </div>

            <div className="portfolio-quick-stats">
              <span className="portfolio-stat-text">
                {strings.permissionLabel}: <strong>{canEdit ? strings.permissionAdmin : strings.permissionViewer}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body - Clean Minimalist Layout without redundant nested boxes */}
        <div className="portfolio-body">
          {/* UNIFIED SINGLE TAB: ĐẶC TẢ (OVERVIEW + ROADMAP/BACKLOG + SPECS) */}
          {activeTab === 'details' && (
            <div className="portfolio-tab-content">
              {/* 1. SECTION: OVERVIEW & SYSTEM INFO */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div className="portfolio-overview-split">
                  {/* Left: Description & Quick Actions */}
                  <div className="portfolio-desc-block">
                    <h3 className="portfolio-section-title">
                      <span>📖</span> {strings.appIntro}
                    </h3>
                    <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.65, margin: 0 }}>
                      {app.description || strings.noDesc}
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                      {app.frontendUrl && (
                        <a
                          href={app.frontendUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-primary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <span>{strings.openWebApp}</span>
                          <ExternalLinkIcon size={13} />
                        </a>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setActiveTab('settings')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          <EditIcon size={13} />
                          <span>{strings.editDetails}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Clean Flat Meta Information List */}
                  <div className="portfolio-meta-grid">
                    <div className="portfolio-meta-item">
                      <span className="meta-label">{strings.author}</span>
                      <span className="meta-value">{app.author || 'johnnyhoang'}</span>
                    </div>

                    <div className="portfolio-meta-item">
                      <span className="meta-label">{strings.hosting}</span>
                      <span className="meta-value">{app.hosting || 'Vercel'}</span>
                    </div>

                    <div className="portfolio-meta-item">
                      <span className="meta-label">{strings.category}</span>
                      <span className="meta-value">{app.category || 'Web App'}</span>
                    </div>

                    <div className="portfolio-meta-item">
                      <span className="meta-label">{strings.database}</span>
                      <span className="meta-value" style={{ color: '#38bdf8' }}>
                        {app.database || 'Supabase'}
                      </span>
                    </div>

                    <div className="portfolio-meta-item">
                      <span className="meta-label">{strings.status}</span>
                      <span className="meta-value">
                        <span className="portfolio-status-pill">{app.status}</span>
                      </span>
                    </div>

                    <div className="portfolio-meta-item">
                      <span className="meta-label">{strings.priority}</span>
                      <span className="meta-value">{app.priority || 'Medium'}</span>
                    </div>

                    {app.github && (
                      <div className="portfolio-meta-item" style={{ gridColumn: 'span 2' }}>
                        <span className="meta-label">{strings.repo}</span>
                        <span className="meta-value">
                          <a
                            href={app.github}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: '#60a5fa',
                              textDecoration: 'underline',
                              fontSize: '0.82rem',
                            }}
                          >
                            {app.github.replace('https://github.com/', '')} ↗
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Architecture & Tech Notes */}
                {app.techNotes && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>💡</span> {strings.techNotesTitle}
                    </h4>
                    <SpecDocRenderer content={app.techNotes} />
                  </div>
                )}
              </div>

              {/* 2. SECTION: ROADMAP & BACKLOG */}
              <div style={{ marginBottom: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 className="portfolio-section-title" style={{ margin: 0 }}>
                    <span>🚀</span> {strings.sec2Roadmap} ({backlog.length} task)
                  </h3>

                  <div className="portfolio-progress-chip">
                    {strings.tasksSummary(completedCount, backlog.length, progressPercent)}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="portfolio-progress-bar-wrapper" style={{ margin: '0.4rem 0 0.85rem 0' }}>
                  <div className="portfolio-progress-bar-track">
                    <div
                      className="portfolio-progress-bar-fill"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Add Task Input (Admin Only) */}
                {canEdit && (
                  <div className="portfolio-add-task-row" style={{ marginBottom: '0.75rem' }}>
                    <input
                      type="text"
                      className="input-text"
                      placeholder={strings.addTaskPlaceholder}
                      value={newBacklogTitle}
                      onChange={(e) => setNewBacklogTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddBacklog()}
                      style={{ padding: '0.5rem 0.85rem', fontSize: '0.88rem' }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={handleAddBacklog}>
                      <PlusIcon size={14} />
                      <span>{strings.addTaskBtn}</span>
                    </button>
                  </div>
                )}

                {/* Task List */}
                {backlog.length === 0 ? (
                  <p style={{ color: '#94a3b8', fontSize: '0.84rem', fontStyle: 'italic', margin: '0.4rem 0' }}>
                    {strings.noBacklog}
                  </p>
                ) : (
                  <div className="portfolio-backlog-full-list">
                    {backlog.map((item) => (
                      <div
                        key={item.id}
                        className={`portfolio-backlog-row ${item.isCompleted ? 'done' : ''}`}
                        onClick={() => canEdit && handleToggleBacklog(item)}
                        style={{ cursor: canEdit ? 'pointer' : 'default' }}
                      >
                        <div className="backlog-row-left">
                          <input
                            type="checkbox"
                            checked={item.isCompleted}
                            onChange={() => canEdit && handleToggleBacklog(item)}
                            disabled={!canEdit}
                            style={{
                              cursor: canEdit ? 'pointer' : 'default',
                              width: '16px',
                              height: '16px',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <span className="backlog-row-title">{item.title}</span>
                        </div>

                        {canEdit && (
                          <button
                            className="btn-icon-sm danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBacklog(item.id);
                            }}
                            title="Xóa nhiệm vụ"
                          >
                            <TrashIcon size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. SECTION: SRS SPECIFICATION */}
              <div style={{ paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 className="portfolio-section-title" style={{ margin: 0 }}>
                    <span>📝</span> {strings.sec3Specs}
                  </h3>

                  <div className="portfolio-spec-meta">
                    <span className="portfolio-spec-date">
                      📅 {strings.specUpdated(app.specUpdatedAt || '27/09/2026')}
                    </span>
                    {canEdit && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveTab('settings')}
                        title="Chỉnh sửa văn bản đặc tả"
                      >
                        <EditIcon size={13} />
                        <span>{strings.editSpecBtn}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Flat Spec Renderer directly without wrapper card */}
                <div>
                  <SpecDocRenderer
                    content={lang === 'en' ? (app.specEn || '') : (app.specVi || '')}
                    emptyText={strings.noSpecText}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ADMIN SETTINGS & CONFIGURATION TAB */}
          {activeTab === 'settings' && canEdit && (
            <div className="portfolio-tab-content">
              <form onSubmit={handleSaveForm}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '0.85rem' }}>
                    <span>⚙️</span> {strings.formTitle}
                  </h3>

                  {saveSuccessMessage && (
                    <div className="portfolio-success-alert">✓ {saveSuccessMessage}</div>
                  )}

                  {/* Section 1: Thông tin cơ bản */}
                  <div className="form-section-title">
                    <span>🏷️</span> {strings.secForm1}
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>{strings.formAppName}</label>
                      <input
                        type="text"
                        className="input-text"
                        value={formData.title || ''}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>{strings.formAuthor}</label>
                      <input
                        type="text"
                        className="input-text"
                        value={formData.author || ''}
                        onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                        placeholder="VD: johnnyhoang"
                      />
                    </div>

                    <div className="form-group">
                      <label>{strings.formCategory}</label>
                      <input
                        type="text"
                        className="input-text"
                        value={formData.category || ''}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Section 2: Hạ tầng & Kết nối */}
                  <div className="form-section-title">
                    <span>🌐</span> {strings.secForm2}
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>{strings.formFrontendUrl}</label>
                      <input
                        type="url"
                        className="input-text"
                        value={formData.frontendUrl || ''}
                        onChange={(e) => setFormData({ ...formData, frontendUrl: e.target.value })}
                        placeholder="https://jwallet.minkoi.org"
                      />
                    </div>

                    <div className="form-group">
                      <label>{strings.formHosting}</label>
                      <input
                        type="text"
                        className="input-text"
                        value={formData.hosting || ''}
                        onChange={(e) => setFormData({ ...formData, hosting: e.target.value })}
                        placeholder="VD: Vercel (token-wallet)"
                      />
                    </div>

                    <div className="form-group">
                      <label>{strings.formGithub}</label>
                      <input
                        type="url"
                        className="input-text"
                        value={formData.github || ''}
                        onChange={(e) => setFormData({ ...formData, github: e.target.value })}
                        placeholder="https://github.com/johnnyhoang/..."
                      />
                    </div>
                  </div>

                  {/* Section 3: Cấu hình hệ thống */}
                  <div className="form-section-title">
                    <span>🗄️</span> {strings.secForm3}
                  </div>
                  <div className="form-grid-3">
                    <div className="form-group">
                      <label>{strings.formDb}</label>
                      <select
                        className="input-select"
                        value={formData.database || 'JH Supabase NoData'}
                        onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                      >
                        <option value="JH Supabase Data 1">JH Supabase Data 1</option>
                        <option value="JH Supabase Data 2">JH Supabase Data 2</option>
                        <option value="JH Supabase NoData">JH Supabase NoData</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>{strings.formStatus}</label>
                      <select
                        className="input-select"
                        value={formData.status || 'Development'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      >
                        <option value="Production">Production</option>
                        <option value="Development">Development</option>
                        <option value="Staging">Staging</option>
                        <option value="Planning">Planning</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>{strings.formPriority}</label>
                      <select
                        className="input-select"
                        value={formData.priority || 'Medium'}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>

                  {/* Section 4: Mô tả & Tech notes */}
                  <div className="form-section-title">
                    <span>💡</span> {strings.secForm4}
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>{strings.formDesc}</label>
                      <textarea
                        className="input-text"
                        rows={3}
                        value={formData.description || ''}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Mô tả mục đích, người dùng mục tiêu, tính năng chính..."
                      />
                    </div>

                    <div className="form-group">
                      <label>{strings.formTechNotes}</label>
                      <textarea
                        className="input-text"
                        rows={3}
                        value={formData.techNotes || ''}
                        onChange={(e) => setFormData({ ...formData, techNotes: e.target.value })}
                        placeholder="Ghi chú về stack, port, env, auth..."
                      />
                    </div>
                  </div>

                  {/* Section 5: Đặc tả SRS Markdown */}
                  <div className="form-section-title">
                    <span>📝</span> {strings.secForm5}
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label>{strings.formSpecVi}</label>
                      <textarea
                        className="input-text"
                        rows={8}
                        value={formData.specVi || ''}
                        onChange={(e) => setFormData({ ...formData, specVi: e.target.value })}
                        placeholder="# 1. Giới thiệu tổng quan..."
                      />
                    </div>

                    <div className="form-group">
                      <label>{strings.formSpecEn}</label>
                      <textarea
                        className="input-text"
                        rows={8}
                        value={formData.specEn || ''}
                        onChange={(e) => setFormData({ ...formData, specEn: e.target.value })}
                        placeholder="# 1. Overview and Architecture..."
                      />
                    </div>
                  </div>

                  {/* Form Actions footer */}
                  <div
                    style={{
                      marginTop: '1.5rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (window.confirm(strings.confirmDelete(app.title))) {
                          onDeleteApp(app.id);
                        }
                      }}
                    >
                      <TrashIcon size={14} />
                      <span>{strings.deleteAppBtn}</span>
                    </button>

                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setActiveTab('details')}
                      >
                        {strings.backToDetailsBtn}
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
                        {isSaving ? strings.savingBtn : strings.saveAllBtn}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>

        {isShareModalOpen && (
          <ShareAppsModal
            allApps={[app]}
            initialSelectedAppIds={[app.id]}
            onClose={() => setIsShareModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
