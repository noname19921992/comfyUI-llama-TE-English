import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_CLASS = "QwenTE_MultiTurnChat";
const LOCALIZED_NODE_CLASSES = new Set([
    "QwenTE_ModelLoader",
    "QwenTE_ImageInfer",
    "QwenTE_Unload",
    "QwenTE_MultiTurnChat",
    "QwenTE_ChatSettings",
    "QwenTE_SkillLoader",
    "Gemma4TE_ModelLoader",
    "Gemma4TE_ImageInfer",
    "Gemma4TE_AudioInfer",
    "Gemma4TE_Unload",
]);
const CHAT_MIN_HEIGHT = 260;
const CHAT_NODE_CHROME_HEIGHT = 110;
const CHAT_WIDGET_PADDING = 10;

let customNodeTranslationsPromise;
let allCustomNodeTranslations = {};
let activeLocaleData = {};
const originalOptionLabelers = new WeakMap();

function getCurrentLocale() {
    const locale =
        app.extensionManager?.setting?.get?.("Comfy.Locale") ??
        app.ui?.settings?.getSettingValue?.("Comfy.Locale") ??
        globalThis.localStorage?.getItem?.("Comfy.Locale") ??
        "en";
    return String(locale).replace(/^['"]|['"]$/g, "").replaceAll("_", "-");
}

async function getCustomNodeTranslations() {
    if (!customNodeTranslationsPromise) {
        const loadTranslations = async () => {
            let translations;
            if (typeof api.getCustomNodesI18n === "function") {
                translations = await api.getCustomNodesI18n();
            } else {
                const response = await api.fetchApi("/i18n");
                if (!response?.ok) {
                    throw new Error(`i18n request failed (${response?.status || "unknown"})`);
                }
                translations = await response.json();
            }
            allCustomNodeTranslations = translations || {};
            return allCustomNodeTranslations;
        };
        customNodeTranslationsPromise = loadTranslations().catch((error) => {
            console.warn("[Qwen TE] Failed to load custom-node translations.", error);
            customNodeTranslationsPromise = undefined;
            return {};
        });
    }
    return customNodeTranslationsPromise;
}

function selectCurrentLocaleData(translations) {
    const locale = getCurrentLocale();
    const language = locale.split("-")[0];
    const matchingKey = Object.keys(translations || {}).find(
        (key) => key.toLowerCase() === locale.toLowerCase()
    );
    const languageKey = Object.keys(translations || {}).find(
        (key) => key.toLowerCase() === language.toLowerCase()
    );
    return translations?.[matchingKey] || translations?.[languageKey] || {};
}

async function getCurrentLocaleData() {
    return selectCurrentLocaleData(await getCustomNodeTranslations());
}

function createTranslator(translations = {}) {
    return (key, fallback, values = {}) => {
        const template = typeof translations?.[key] === "string" ? translations[key] : fallback;
        return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
            Object.hasOwn(values, name) ? String(values[name]) : match
        );
    };
}

function normalizeLocaleKey(value) {
    return String(value || "").replaceAll(".", "_");
}

function applyLocalizedWidgetPresentation(node, nodeDefinition = {}) {
    for (const widget of node.widgets || []) {
        const inputDefinition =
            nodeDefinition.inputs?.[widget.name] ||
            nodeDefinition.inputs?.[normalizeLocaleKey(widget.name)];
        if (!inputDefinition) continue;

        const optionLabels = inputDefinition.options;
        if (optionLabels && typeof optionLabels === "object") {
            widget.options ||= {};
            // Translate labels only; serialized values remain the backend's original keys.
            if (!originalOptionLabelers.has(widget)) {
                originalOptionLabelers.set(widget, widget.options.getOptionLabel);
            }
            const originalGetOptionLabel = originalOptionLabelers.get(widget);
            widget.options.getOptionLabel = (value) => {
                const translated = optionLabels[String(value)];
                if (typeof translated === "string") return translated;
                const originalLabel = typeof originalGetOptionLabel === "function"
                    ? originalGetOptionLabel.call(widget.options, value)
                    : undefined;
                return originalLabel || String(value ?? "");
            };
        }

        if (typeof inputDefinition.placeholder === "string") {
            widget.options ||= {};
            widget.options.placeholder = inputDefinition.placeholder;
            if (widget.inputEl) widget.inputEl.placeholder = inputDefinition.placeholder;
        }
    }
}

function localizedStageLabel(value, translate) {
    const rawValue = String(value || "未开始");
    const stageKeys = {
        "未开始": "stageNotStarted",
        "进行中": "stageInProgress",
        "重新生成": "stageRegenerating",
    };
    const key = stageKeys[rawValue];
    return key ? translate(key, rawValue) : rawValue;
}

function injectStyles() {
    if (document.getElementById("qwen-te-chat-styles")) return;

    const style = document.createElement("style");
    style.id = "qwen-te-chat-styles";
    style.textContent = `
        .qwen-te-chat {
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 100%;
            height: 100%;
            min-height: 260px;
            padding: 8px;
            color: var(--input-text, #e5e7eb);
            background: var(--comfy-menu-bg, #202124);
            border: 1px solid var(--border-color, #444);
            border-radius: 6px;
            font: 13px/1.45 Arial, sans-serif;
        }
        .qwen-te-chat__messages {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            padding: 2px;
            scrollbar-width: thin;
        }
        .qwen-te-chat__flow {
            display: flex;
            align-items: center;
            gap: 7px;
            min-height: 22px;
            color: #b8c0ca;
            font-size: 11px;
        }
        .qwen-te-chat__stage {
            max-width: 90px;
            overflow: hidden;
            padding: 3px 7px;
            color: #f4c982;
            border: 1px solid #765d32;
            border-radius: 4px;
            background: #332b1d;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .qwen-te-chat__skill {
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            color: #9daab8;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .qwen-te-chat__context {
            display: flex;
            align-items: center;
            gap: 6px;
            width: 126px;
            flex: 0 0 126px;
        }
        .qwen-te-chat__context-ring {
            position: relative;
            display: grid;
            width: 38px;
            height: 38px;
            flex: 0 0 38px;
            place-items: center;
            border-radius: 50%;
            background: conic-gradient(#5d9f80 0deg, #45494f 0deg);
        }
        .qwen-te-chat__context-ring::after {
            position: absolute;
            inset: 4px;
            content: "";
            border-radius: 50%;
            background: var(--comfy-menu-bg, #202124);
        }
        .qwen-te-chat__context-percent {
            position: relative;
            z-index: 1;
            color: #edf1f5;
            font-size: 9px;
            font-weight: 700;
        }
        .qwen-te-chat__context-meta {
            display: flex;
            flex-direction: column;
            min-width: 0;
            line-height: 1.2;
        }
        .qwen-te-chat__context-tokens {
            color: #d6dce3;
            font-size: 10px;
            white-space: nowrap;
        }
        .qwen-te-chat__context-rounds {
            color: #aeb9c5;
            font-size: 9px;
            white-space: nowrap;
        }
        .qwen-te-chat__context-note {
            max-width: 82px;
            overflow: hidden;
            color: #88929d;
            font-size: 9px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .qwen-te-chat__options {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            flex: 0 0 auto;
        }
        .qwen-te-chat__message-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            min-height: 22px;
            margin-top: 4px;
        }
        .qwen-te-chat__message-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
            overflow: hidden;
            color: #89939e;
            font-size: 10px;
            white-space: nowrap;
        }
        .qwen-te-chat__message-time {
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .qwen-te-chat__message-controls {
            display: flex;
            align-items: center;
            flex: 0 0 auto;
        }
        .qwen-te-chat__message-copy {
            width: 24px;
            height: 22px;
            padding: 0;
            color: #aeb4bd;
            background: transparent;
            border: 0;
            border-radius: 4px;
            cursor: pointer;
            font: 16px/22px Arial, sans-serif;
        }
        .qwen-te-chat__message-copy:hover {
            color: #ffffff;
            background: #3b3e43;
        }
        .qwen-te-chat__option {
            min-height: 27px;
            padding: 3px 8px;
            color: #e5edf6;
            background: #303d4b;
            border: 1px solid #4b657d;
            border-radius: 4px;
            cursor: pointer;
            font: inherit;
            text-align: left;
        }
        .qwen-te-chat__option:hover:not(:disabled) {
            background: #3c5268;
        }
        .qwen-te-chat__option:disabled {
            cursor: default;
            opacity: 0.55;
        }
        .qwen-te-chat__empty {
            display: grid;
            height: 100%;
            place-items: center;
            color: #9ca3af;
        }
        .qwen-te-chat__message {
            margin: 0 0 8px;
            padding: 7px 9px;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            border: 1px solid #414348;
            border-radius: 5px;
            background: #292b2f;
        }
        .qwen-te-chat__message--user {
            margin-left: 24px;
            border-color: #3f6858;
            background: #253b33;
        }
        .qwen-te-chat__role {
            display: block;
            margin-bottom: 3px;
            color: #aeb4bd;
            font-size: 11px;
            font-weight: 600;
        }
        .qwen-te-chat__message-content {
            min-width: 0;
            font-size: 15px;
            line-height: 1.55;
        }
        .qwen-te-chat__code {
            overflow-x: auto;
            margin: 6px 0 2px;
            padding: 9px 10px;
            color: #e6edf3;
            background: #17191c;
            border: 1px solid #40444a;
            border-radius: 4px;
            white-space: pre;
            scrollbar-width: thin;
            font: 13px/1.5 Consolas, "Courier New", monospace;
        }
        .qwen-te-chat__code-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 22px;
            margin: -2px -3px 5px;
        }
        .qwen-te-chat__code-language {
            color: #8f9aa6;
            font: 10px/1.2 Arial, sans-serif;
        }
        .qwen-te-chat__code-copy {
            width: 24px;
            height: 22px;
            padding: 0;
            color: #aeb4bd;
            background: transparent;
            border: 0;
            border-radius: 4px;
            cursor: pointer;
            font: 16px/22px Arial, sans-serif;
        }
        .qwen-te-chat__code-copy:hover {
            color: #ffffff;
            background: #3b3e43;
        }
        .qwen-te-chat__composer {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 6px;
            flex: 0 0 auto;
        }
        .qwen-te-chat__compose-main {
            display: flex;
            flex-direction: column;
            min-width: 0;
            gap: 5px;
        }
        .qwen-te-chat__attachments {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        .qwen-te-chat__attachments:empty {
            display: none;
        }
        .qwen-te-chat__attachment {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            max-width: 100%;
            height: 24px;
            padding: 0 6px;
            color: #d9ede4;
            background: #263c33;
            border: 1px solid #416957;
            border-radius: 4px;
            font-size: 11px;
        }
        .qwen-te-chat__image-thumbnail-button {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            min-width: 0;
            padding: 0;
            color: inherit;
            background: transparent;
            border: 0;
            cursor: zoom-in;
            font: inherit;
        }
        .qwen-te-chat__attachment .qwen-te-chat__image-thumbnail-button {
            height: 22px;
        }
        .qwen-te-chat__image-thumbnail-button img {
            width: 20px;
            height: 20px;
            flex: 0 0 20px;
            object-fit: cover;
            border-radius: 2px;
            background: #18251f;
        }
        .qwen-te-chat__image-thumbnail-button span {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .qwen-te-chat__attachment-remove {
            width: 18px;
            height: 18px;
            padding: 0;
            color: #d7ddd9;
            background: transparent;
            border: 0;
            cursor: pointer;
            font-size: 16px;
            line-height: 16px;
        }
        .qwen-te-chat__history-images {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin: 5px 0 7px;
        }
        .qwen-te-chat__history-images:empty {
            display: none;
        }
        .qwen-te-chat__history-images .qwen-te-chat__image-thumbnail-button {
            display: block;
            width: 64px;
            height: 64px;
            overflow: hidden;
            border: 1px solid #4c7d69;
            border-radius: 4px;
        }
        .qwen-te-chat__history-images .qwen-te-chat__image-thumbnail-button:hover {
            border-color: #78bc9e;
        }
        .qwen-te-chat__history-images .qwen-te-chat__image-thumbnail-button img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 0;
        }
        .qwen-te-chat__history-images .qwen-te-chat__image-thumbnail-button span {
            display: none;
        }
        .qwen-te-chat__image-lightbox {
            position: fixed;
            z-index: 10000;
            inset: 0;
            display: grid;
            place-items: center;
            padding: 24px;
            background: rgb(0 0 0 / 72%);
            cursor: zoom-out;
        }
        .qwen-te-chat__image-lightbox-content {
            position: relative;
            display: flex;
            max-width: min(900px, 92vw);
            max-height: 88vh;
            flex-direction: column;
            gap: 7px;
            padding: 8px;
            background: var(--comfy-menu-bg, #202124);
            border: 1px solid var(--border-color, #555);
            border-radius: 6px;
            cursor: default;
        }
        .qwen-te-chat__image-lightbox-content img {
            display: block;
            max-width: min(880px, 88vw);
            max-height: 78vh;
            object-fit: contain;
        }
        .qwen-te-chat__image-lightbox-name {
            overflow: hidden;
            color: #c9d3dc;
            font-size: 11px;
            text-align: center;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .qwen-te-chat__image-lightbox-close {
            position: absolute;
            top: 2px;
            right: 2px;
            width: 24px;
            height: 24px;
            padding: 0;
            color: #f4f4f5;
            background: rgb(0 0 0 / 55%);
            border: 0;
            border-radius: 3px;
            cursor: pointer;
            font-size: 18px;
            line-height: 20px;
        }
        .qwen-te-chat__input {
            box-sizing: border-box;
            width: 100%;
            height: 96px;
            min-height: 96px;
            max-height: 110px;
            resize: vertical;
            padding: 7px 8px;
            color: var(--input-text, #f3f4f6);
            background: var(--comfy-input-bg, #17181a);
            border: 1px solid var(--border-color, #4b4d52);
            border-radius: 4px;
            outline: none;
            font: inherit;
        }
        .qwen-te-chat__input:focus {
            border-color: #55a07e;
        }
        .qwen-te-chat__actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .qwen-te-chat__button {
            min-width: 58px;
            height: 28px;
            padding: 0 10px;
            color: #f4f4f5;
            background: #3b3e43;
            border: 1px solid #565a60;
            border-radius: 4px;
            cursor: pointer;
            font: inherit;
        }
        .qwen-te-chat__button:hover:not(:disabled) {
            background: #494d53;
        }
        .qwen-te-chat__button--send {
            background: #347257;
            border-color: #438e6c;
        }
        .qwen-te-chat__button--send:hover:not(:disabled) {
            background: #3d8264;
        }
        .qwen-te-chat__button:disabled {
            cursor: default;
            opacity: 0.55;
        }
        .qwen-te-chat__status {
            flex: 0 0 auto;
            min-height: 18px;
            color: #9ca3af;
            font-size: 11px;
        }
        .qwen-te-chat__status[data-state="busy"] {
            color: #72c69e;
        }
        .qwen-te-chat__status[data-state="error"] {
            color: #ef8b8b;
        }
    `;
    document.head.appendChild(style);
}

function firstValue(value) {
    return Array.isArray(value) ? value[0] : value;
}

function parseHistory(raw) {
    try {
        const value = JSON.parse(raw || "[]");
        if (!Array.isArray(value)) return [];
        return value.filter((item) =>
            item &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string"
        );
    } catch (_) {
        return [];
    }
}

function parseImages(raw) {
    try {
        const value = JSON.parse(raw || "[]");
        return normalizeImageList(value);
    } catch (_) {
        return [];
    }
}

function normalizeImageList(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) =>
        item &&
        typeof (item.filename ?? item.name) === "string" &&
        (item.filename ?? item.name)
    ).map((item) => ({
        filename: item.filename ?? item.name,
        subfolder: item.subfolder || "",
        type: item.type || "input",
    }));
}

