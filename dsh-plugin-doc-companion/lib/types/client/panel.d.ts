import type { DocCompanionLocaleKey } from './locales';
/** Minimal shape of the sessions snapshot the panel reads. */
export interface SessionsSnapshot {
    current?: string;
}
/** Props injected by the slot framework (locale + global sessions hook). */
export interface PanelProps {
    t?: (key: DocCompanionLocaleKey, params?: Record<string, unknown>) => string;
    /** Global sessions hook (root scope); gives the current session id. */
    useSessions?: <T>(selector: (snapshot: SessionsSnapshot) => T) => T;
}
export declare function DocPanel(props: PanelProps): JSX.Element | null;
