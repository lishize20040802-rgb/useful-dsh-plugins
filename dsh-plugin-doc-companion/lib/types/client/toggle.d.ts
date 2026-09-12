import type { DocCompanionLocaleKey } from './locales';
/** Props injected by the slot framework (locale) + the register inject face. */
export interface ToggleProps {
    t?: (key: DocCompanionLocaleKey, params?: Record<string, unknown>) => string;
    /** Open the details column (injected from the register's inject face). */
    openPanel?: () => void;
}
export declare function DocToggle(props: ToggleProps): JSX.Element;