function getImagePreviewUrl(imageRef) {
    const query = new URLSearchParams({
        filename: imageRef.filename,
        type: imageRef.type || "input",
    });
    if (imageRef.subfolder) query.set("subfolder", imageRef.subfolder);
    const path = `/view?${query}`;
    return typeof api.apiURL === "function" ? api.apiURL(path) : path;
}

function openImagePreview(imageRef, translate) {
    const lightbox = createElement("div", "qwen-te-chat__image-lightbox");
    const content = createElement("div", "qwen-te-chat__image-lightbox-content");
    const image = document.createElement("img");
    const name = createElement("div", "qwen-te-chat__image-lightbox-name", imageRef.filename);
    const close = createElement("button", "qwen-te-chat__image-lightbox-close", "×");
    const closeLabel = translate("closeImagePreview", "关闭图片预览");
    let closed = false;

    const closePreview = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("keydown", onKeyDown);
        lightbox.remove();
    };
    const onKeyDown = (event) => {
        if (event.key === "Escape") closePreview();
    };

    image.src = getImagePreviewUrl(imageRef);
    image.alt = imageRef.filename;
    close.type = "button";
    close.title = closeLabel;
    close.setAttribute("aria-label", closeLabel);
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.addEventListener("click", (event) => {
        if (event.target === lightbox) closePreview();
    });
    close.addEventListener("click", closePreview);
    content.append(image, name, close);
    lightbox.append(content);
    document.body.append(lightbox);
    document.addEventListener("keydown", onKeyDown);
    close.focus();
}

