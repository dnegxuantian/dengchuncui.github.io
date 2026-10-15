import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import css from './CommunitySettings.module.css';
const COMMUNITY_URL = 'https://dshcommunity.com';
const copy = {
    zh: {
        optional: '可选功能', title: 'DSH Community', intro: '分享聚合 Token 总量，参与公开排行。本地 Usage 始终独立可用。',
        openSite: '访问 dshcommunity.com ↗', checking: '检查中', unavailable: '暂不可用', connected: '已连接', private: '未加入',
        serviceUnavailable: 'Community 本地服务暂不可用', serviceHint: '请确认插件已正确安装并重启 DSH；本地 Usage 数据不受影响。', retry: '重试',
        join: '使用 GitHub 加入', joinHint: 'GitHub 身份绑定与数据上传是两个独立步骤。', connect: '连接 GitHub',
        browserHint: '浏览器没有自动打开？访问 Community 并输入', configHint: '部署 Community 后，请在 dsh-usage 插件配置中设置 communityUrl。',
        sync: 'Community 同步', never: '从未同步', last: '上次同步', cadence: '每 30 分钟上传绝对聚合快照', enable: '开启 Community 同步',
        syncing: '同步中…', syncNow: '立即同步', profile: '查看主页', signOut: '退出登录', signOutHint: '仅断开当前 DSH，不删除账号或已上传数据。', privacy: '不会上传提示词、消息、路径、主机名、费用或未归一化的私有模型名称。', failed: 'Community 请求失败。',
    },
    en: {
        optional: 'OPTIONAL', title: 'DSH Community', intro: 'Share aggregate token totals for public rankings. Local Usage always works independently.',
        openSite: 'Visit dshcommunity.com ↗', checking: 'Checking', unavailable: 'Unavailable', connected: 'Connected', private: 'Private',
        serviceUnavailable: 'Local Community service is unavailable', serviceHint: 'Check that the plugin is installed and restart DSH. Local Usage data is unaffected.', retry: 'Retry',
        join: 'Join with GitHub', joinHint: 'Your GitHub identity is linked separately from uploading data.', connect: 'Connect GitHub',
        browserHint: 'Browser not open? Visit the Community and enter', configHint: 'Set communityUrl in the dsh-usage plugin config after deploying the Community app.',
        sync: 'Community Sync', never: 'Never synced', last: 'Last synced', cadence: 'Absolute aggregate snapshots every 30 minutes', enable: 'Enable Community Sync',
        syncing: 'Syncing…', syncNow: 'Sync now', profile: 'View profile', signOut: 'Sign out', signOutHint: 'Disconnects this DSH only. Your account and uploaded data remain.', privacy: 'No prompts, messages, paths, hostnames, cost, or raw private model names are uploaded.', failed: 'Community request failed.',
    },
};
function currentLanguage() {
    const language = document.documentElement.lang || navigator.language;
    return language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}
