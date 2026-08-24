import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "desktop-launcher";
/** Services required by the node half (settings is optional-lazy). */
export declare const inject: string[];
/** The settings namespace id the desktop shell reads at launch. */
export declare const NAMESPACE: SettingsNamespace;
/** Default bind host the desktop shell serves on. */
export declare const DEFAULT_HOST = "127.0.0.1";
/** Default port the desktop shell serves on. */
export declare const DEFAULT_PORT = 3080;
/** Validated configuration shape (schema output contract). */
export interface DesktopLauncherConfig {
    /** Bind host for the desktop-served web UI (loopback only). */
    host: string;
    /** Listen port for the desktop-served web UI. */
    port: number;
    /** Open the web UI in the default browser when started from the shell. */
    autoOpen: boolean;
}
export declare const Config: z<Schemastery.ObjectS<{
    host: z<string, string>;
    port: z<number, number>;
    autoOpen: z<boolean, boolean>;
}>, Schemastery.ObjectT<{
    host: z<string, string>;
    port: z<number, number>;
    autoOpen: z<boolean, boolean>;
}>>;
/** Normalize and validate raw plugin configuration (exported for tests). */
export declare function normalizeConfig(raw: unknown): DesktopLauncherConfig;
export declare function apply(ctx: Context, rawConfig: unknown): void;