function createImageThumbnail(imageRef, index, translate, className = "") {
    const preview = createElement("button", `qwen-te-chat__image-thumbnail-button ${className}`.trim());
    const thumbnail = document.createElement("img");
    const label = createElement("span", "", translate("image", "图片{index}", { index }));
    const previewLabel = translate("previewImage", "预览图片{index}", { index });
    thumbnail.src = getImagePreviewUrl(imageRef);
    thumbnail.alt = "";
    preview.type = "button";
    preview.title = previewLabel;
    preview.setAttribute("aria-label", previewLabel);
    preview.addEventListener("click", () => openImagePreview(imageRef, translate));
    preview.append(thumbnail, label);
    return preview;
}

function parseFlowState(raw) {
    try {
        const value = JSON.parse(raw || "{}");
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

function parseContextState(raw) {
    if (raw && typeof raw === "object") return raw;
    try {
        const value = JSON.parse(raw || "{}");
        return value && typeof value === "object" ? value : {};
    } catch (_) {
        return {};
    }
}

function formatTokenCount(value) {
    const tokens = Math.max(0, Number(value) || 0);
    if (tokens < 1000) return String(Math.round(tokens));
    const scaled = tokens / 1000;
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}k`;
}

function formatMessageTime(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (part) => String(part).padStart(2, "0");
    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
    const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    return sameDay ? clock : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${clock.slice(0, 5)}`;
}

function formatMessageDateTitle(value) {
    const date = new Date(Number(value));
    try {
        return date.toLocaleString(getCurrentLocale());
    } catch (_) {
        return date.toLocaleString();
    }
}

function parseOptions(raw) {
    try {
        const value = JSON.parse(raw || "[]");
        return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : [];
    } catch (_) {
        return [];
    }
}

function isHistoryJson(raw) {
    try {
        return Array.isArray(JSON.parse(raw || ""));
    } catch (_) {
        return false;
    }
}

async function uploadChatImage(file, index, translate) {
    const safeName = String(file.name || "image.png").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const uploadName = `qwen_chat_${Date.now()}_${index}_${safeName}`;
    const body = new FormData();
    body.append("image", file, uploadName);
    body.append("type", "input");
    body.append("subfolder", "qwen_te_chat");
    body.append("overwrite", "false");

    const response = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!response?.ok) {
        throw new Error(translate("imageUploadFailed", "图片上传失败 ({status})", {
            status: response?.status || "unknown",
        }));
    }
    const result = await response.json();
    return {
        filename: result.name || uploadName,
        subfolder: result.subfolder || "qwen_te_chat",
        type: "input",
    };
}

