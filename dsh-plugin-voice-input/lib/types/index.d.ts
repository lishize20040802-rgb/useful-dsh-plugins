import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name — must match the row id in cordis.patch.yml. */
export declare const name = "voice-input";
/** Services required by the node half. */
export declare const inject: string[];
/** Default big-model streaming ASR endpoint (push-to-talk mode). */
export declare const DEFAULT_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
/** Default resource id: 豆包流式语音识别 1.0 小时版 (granted on this account). */
export declare const DEFAULT_RESOURCE_ID = "volc.bigasr.sauc.duration";
/** Default upstream timeout for one transcription (long clips need room). */
export declare const DEFAULT_TIMEOUT_MS = 120000;
/** Validated configuration shape (schema output contract). */
export interface VoiceInputConfig {
    appId: string;
    accessToken: string;
    resourceId: string;
    wsUrl: string;
    language: string;
    maxBytes: number;
    timeoutMs: number;
}
export declare const Config: z<Schemastery.ObjectS<{
    appId: z<string, string>;
    accessToken: z<string, string>;
    resourceId: z<string, string>;
    wsUrl: z<string, string>;
    language: z<string, string>;
    maxBytes: z<number, number>;
    timeoutMs: z<number, number>;
}>, Schemastery.ObjectT<{
    appId: z<string, string>;
    accessToken: z<string, string>;
    resourceId: z<string, string>;
    wsUrl: z<string, string>;
    language: z<string, string>;
    maxBytes: z<number, number>;
    timeoutMs: z<number, number>;
}>>;
/** Parse a RIFF/WAVE header (chunk-walking, so any fmt layout works). */
export interface WavHeader {
    channels: number;
    sampleRate: number;
    bits: number;
    dataOffset: number;
    dataLength: number;
}
export declare function parseWavHeader(buffer: Buffer): WavHeader;
/** Frame build options (exported for unit testing). */
export interface FrameOptions {
    /** Payload serialization: 1 = JSON (full request), 0 = none (audio). */
    serialization?: number;
    /** Payload compression: 1 = gzip. */
    compression?: number;
    /** Optional 4-byte big-endian sequence number (positive or negative). */
    sequence?: number;
}
/**
 * Build one binary protocol frame: 4-byte header + optional sequence +
 * big-endian payload size + payload. Protocol version 1, header size 4.
 */
export declare function buildFrame(messageType: number, flags: number, payload: Buffer, options?: FrameOptions): Buffer;
/** Upstream settings for one transcription (exported for unit testing). */
export interface AsrUpstream {
    appId: string;
    accessToken: string;
    resourceId: string;
    wsUrl: string;
    language: string;
    timeoutMs: number;
}
/**
 * Transcribe one WAV clip through the openspeech big-model streaming API
 * (流式输入模式: upload everything, then the negative packet; the server
 * answers with the final result). All payloads are gzip-compressed and every
 * frame carries a sequence number, matching the reference protocol.
 * @param audio - WAV bytes
 * @param upstream - credentials and protocol settings
 * @returns the recognized text
 */
export declare function transcribeWav(audio: Buffer, upstream: AsrUpstream): Promise<string>;
/** Options for the asr route handler (exported for unit testing). */
export interface AsrHandlerOptions extends AsrUpstream {
    /** Hard byte cap for one request body. */
    maxBytes: number;
    /** Injectable transcriber for tests (defaults to the WebSocket upstream). */
    transcribe?: (audio: Buffer) => Promise<string>;
}
/**
 * Build the asr route handler (exported for unit testing).
 * @param options - upstream, admission, and (test) transcription options
 * @returns an async `(req, res)` handler
 */
export declare function createAsrHandler(options: AsrHandlerOptions): (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>;
export declare function apply(ctx: Context, config: VoiceInputConfig): void;