function useCopy() {
    const [language, setLanguage] = useState(currentLanguage);
    useEffect(() => {
        const observer = new MutationObserver(() => { setLanguage(currentLanguage()); });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        return () => { observer.disconnect(); };
    }, []);
    return copy[language];
}
export function CommunitySettings({ ctx }) {
    const t = useCopy();
    const [status, setStatus] = useState();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const call = useCallback(async (operation) => {
        setBusy(true);
        setError(undefined);
        try {
            const remote = await operation();
            if (!remote.ok) {
                setError(remote.error.message);
                return undefined;
            }
            const result = remote.value;
            if (result.value !== undefined)
                setStatus(result.value);
            setError(result.ok ? undefined : result.error ?? t.failed);
            return result;
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : t.failed);
            return undefined;
        }
        finally {
            setBusy(false);
        }
    }, [t.failed]);
    const refresh = useCallback(() => call(() => ctx.remote.communityUsage.status({})), [call, ctx]);
    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => {
        if (status?.link === undefined)
            return;
        const timer = window.setInterval(() => { void call(() => ctx.remote.communityUsage.pollLink({})); }, 3_000);
        return () => { window.clearInterval(timer); };
    }, [call, ctx, status?.link]);
    const connect = async () => {
        const result = await call(() => ctx.remote.communityUsage.startLink({}));
        const uri = result?.value?.link?.verificationUri;
        if (uri !== undefined)
            window.open(uri, '_blank', 'noopener,noreferrer');
    };
    const lastSync = status?.lastSyncedAt === undefined ? t.never : `${t.last} ${new Date(status.lastSyncedAt).toLocaleString()}`;
    const unavailable = status === undefined && error !== undefined;
    const badge = busy && status === undefined ? t.checking : unavailable ? t.unavailable : status?.joined ? t.connected : t.private;
    const badgeClass = unavailable ? css.unavailable : status?.joined ? css.connected : css.private;
    return _jsxs("section", { className: css.card, "aria-labelledby": "dsh-community-title", children: [_jsxs("div", { className: css.heading, children: [_jsxs("div", { children: [_jsx("span", { className: css.eyebrow, children: t.optional }), _jsx("h3", { id: "dsh-community-title", children: t.title }), _jsx("p", { children: t.intro }), _jsx("a", { className: css.siteLink, href: COMMUNITY_URL, target: "_blank", rel: "noreferrer", children: t.openSite })] }), _jsx("span", { className: badgeClass, children: badge })] }), unavailable
                ? _jsxs("div", { className: css.unavailableRow, role: "alert", children: [_jsxs("div", { children: [_jsx("strong", { children: t.serviceUnavailable }), _jsx("span", { children: t.serviceHint }), _jsx("small", { children: error })] }), _jsx("button", { type: "button", disabled: busy, onClick: () => { void refresh(); }, children: t.retry })] })
                : _jsxs(_Fragment, { children: [status?.identity === undefined
                            ? _jsxs("div", { className: css.joinRow, children: [_jsxs("div", { children: [_jsx("strong", { children: t.join }), _jsx("span", { children: t.joinHint })] }), _jsx("button", { type: "button", disabled: busy || status === undefined || status.configured === false, onClick: () => { void connect(); }, children: t.connect })] })
                            : _jsxs("div", { className: css.identity, children: [_jsx("img", { src: status.identity.avatarUrl, alt: "" }), _jsxs("span", { children: [_jsx("strong", { children: status.identity.displayName }), _jsxs("small", { children: ["@", status.identity.githubLogin] })] }), _jsxs("div", { className: css.identityActions, children: [_jsx("a", { href: status.identity.profileUrl, target: "_blank", rel: "noreferrer", children: t.profile }), _jsx("button", { type: "button", title: t.signOutHint, disabled: busy, onClick: () => { void call(() => ctx.remote.communityUsage.signOut({})); }, children: t.signOut })] })] }), status?.link !== undefined ? _jsxs("p", { className: css.code, children: [t.browserHint, " ", _jsx("strong", { children: status.link.userCode }), "."] }) : null, status?.configured === false ? _jsx("p", { className: css.error, children: t.configHint }) : null, _jsxs("div", { className: css.syncRow, children: [_jsxs("div", { children: [_jsx("strong", { children: t.sync }), _jsxs("span", { children: [lastSync, " \u00B7 ", t.cadence] })] }), _jsxs("label", { className: css.switch, children: [_jsx("input", { type: "checkbox", checked: status?.syncEnabled ?? false, disabled: busy || !status?.joined, onChange: (event) => { void call(() => ctx.remote.communityUsage.setSync({ enabled: event.target.checked })); } }), _jsx("span", { "aria-hidden": true }), _jsx("span", { className: css.srOnly, children: t.enable })] })] }), status?.syncEnabled ? _jsx("button", { className: css.syncButton, type: "button", disabled: busy, onClick: () => { void call(() => ctx.remote.communityUsage.syncNow({})); }, children: busy || status.syncInProgress ? t.syncing : t.syncNow }) : null, error !== undefined || status?.lastError !== undefined ? _jsx("p", { className: css.error, role: "alert", children: error ?? status?.lastError }) : null] }), _jsx("p", { className: css.privacy, children: t.privacy })] });
}