function hideBackendWidget(widget) {
    if (!widget) return;
    widget.type = `converted-widget:qwen-te-chat-${widget.name}`;
    widget.computeSize = () => [0, -4];
    widget.serializeValue = async () => widget.value;
    if (widget.inputEl) widget.inputEl.style.display = "none";
    if (widget.element) widget.element.style.display = "none";
}

function createElement(tag, className, text = "") {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
}

function createMessageContent(text, onCopy, translate) {
    const content = createElement("div", "qwen-te-chat__message-content");
    const source = String(text || "");
    const fence = /```([^\n`]*)\n([\s\S]*?)```/g;
    let cursor = 0;
    let match;

    while ((match = fence.exec(source)) !== null) {
        if (match.index > cursor) content.append(document.createTextNode(source.slice(cursor, match.index)));
        const pre = createElement("pre", "qwen-te-chat__code");
        const language = match[1].trim();
        const codeText = match[2].replace(/\n$/, "");
        const codeHeader = createElement("div", "qwen-te-chat__code-header");
        if (language) codeHeader.append(createElement("span", "qwen-te-chat__code-language", language));
        const copyCodeButton = createElement("button", "qwen-te-chat__code-copy", "⧉");
        copyCodeButton.type = "button";
        copyCodeButton.title = translate("copyCodeBlock", "复制代码块");
        copyCodeButton.setAttribute("aria-label", translate("copyCodeBlock", "复制代码块"));
        copyCodeButton.addEventListener("click", (event) => {
            event.stopPropagation();
            onCopy?.(codeText);
        });
        codeHeader.append(copyCodeButton);
        pre.append(codeHeader);
        const code = document.createElement("code");
        code.textContent = codeText;
        pre.append(code);
        content.append(pre);
        cursor = fence.lastIndex;
    }

    if (cursor < source.length) content.append(document.createTextNode(source.slice(cursor)));
    return content;
}

function isPromptLink(value, output) {
    if (!Array.isArray(value) || value.length !== 2) return false;
    const sourceId = value[0];
    const outputSlot = value[1];
    const validSource =
        typeof sourceId === "number" ||
        (typeof sourceId === "string" && /^\d+$/.test(sourceId));
    return (
        validSource &&
        typeof outputSlot === "number" &&
        Number.isFinite(outputSlot) &&
        Boolean(output?.[String(sourceId)] ?? output?.[Number(sourceId)])
    );
}

function collectPromptLinks(value, output, result = new Set()) {
    if (isPromptLink(value, output)) {
        result.add(String(value[0]));
        return result;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectPromptLinks(item, output, result);
    } else if (value && typeof value === "object") {
        for (const item of Object.values(value)) collectPromptLinks(item, output, result);
    }
    return result;
}

async function buildChatOnlyPrompt(node, translate) {
    const prompt = await app.graphToPrompt();
    const output = prompt?.output;
    const targetId = String(node.id);
    if (!output || !(output[targetId] ?? output[Number(targetId)])) {
        throw new Error(translate(
            "chatNodeUnavailable",
            "当前聊天节点不在可执行提示中，请检查模型连接。"
        ));
    }

    const keep = new Set();
    const addWithAncestors = (nodeId) => {
        const id = String(nodeId);
        if (keep.has(id)) return;
        const apiNode = output[id] ?? output[Number(id)];
        if (!apiNode) return;
        keep.add(id);
        for (const sourceId of collectPromptLinks(apiNode.inputs || {}, output)) {
            addWithAncestors(sourceId);
        }
    };
    addWithAncestors(targetId);

    const scopedOutput = {};
    for (const [id, apiNode] of Object.entries(output)) {
        if (keep.has(String(id))) scopedOutput[id] = apiNode;
    }
    prompt.output = scopedOutput;
    return prompt;
}

function setupChatNode(node, chatTranslations = {}) {
    if (node.__qwenTeChatSetup) return;
    injectStyles();
    node.properties ||= {};
    const translate = createTranslator(chatTranslations);
    const skillNames = chatTranslations.skillNames || {};

    const userWidget = node.widgets?.find((widget) => widget.name === "用户消息");
    const historyWidget = node.widgets?.find((widget) => widget.name === "对话历史JSON");
    const requestWidget = node.widgets?.find((widget) => widget.name === "请求ID");
    const currentImagesWidget = node.widgets?.find((widget) => widget.name === "当前图片JSON");
    if (!userWidget || !historyWidget || !requestWidget || !currentImagesWidget || typeof node.addDOMWidget !== "function") return;
    node.__qwenTeChatSetup = true;

    if (!isHistoryJson(historyWidget.value)) {
        const legacyValues = node.widgets_values;
        historyWidget.value = isHistoryJson(legacyValues?.[12]) ? legacyValues[12] : "[]";
        requestWidget.value = typeof legacyValues?.[13] === "string" ? legacyValues[13] : "";
        currentImagesWidget.value = "[]";
    }

    hideBackendWidget(userWidget);
    hideBackendWidget(historyWidget);
    hideBackendWidget(requestWidget);
    hideBackendWidget(currentImagesWidget);
    const flowWidget = node.widgets?.find((widget) => widget.name === "流程状态JSON");
    if (flowWidget) hideBackendWidget(flowWidget);
    const optionsWidget = node.widgets?.find((widget) => widget.name === "选项JSON");
    if (optionsWidget) hideBackendWidget(optionsWidget);

    const root = createElement("div", "qwen-te-chat");
    const messages = createElement("div", "qwen-te-chat__messages");
    const flow = createElement("div", "qwen-te-chat__flow");
    const stage = createElement(
        "span",
        "qwen-te-chat__stage",
        translate("stageNotStarted", "未开始")
    );
    const skillLabel = createElement(
        "span",
        "qwen-te-chat__skill",
        translate("generalChat", "普通对话")
    );
    const contextMeter = createElement("div", "qwen-te-chat__context");
    const contextRing = createElement("div", "qwen-te-chat__context-ring");
    const contextPercent = createElement("span", "qwen-te-chat__context-percent", "--");
    const contextMeta = createElement("div", "qwen-te-chat__context-meta");
    const contextTokens = createElement(
        "span",
        "qwen-te-chat__context-tokens",
        translate("usedUnknown", "已用约 --")
    );
    const contextRounds = createElement(
        "span",
        "qwen-te-chat__context-rounds",
        translate("roundsUnknown", "轮数 --/--")
    );
    const contextNote = createElement(
        "span",
        "qwen-te-chat__context-note",
        translate("contextEstimate", "上下文估算")
    );
    const options = createElement("div", "qwen-te-chat__options");
    const composer = createElement("div", "qwen-te-chat__composer");
    const composeMain = createElement("div", "qwen-te-chat__compose-main");
    const attachments = createElement("div", "qwen-te-chat__attachments");
    const input = createElement("textarea", "qwen-te-chat__input");
    const actions = createElement("div", "qwen-te-chat__actions");
    const sendButton = createElement(
        "button",
        "qwen-te-chat__button qwen-te-chat__button--send",
        translate("send", "发送")
    );
    const insertImageButton = createElement(
        "button",
        "qwen-te-chat__button",
        translate("insertImages", "插入图片")
    );
    const clearButton = createElement(
        "button",
        "qwen-te-chat__button",
        translate("clear", "清空")
    );
    const fileInput = document.createElement("input");
    const status = createElement(
        "div",
        "qwen-te-chat__status",
        translate("ready", "准备就绪")
    );

    input.placeholder = translate(
        "messagePlaceholder",
        "输入消息，Enter 发送，Shift+Enter 换行"
    );
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    sendButton.type = "button";
    insertImageButton.type = "button";
    clearButton.type = "button";
    actions.append(sendButton, insertImageButton, clearButton);
    composeMain.append(attachments, input);
    composer.append(composeMain, actions);
    contextRing.append(contextPercent);
    contextMeta.append(contextTokens, contextRounds, contextNote);
    contextMeter.append(contextRing, contextMeta);
    flow.append(createElement("span", "", translate("workflow", "流程")), stage, skillLabel, contextMeter);
    root.append(flow, messages, options, composer, status, fileInput);

    for (const eventName of ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "wheel"]) {
        root.addEventListener(eventName, (event) => event.stopPropagation());
    }

    const render = () => {
        const history = parseHistory(historyWidget.value);
        messages.replaceChildren();
        if (!history.length) {
            messages.append(createElement(
                "div",
                "qwen-te-chat__empty",
                translate("noConversation", "暂无对话")
            ));
            return;
        }

        history.forEach((item, index) => {
            const historyImages = normalizeImageList(item.images);
            const imageCount = historyImages.length;
            const block = createElement(
                "div",
                `qwen-te-chat__message qwen-te-chat__message--${item.role}`
            );
            const messageActions = createElement("div", "qwen-te-chat__message-actions");
            const messageMeta = createElement("div", "qwen-te-chat__message-meta");
            const messageControls = createElement("div", "qwen-te-chat__message-controls");
            const tokenCount = Number(item.token_count);
            if (Number.isFinite(tokenCount) && tokenCount >= 0) {
                const tokenLabel = createElement(
                    "span",
                    "qwen-te-chat__message-tokens",
                    `${Math.round(tokenCount)} tokens`
                );
                tokenLabel.title = imageCount
                    ? translate(
                        "tokenEstimateWithImages",
                        "包含文本、消息模板开销和图片视觉 token 估算"
                    )
                    : translate(
                        "tokenEstimateText",
                        "使用当前模型 tokenizer 统计，并包含少量消息模板开销"
                    );
                messageMeta.append(tokenLabel);
            }
            const formattedTime = formatMessageTime(item.created_at);
            if (formattedTime) {
                const timeLabel = createElement("span", "qwen-te-chat__message-time", formattedTime);
                timeLabel.title = formatMessageDateTitle(item.created_at);
                messageMeta.append(timeLabel);
            }
            const copyMessageButton = createElement("button", "qwen-te-chat__message-copy", "⧉");
            copyMessageButton.type = "button";
            copyMessageButton.title = translate("copyMessage", "复制这条消息");
            copyMessageButton.setAttribute(
                "aria-label",
                translate("copyMessage", "复制这条消息")
            );
            copyMessageButton.addEventListener("click", (event) => {
                event.stopPropagation();
                copyText(item.content);
            });
            messageControls.append(copyMessageButton);
            if (item.role === "assistant" && index === history.length - 1) {
                const regenerateButton = createElement("button", "qwen-te-chat__message-copy", "↻");
                regenerateButton.type = "button";
                regenerateButton.title = translate("regenerateMessage", "重新生成这条消息");
                regenerateButton.setAttribute(
                    "aria-label",
                    translate("regenerateMessage", "重新生成这条消息")
                );
                regenerateButton.addEventListener("click", (event) => {
                    event.stopPropagation();
                    regenerateLastReply();
                });
                messageControls.append(regenerateButton);
            }
            messageActions.append(messageMeta, messageControls);
            const historyImagePreviews = createElement("div", "qwen-te-chat__history-images");
            historyImages.forEach((imageRef, imageIndex) => {
                historyImagePreviews.append(createImageThumbnail(imageRef, imageIndex + 1, translate));
            });
            block.append(
                createElement(
                    "span",
                    "qwen-te-chat__role",
                    item.role === "user"
                        ? (imageCount
                            ? translate("userWithImages", "用户 · 图片{count}", { count: imageCount })
                            : translate("user", "用户"))
                        : translate("assistant", "助手")
                ),
                historyImagePreviews,
                createMessageContent(item.content, copyText, translate),
                messageActions
            );
            messages.append(block);
        });
        messages.scrollTop = messages.scrollHeight;
    };

    const renderFlow = () => {
        const state = parseFlowState(flowWidget?.value);
        stage.textContent = localizedStageLabel(state.stage, translate);
        stage.title = stage.textContent;
        skillLabel.textContent =
            skillNames[state.skill] ||
            state.skill_name ||
            state.skill ||
            translate("generalChat", "普通对话");
        skillLabel.title = skillLabel.textContent;
        options.replaceChildren();
        const optionValues = parseOptions(optionsWidget?.value || "[]");
        optionValues.forEach((value) => {
            const button = createElement("button", "qwen-te-chat__option", value);
            button.type = "button";
            button.title = translate("sendOption", "发送此选项");
            button.addEventListener("click", () => {
                if (node.__qwenTeChatBusy) return;
                input.value = value;
                send();
            });
            options.append(button);
        });
    };

    const renderContext = () => {
        const state = parseContextState(node.properties.qwenTeContextState);
        const usedTokens = Math.max(0, Number(state.used_tokens) || 0);
        const promptBudget = Math.max(0, Number(state.prompt_budget) || 0);
        const contextLimit = Math.max(0, Number(state.context_limit) || 0);
        const outputReserve = Math.max(0, Number(state.output_reserve) || 0);
        const trimmedMessages = Math.max(0, Number(state.trimmed_messages) || 0);
        const currentRounds = Math.max(0, Number(state.current_rounds) || 0);
        const maxRounds = Math.max(0, Number(state.max_rounds) || 0);
        const remainingTokens = Math.max(0, Number(state.remaining_tokens) || 0);

        if (!promptBudget || !contextLimit) {
            contextPercent.textContent = "--";
            contextTokens.textContent = translate("usedUnknown", "已用约 --");
            contextRounds.textContent = translate("roundsUnknown", "轮数 --/--");
            contextNote.textContent = translate("remainingUnknown", "剩余约 --");
            contextRing.style.background = "conic-gradient(#5d9f80 0deg, #45494f 0deg)";
            contextMeter.title = translate(
                "contextPending",
                "完成一次回复后显示上下文占用估算"
            );
            return;
        }

        const rawPercent = usedTokens / promptBudget * 100;
        const displayPercent = Math.max(0, Math.round(rawPercent));
        const ringPercent = Math.min(100, Math.max(0, rawPercent));
        const color = rawPercent >= 90 ? "#d66f6f" : rawPercent >= 75 ? "#d4a653" : "#5d9f80";
        contextPercent.textContent = `${displayPercent}%`;
        contextTokens.textContent = translate("usedTokens", "已用约 {tokens}", {
            tokens: formatTokenCount(usedTokens),
        });
        contextRounds.textContent = translate("rounds", "轮数 {current}/{max}", {
            current: currentRounds,
            max: maxRounds || "--",
        });
        contextNote.textContent = trimmedMessages > 0
            ? translate("remainingTrimmed", "剩余约 {tokens} · 裁{count}", {
                tokens: formatTokenCount(remainingTokens),
                count: trimmedMessages,
            })
            : translate("remainingTokens", "剩余约 {tokens}", {
                tokens: formatTokenCount(remainingTokens),
            });
        contextRing.style.background = `conic-gradient(${color} ${ringPercent * 3.6}deg, #45494f 0deg)`;
        contextMeter.title = [
            translate("contextUsedTitle", "当前已使用约 {count} tokens", {
                count: Math.round(usedTokens),
            }),
            translate("contextRemainingTitle", "当前剩余约 {count} tokens", {
                count: Math.round(remainingTokens),
            }),
            translate("contextLimitTitle", "模型上下文上限 {count} tokens", {
                count: Math.round(contextLimit),
            }),
            translate("outputReserveTitle", "已预留输出 {count} tokens", {
                count: Math.round(outputReserve),
            }),
            translate("retainedRoundsTitle", "当前保留历史 {current} / {max} 轮", {
                current: Math.round(currentRounds),
                max: Math.round(maxRounds),
            }),
            trimmedMessages > 0
                ? translate(
                    "historyTrimmedTitle",
                    "本轮因上下文不足裁剪了 {count} 条历史消息",
                    { count: trimmedMessages }
                )
                : translate("historyNotTrimmedTitle", "本轮未裁剪历史消息"),
        ].join("\n");
    };

    const renderAttachments = () => {
        const images = parseImages(currentImagesWidget.value);
        attachments.replaceChildren();
        images.forEach((imageRef, index) => {
            const chip = createElement("span", "qwen-te-chat__attachment");
            chip.title = imageRef.filename;
            const removeButton = createElement("button", "qwen-te-chat__attachment-remove", "×");
            removeButton.type = "button";
            removeButton.title = translate("removeImage", "移除图片{index}", {
                index: index + 1,
            });
            removeButton.addEventListener("click", () => {
                const next = parseImages(currentImagesWidget.value);
                next.splice(index, 1);
                currentImagesWidget.value = JSON.stringify(next);
                renderAttachments();
                node.graph?.setDirtyCanvas?.(true, true);
            });
            chip.append(createImageThumbnail(imageRef, index + 1, translate), removeButton);
            attachments.append(chip);
        });
        const attachmentHeight = images.length ? attachments.offsetHeight + 5 : 0;
        actions.style.marginTop = `${attachmentHeight}px`;
    };

    const copyText = async (value) => {
        if (!value) {
            status.textContent = translate("nothingToCopy", "暂无可复制内容");
            status.dataset.state = "error";
            return false;
        }
        try {
            await navigator.clipboard.writeText(value);
        } catch (_) {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.append(textarea);
            textarea.select();
            document.execCommand("copy");
            textarea.remove();
        }
        status.textContent = translate("messageCopied", "已复制这条消息");
        status.dataset.state = "idle";
        return true;
    };

    const regenerateLastReply = () => {
        if (node.__qwenTeChatBusy) return;
        const history = parseHistory(historyWidget.value);
        const assistantIndex = history.length - 1;
        const userIndex = assistantIndex - 1;
        if (
            assistantIndex < 1 ||
            history[assistantIndex]?.role !== "assistant" ||
            history[userIndex]?.role !== "user"
        ) return;

        const assistantMessage = history[assistantIndex];
        const userMessage = history[userIndex];
        historyWidget.value = JSON.stringify(history.slice(0, userIndex));
        input.value = userMessage.content;
        currentImagesWidget.value = JSON.stringify(userMessage.images || []);
        if (flowWidget) {
            const fallbackState = parseFlowState(flowWidget.value);
            fallbackState.final_result = "";
            fallbackState.stage = "重新生成";
            flowWidget.value = JSON.stringify(assistantMessage.flow_before || fallbackState);
        }
        if (optionsWidget) optionsWidget.value = "[]";
        render();
        renderFlow();
        renderAttachments();
        send();
    };

    const setBusy = (
        busy,
        message = busy
            ? translate("generating", "正在生成...")
            : translate("ready", "准备就绪"),
        state = busy ? "busy" : "idle"
    ) => {
        node.__qwenTeChatBusy = busy;
        sendButton.disabled = busy;
        insertImageButton.disabled = busy;
        clearButton.disabled = busy;
        input.disabled = busy;
        options.querySelectorAll("button").forEach((button) => { button.disabled = busy; });
        status.textContent = message;
        status.dataset.state = state;
    };

    const send = async () => {
        const text = input.value.trim();
        if (!text || node.__qwenTeChatBusy) return;

        userWidget.value = text;
        requestWidget.value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setBusy(true);
        node.graph?.setDirtyCanvas?.(true, true);

        try {
            const prompt = await buildChatOnlyPrompt(node, translate);
            await api.queuePrompt(0, prompt);
            status.textContent = translate("queued", "已加入队列...");
        } catch (error) {
            setBusy(false, translate("queueFailed", "加入队列失败：{error}", {
                error: error?.message || error,
            }), "error");
        }
    };

    sendButton.addEventListener("click", send);
    insertImageButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        const files = Array.from(fileInput.files || []);
        fileInput.value = "";
        if (!files.length || node.__qwenTeChatBusy) return;

        setBusy(true, translate("uploadingImages", "正在上传图片..."));
        try {
            const current = parseImages(currentImagesWidget.value);
            const startIndex = current.length;
            for (let index = 0; index < files.length; index += 1) {
                current.push(await uploadChatImage(files[index], startIndex + index, translate));
            }
            currentImagesWidget.value = JSON.stringify(current);
            renderAttachments();
            setBusy(false, translate("imagesInserted", "已插入 {count} 张图片", {
                count: files.length,
            }));
            node.graph?.setDirtyCanvas?.(true, true);
            input.focus();
        } catch (error) {
            setBusy(false, translate("imageInsertFailed", "插入图片失败：{error}", {
                error: error?.message || error,
            }), "error");
        }
    });
    clearButton.addEventListener("click", () => {
        historyWidget.value = "[]";
        userWidget.value = "";
        requestWidget.value = `${Date.now()}-clear`;
        currentImagesWidget.value = "[]";
        if (flowWidget) flowWidget.value = "{}";
        if (optionsWidget) optionsWidget.value = "[]";
        node.properties.qwenTeContextState = {};
        input.value = "";
        render();
        renderFlow();
        renderContext();
        renderAttachments();
        setBusy(false, translate("conversationCleared", "会话已清空"));
        node.graph?.setDirtyCanvas?.(true, true);
    });
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            send();
        }
    });

    const domWidget = node.addDOMWidget("qwen_te_chat", "qwen_te_chat", root, {
        getMinHeight: () => CHAT_MIN_HEIGHT + CHAT_WIDGET_PADDING,
        getMaxHeight: () => undefined,
        getHeight: () => Math.max(
            CHAT_MIN_HEIGHT + CHAT_WIDGET_PADDING,
            (node.size?.[1] || 470) - CHAT_NODE_CHROME_HEIGHT + CHAT_WIDGET_PADDING
        ),
        hideOnZoom: false,
        serialize: false,
    });

    const updateChatLayout = (size = node.size) => {
        const nodeHeight = Number(size?.[1] ?? node.size?.[1] ?? 470);
        const chatHeight = Math.max(CHAT_MIN_HEIGHT, nodeHeight - CHAT_NODE_CHROME_HEIGHT);
        root.style.height = `${chatHeight}px`;
        root.style.minHeight = `${CHAT_MIN_HEIGHT}px`;
        node.graph?.setDirtyCanvas?.(true, true);
    };

    domWidget.computeSize = (width) => {
        const nodeHeight = Number(node.size?.[1] ?? 470);
        const chatHeight = Math.max(CHAT_MIN_HEIGHT, nodeHeight - CHAT_NODE_CHROME_HEIGHT);
        return [Math.max(280, width || node.size?.[0] || 360), chatHeight + CHAT_WIDGET_PADDING];
    };
    domWidget.afterResize = () => updateChatLayout();
    const domWidgetIndex = node.widgets.indexOf(domWidget);
    if (domWidgetIndex > 0) {
        node.widgets.splice(domWidgetIndex, 1);
        node.widgets.unshift(domWidget);
    }

    const originalOnResize = node.onResize;
    node.onResize = function (size) {
        const result = originalOnResize?.apply(this, arguments);
        updateChatLayout(size || this.size);
        return result;
    };

    const originalOnExecuted = node.onExecuted;
    node.onExecuted = function (output) {
        originalOnExecuted?.apply(this, arguments);
        const rawHistory = firstValue(output?.对话历史JSON);
        if (typeof rawHistory === "string") historyWidget.value = rawHistory;
        const rawFlow = firstValue(output?.流程状态JSON);
        if (flowWidget && typeof rawFlow === "string") flowWidget.value = rawFlow;
        const rawOptions = firstValue(output?.选项JSON);
        if (optionsWidget) optionsWidget.value = typeof rawOptions === "string" ? rawOptions : "[]";
        const rawContextState = firstValue(output?.上下文状态JSON);
        if (typeof rawContextState === "string") {
            node.properties.qwenTeContextState = parseContextState(rawContextState);
        }
        const sent = Boolean(firstValue(output?.已发送));
        if (sent) {
            userWidget.value = "";
            currentImagesWidget.value = "[]";
            input.value = "";
        }
        render();
        renderFlow();
        renderContext();
        renderAttachments();
        setBusy(false);
        this.graph?.setDirtyCanvas?.(true, true);
    };

    const originalOnConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalOnConfigure?.apply(this, arguments);
        window.setTimeout(() => {
            render();
            renderFlow();
            renderContext();
            renderAttachments();
        }, 0);
        return result;
    };

    const handleExecutionFailure = (event) => {
        if (!node.__qwenTeChatBusy) return;
        setBusy(
            false,
            translate("generationFailed", "生成失败，请查看 ComfyUI 日志"),
            "error"
        );
    };
    api.addEventListener("execution_error", handleExecutionFailure);
    api.addEventListener("execution_interrupted", handleExecutionFailure);

    const originalOnRemoved = node.onRemoved;
    node.onRemoved = function () {
        api.removeEventListener("execution_error", handleExecutionFailure);
        api.removeEventListener("execution_interrupted", handleExecutionFailure);
        return originalOnRemoved?.apply(this, arguments);
    };

    node.setSize([
        Math.max(node.size?.[0] || 0, 390),
        Math.max(node.size?.[1] || 0, 470),
    ]);
    window.setTimeout(() => {
        updateChatLayout();
        render();
        renderFlow();
        renderContext();
        renderAttachments();
    }, 0);
}

app.registerExtension({
    name: "QwenTE.MultiTurnChat",
    async init() {
        activeLocaleData = await getCurrentLocaleData();
        if (!customNodeTranslationsPromise) {
            activeLocaleData = await getCurrentLocaleData();
        }
    },
    nodeCreated(node) {
        const nodeClass = node.constructor?.comfyClass;
        if (!LOCALIZED_NODE_CLASSES.has(nodeClass)) return;

        activeLocaleData = selectCurrentLocaleData(allCustomNodeTranslations);
        applyLocalizedWidgetPresentation(node, activeLocaleData.nodeDefs?.[nodeClass]);
        if (nodeClass === NODE_CLASS) {
            setupChatNode(node, activeLocaleData.qwenTE?.chat);
        }
    },
});
