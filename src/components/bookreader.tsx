import type { CSSProperties, FormEvent } from "react";
import {
    createElement,
    useEffect,
    useRef,
    useState,
} from "react";

import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

import "../lib/foliate-js/view.js";
import "./BookReader.css";

import paperTexture from "../assets/textures/paper.jpg";
import TranslationPopup from "./TranslationPopup";

import {
    explainWord,
    translateSentence,
} from "../services/llm";


import {
    getSentencesInVisibleRange,
    getWordAtPoint,
    type WordPosition,
} from "./bookReaderText";

import { usePagePrefetch } from "./usePagePrefetch";

export type BookSource = File;

type FoliateReader = HTMLElement & {
    open: (file: File) => Promise<void>;
    goTo: (
        target: number | string,
    ) => Promise<void>;
    next: () => Promise<void>;
    prev: () => Promise<void>;

    renderer?: {
        setStyles: (
            styles: string,
        ) => void;

        setAttribute: (
            name: string,
            value: string,
        ) => void;
    };
};

type SelectedWord =
    WordPosition & {
        explanation: string;
    };

type PageChatMessage = {
    role: "user" | "assistant";
    text: string;
};

type PageChatFocus = {
    word: string;
    sentence: string;
};

const PAGE_CHAT_OLLAMA_URL =
    "https://nexus.tail677dd0.ts.net/api/generate";

const PAGE_CHAT_MODEL = "gemma3:12b";

export type BookReaderProps = {
    book: File;
    bookId: string;
    language?: string;
    className?: string;
};

const paperTextureUrl =
    new URL(
        paperTexture,
        window.location.href,
    ).href;

const readerPaperThemes: Record<
    string,
    {
        background: string;
        text: string;
    }
> = {
    paper: {
        background: "#ffffff",
        text: "#292622",
    },

    sepia: {
        background: "#e6d3b1",
        text: "#30261b",
    },

    rose: {
        background: "#d9a3a3",
        text: "#332020",
    },

    night: {
        background: "#000000",
        text: "#eee9e2",
    },
};

export default function BookReader({
    book,
    bookId,
    language,
    className = "",
}: BookReaderProps) {
    const readerRef =
        useRef<FoliateReader | null>(
            null,
        );

    const fontScaleRef =
        useRef(100);

    const paperThemeRef =
        useRef("paper");

    const openedBookRef =
        useRef<File | null>(null);

    const initializedDocumentsRef =
        useRef(
            new WeakSet<Document>(),
        );

    const lastTapRef =
        useRef<{
            time: number;
            word: string;
            sentence: string;
        } | null>(null);

    const singleTapTimerRef =
        useRef<number | null>(null);

    const visiblePageTextRef =
        useRef("");

    const [
        pageChatOpen,
        setPageChatOpen,
    ] = useState(false);

    const [
        pageChatInput,
        setPageChatInput,
    ] = useState("");

    const [
        pageChatMessages,
        setPageChatMessages,
    ] = useState<PageChatMessage[]>([]);

    const [
        pageChatLoading,
        setPageChatLoading,
    ] = useState(false);

    const [
        pageChatFocus,
        setPageChatFocus,
    ] = useState<PageChatFocus | null>(
        null,
    );

    const [, setLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [
        selectedWord,
        setSelectedWord,
    ] =
        useState<SelectedWord | null>(
            null,
        );

    const [
        showSentenceTranslation,
        setShowSentenceTranslation,
    ] = useState(false);

    const [
        paperTheme,
        setPaperTheme,
    ] = useState("paper");

    const schedulePagePrefetch =
        usePagePrefetch(
            language,
            1000,
        );

    useEffect(() => {
        console.log(
            "BOOK LANGUAGE IN READER:",
            language,
        );
    }, [language]);

    const applyReaderStyles = (
        scale: number,
        theme: string,
    ) => {
        const clampedScale =
            Math.max(
                70,
                Math.min(
                    200,
                    scale,
                ),
            );

        fontScaleRef.current =
            clampedScale;

        paperThemeRef.current =
            theme;

        const colors =
            readerPaperThemes[
            theme
            ] ??
            readerPaperThemes.paper;

        readerRef.current
            ?.renderer
            ?.setStyles(`
html, body {
    width: 100% !important;
    min-width: 100% !important;
    min-height: 100% !important;
    height: 100% !important;
    margin: 0 !important;

    font-size: ${clampedScale}% !important;

    background: transparent !important;
    color: ${colors.text} !important;
}

body * {
    background: transparent !important;
}
`);
    };

    const applyFontScale = (
        scale: number,
    ) => {
        applyReaderStyles(
            scale,
            paperThemeRef.current,
        );
    };

    const applyPaperTheme = (
        theme?: string | null,
    ) => {
        const nextTheme =
            theme ?? "paper";

        setPaperTheme(nextTheme);

        applyReaderStyles(
            fontScaleRef.current,
            nextTheme,
        );
    };

    useEffect(() => {
        const reader =
            readerRef.current;

        if (!reader) {
            return;
        }

        const handleRelocate = (
            event: Event,
        ) => {
            const detail = (
                event as CustomEvent<{
                    cfi?: string;
                    range?: Range;
                }>
            ).detail;

            if (detail?.cfi) {
                void Preferences.set({
                    key:
                        `position:${bookId}`,
                    value: detail.cfi,
                });
            }

            if (!detail?.range) {
                return;
            }

            const sentences =
                getSentencesInVisibleRange(
                    detail.range,
                );

            visiblePageTextRef.current =
                sentences.join(" ");

            schedulePagePrefetch(
                sentences,
            );
        };

        const handleLoad = (
            event: Event,
        ) => {
            const customEvent =
                event as CustomEvent<{
                    doc: Document;
                    index: number;
                }>;

            const doc =
                customEvent.detail.doc;

            const frame =
                doc.defaultView
                    ?.frameElement as HTMLElement | null;

            if (frame) {
                frame.style.setProperty(
                    "background",
                    "transparent",
                    "important",
                );
            }

            doc.documentElement.style
                .setProperty(
                    "background",
                    "transparent",
                    "important",
                );

            doc.body?.style
                .setProperty(
                    "background",
                    "transparent",
                    "important",
                );

            doc.body
                ?.querySelectorAll<HTMLElement>(
                    ":scope > *",
                )
                .forEach(
                    (element) => {
                        element.style
                            .setProperty(
                                "background-color",
                                "transparent",
                                "important",
                            );

                        element.style
                            .setProperty(
                                "background-image",
                                "none",
                                "important",
                            );
                    },
                );

            console.log(
                "Loaded EPUB section:",
                customEvent.detail.index,
            );

            if (
                initializedDocumentsRef
                    .current
                    .has(doc)
            ) {
                return;
            }

            initializedDocumentsRef
                .current
                .add(doc);

            let pinchStartDistance:
                number | null = null;

            let pinchStartScale =
                fontScaleRef.current;

            const distance = (
                touches: TouchList,
            ) => {
                const first =
                    touches[0];

                const second =
                    touches[1];

                if (
                    !first ||
                    !second
                ) {
                    return 0;
                }

                return Math.hypot(
                    second.clientX -
                    first.clientX,

                    second.clientY -
                    first.clientY,
                );
            };

            const handleTouchStart = (
                touchEvent: TouchEvent,
            ) => {
                if (
                    touchEvent
                        .touches
                        .length !== 2
                ) {
                    return;
                }

                pinchStartDistance =
                    distance(
                        touchEvent.touches,
                    );

                pinchStartScale =
                    fontScaleRef.current;
            };

            const handleTouchMove = (
                touchEvent: TouchEvent,
            ) => {
                if (
                    touchEvent
                        .touches
                        .length !== 2 ||
                    pinchStartDistance ===
                    null
                ) {
                    return;
                }

                touchEvent.preventDefault();

                const ratio =
                    distance(
                        touchEvent.touches,
                    ) /
                    pinchStartDistance;

                const newScale =
                    Math.round(
                        (
                            pinchStartScale *
                            ratio
                        ) / 5,
                    ) * 5;

                applyFontScale(
                    newScale,
                );
            };

            const handleTouchEnd =
                () => {
                    if (
                        pinchStartDistance ===
                        null
                    ) {
                        return;
                    }

                    pinchStartDistance =
                        null;

                    void Preferences.set({
                        key:
                            "reader-font-scale",

                        value: String(
                            fontScaleRef
                                .current,
                        ),
                    });
                };

            const handleClick = (
                event: Event,
            ) => {
                const mouseEvent =
                    event as MouseEvent;

                const selected =
                    getWordAtPoint(
                        doc,
                        mouseEvent.clientX,
                        mouseEvent.clientY,
                    );

                if (!selected) {
                    return;
                }

                const now =
                    Date.now();

                const previousTap =
                    lastTapRef.current;

                const isDoubleTap =
                    previousTap !==
                    null &&
                    now -
                    previousTap.time <
                    300 &&
                    previousTap.word ===
                    selected.word &&
                    previousTap
                        .sentence ===
                    selected.sentence;

                if (isDoubleTap) {
                    if (
                        singleTapTimerRef
                            .current !==
                        null
                    ) {
                        window.clearTimeout(
                            singleTapTimerRef
                                .current,
                        );

                        singleTapTimerRef
                            .current = null;
                    }

                    lastTapRef.current =
                        null;

                    setShowSentenceTranslation(
                        true,
                    );

                    setSelectedWord({
                        ...selected,
                        explanation:
                            "Översätter...",
                    });

                    void translateSentence(
                        selected.sentence,
                        language ??
                        "unknown",
                    )
                        .then(
                            (
                                translation,
                            ) => {
                                setSelectedWord(
                                    (
                                        current,
                                    ) => {
                                        if (
                                            !current ||
                                            current.word !==
                                            selected.word ||
                                            current.sentence !==
                                            selected.sentence
                                        ) {
                                            return current;
                                        }

                                        return {
                                            ...current,

                                            explanation:
                                                `- **Meningsöversättning:** ${translation}`,
                                        };
                                    },
                                );
                            },
                        )
                        .catch(
                            (error) => {
                                console.error(
                                    "TRANSLATION ERROR:",
                                    error,
                                );
                            },
                        );

                    return;
                }

                lastTapRef.current =
                {
                    time: now,
                    word:
                        selected.word,
                    sentence:
                        selected.sentence,
                };

                if (
                    singleTapTimerRef
                        .current !== null
                ) {
                    window.clearTimeout(
                        singleTapTimerRef
                            .current,
                    );
                }

                singleTapTimerRef.current =
                    window.setTimeout(
                        () => {
                            setShowSentenceTranslation(
                                false,
                            );

                            setSelectedWord({
                                ...selected,
                                explanation: "Översätter...",
                            });

                            void explainWord(
                                selected.word,
                                selected.sentence,
                                language ??
                                "unknown",
                            )
                                .then(
                                    (
                                        answer,
                                    ) => {
                                        setSelectedWord(
                                            (
                                                current,
                                            ) => {
                                                if (
                                                    !current ||
                                                    current.word !==
                                                    selected.word ||
                                                    current.sentence !==
                                                    selected.sentence
                                                ) {
                                                    return current;
                                                }

                                                return {
                                                    ...current,
                                                    explanation:
                                                        answer,
                                                };
                                            },
                                        );
                                    },
                                )
                                .catch(
                                    (
                                        error,
                                    ) => {
                                        console.error(
                                            "LLM ERROR:",
                                            error,
                                        );
                                    },
                                );

                            singleTapTimerRef
                                .current =
                                null;
                        },
                        300,
                    );
            };

            doc.addEventListener(
                "touchstart",
                handleTouchStart,
                {
                    passive: false,
                    capture: true,
                },
            );

            doc.addEventListener(
                "touchmove",
                handleTouchMove,
                {
                    passive: false,
                    capture: true,
                },
            );

            doc.addEventListener(
                "touchend",
                handleTouchEnd,
                {
                    capture: true,
                },
            );

            doc.addEventListener(
                "click",
                handleClick,
            );
        };

        reader.addEventListener(
            "relocate",
            handleRelocate,
        );

        reader.addEventListener(
            "load",
            handleLoad,
        );

        return () => {
            reader.removeEventListener(
                "relocate",
                handleRelocate,
            );

            reader.removeEventListener(
                "load",
                handleLoad,
            );

            if (
                singleTapTimerRef
                    .current !== null
            ) {
                window.clearTimeout(
                    singleTapTimerRef
                        .current,
                );

                singleTapTimerRef.current =
                    null;
            }
        };
    }, [
        bookId,
        language,
        schedulePagePrefetch,
    ]);

    const refreshSelectedWord =
        async () => {
            if (!selectedWord) {
                return;
            }

            const current =
                selectedWord;

            const currentLanguage =
                language ?? "unknown";

            setSelectedWord({
                ...current,
                explanation: "Översätter...",
            });

            try {
                if (
                    showSentenceTranslation
                ) {
                    const translation =
                        await translateSentence(
                            current.sentence,
                            currentLanguage,
                            true,
                        );

                    setSelectedWord(
                        (latest) => {
                            if (
                                !latest ||
                                latest.word !==
                                current.word ||
                                latest.sentence !==
                                current.sentence
                            ) {
                                return latest;
                            }

                            return {
                                ...latest,
                                explanation:
                                    `- **Meningsöversättning:** ${translation}`,
                            };
                        },
                    );

                    return;
                }

                const answer =
                    await explainWord(
                        current.word,
                        current.sentence,
                        currentLanguage,
                        true,
                    );

                setSelectedWord(
                    (latest) => {
                        if (
                            !latest ||
                            latest.word !==
                            current.word ||
                            latest.sentence !==
                            current.sentence
                        ) {
                            return latest;
                        }

                        return {
                            ...latest,
                            explanation:
                                answer,
                        };
                    },
                );
            } catch (error) {
                console.error(
                    "REFRESH ERROR:",
                    error,
                );
            }
        };

    const openPageChat = () => {
        if (selectedWord) {
            setPageChatFocus({
                word: selectedWord.word,
                sentence:
                    selectedWord.sentence,
            });
        }

        setSelectedWord(null);
        setPageChatOpen(true);
    };

    const sendPageQuestion =
        async (
            event:
                FormEvent<HTMLFormElement>,
        ) => {
            event.preventDefault();

            const question =
                pageChatInput.trim();

            if (
                !question ||
                pageChatLoading
            ) {
                return;
            }

            const pageText =
                visiblePageTextRef.current
                    .trim() ||
                pageChatFocus?.sentence ||
                "";

            const currentMessages =
                pageChatMessages;

            setPageChatMessages(
                (messages) => [
                    ...messages,
                    {
                        role: "user",
                        text: question,
                    },
                ],
            );

            setPageChatInput("");
            setPageChatLoading(true);

            try {
                const history =
                    currentMessages
                        .slice(-8)
                        .map(
                            (message) =>
                                `${message.role === "user"
                                    ? "Läsaren"
                                    : "Språkläraren"}: ${message.text}`,
                        )
                        .join("\n\n");

                const focus =
                    pageChatFocus
                        ? `
Ordet som öppnade chatten:
"${pageChatFocus.word}"

Meningen där ordet finns:
"${pageChatFocus.sentence}"
`
                        : "";

                const prompt = `
Du är en hjälpsam språklärare för en svensk person som läser en bok på ${language ?? "ett främmande språk"}.

Texten som är synlig på den aktuella boksidan:
"""
${pageText}
"""
${focus}
${history
                        ? `Tidigare i chatten:
${history}
`
                        : ""}
Läsarens nya fråga:
"${question}"

Regler:
- Svara på svenska.
- Använd texten på den synliga sidan som sammanhang.
- Fokusera på språk: ord, uttryck, grammatik, böjning, betydelse, stil, syftningar och hur formuleringar används just här.
- Om frågan handlar om ett ord eller uttryck, förklara betydelsen i just den här texten.
- Svara ganska kort om inte frågan kräver mer.
- Säg tydligt om något inte går att avgöra från texten.
`.trim();

                const result =
                    await CapacitorHttp.post({
                        url:
                            PAGE_CHAT_OLLAMA_URL,
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        data: {
                            model:
                                PAGE_CHAT_MODEL,
                            prompt,
                            stream: false,
                            options: {
                                temperature:
                                    0.2,
                            },
                        },
                    });

                const data =
                    typeof result.data ===
                        "string"
                        ? JSON.parse(
                            result.data,
                        )
                        : result.data;

                const answer =
                    typeof data?.response ===
                        "string"
                        ? data.response.trim()
                        : "";

                setPageChatMessages(
                    (messages) => [
                        ...messages,
                        {
                            role:
                                "assistant",
                            text:
                                answer ||
                                "Jag fick inget svar från modellen.",
                        },
                    ],
                );
            } catch (cause) {
                console.error(
                    "PAGE CHAT ERROR:",
                    cause,
                );

                setPageChatMessages(
                    (messages) => [
                        ...messages,
                        {
                            role:
                                "assistant",
                            text:
                                "Kunde inte få svar från modellen.",
                        },
                    ],
                );
            } finally {
                setPageChatLoading(false);
            }
        };

    useEffect(() => {
        const reader =
            readerRef.current;

        if (!reader) {
            return;
        }

        if (
            openedBookRef.current ===
            book
        ) {
            return;
        }

        openedBookRef.current =
            book;

        const openBook =
            async () => {
                try {
                    setLoading(true);
                    setError(null);

                    console.log(
                        "Opening:",
                        book.name,
                    );

                    const [
                        {
                            value:
                            savedPosition,
                        },

                        {
                            value:
                            savedFontScale,
                        },

                        {
                            value:
                            savedPaperTheme,
                        },
                    ] =
                        await Promise.all([
                            Preferences.get({
                                key:
                                    `position:${bookId}`,
                            }),

                            Preferences.get({
                                key:
                                    "reader-font-scale",
                            }),

                            Preferences.get({
                                key:
                                    "reader-paper-theme",
                            }),
                        ]);

                    const initialScale =
                        savedFontScale
                            ? Number(
                                savedFontScale,
                            )
                            : 100;

                    const initialTheme =
                        savedPaperTheme ??
                        "paper";

                    applyPaperTheme(
                        initialTheme,
                    );

                    applyFontScale(
                        initialScale,
                    );

                    await reader.open(
                        book,
                    );

                    reader.renderer
                        ?.setAttribute(
                            "margin",
                            "46px",
                        );

                    reader.renderer
                        ?.setAttribute(
                            "gap",
                            "10",
                        );

                    applyReaderStyles(
                        initialScale,
                        initialTheme,
                    );

                    console.log(
                        "Book opened",
                    );

                    await reader.goTo(
                        savedPosition ??
                        0,
                    );

                    applyReaderStyles(
                        fontScaleRef
                            .current,
                        paperThemeRef
                            .current,
                    );

                    console.log(
                        "Moved to saved position",
                    );
                } catch (cause) {
                    console.error(
                        "Failed to open EPUB:",
                        cause,
                    );

                    setError(
                        "Could not open this book.",
                    );
                } finally {
                    setLoading(false);
                }
            };

        void openBook();
    }, [
        book,
        bookId,
    ]);

    function nextPage() {
        void readerRef
            .current
            ?.next();
    }

    function prevPage() {
        void readerRef
            .current
            ?.prev();
    }

    useEffect(() => {
        const handleKeyDown = (
            event: KeyboardEvent,
        ) => {
            if (
                event.key ===
                "ArrowRight"
            ) {
                nextPage();
            }

            if (
                event.key ===
                "ArrowLeft"
            ) {
                prevPage();
            }
        };

        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );
        };
    }, []);

    const activeTheme =
        readerPaperThemes[
        paperTheme
        ] ??
        readerPaperThemes.paper;

    return (
        <section
            className={
                `book-reader ${className}`
            }
            style={
                {
                    backgroundColor:
                        activeTheme
                            .background,

                    backgroundImage:
                        `url("${paperTextureUrl}")`,

                    backgroundRepeat:
                        "no-repeat",

                    backgroundSize:
                        "cover",

                    backgroundPosition:
                        "center",

                    backgroundBlendMode:
                        "multiply",

                    "--reader-page-color":
                        activeTheme
                            .background,

                    "--reader-page-texture":
                        `url("${paperTextureUrl}")`,
                } as CSSProperties
            }
        >
            {error && (
                <p className="book-reader__status">
                    {error}
                </p>
            )}

            {createElement(
                "foliate-view",
                {
                    ref: readerRef,

                    style: {
                        background:
                            "transparent",
                    },
                },
            )}

            {selectedWord && (
                <TranslationPopup
                    word={
                        selectedWord.word
                    }
                    x={selectedWord.x}
                    y={selectedWord.y}
                    bottom={
                        selectedWord.bottom
                    }
                    explanation={
                        selectedWord.explanation
                    }
                    showSentenceTranslation={
                        showSentenceTranslation
                    }
                    onRefresh={refreshSelectedWord}
                    onAskPageQuestion={
                        openPageChat
                    }
                    onClose={() =>
                        setSelectedWord(
                            null,
                        )
                    }
                />
            )}

            {pageChatOpen && (
                <>
                    <button
                        className="page-chat-backdrop"
                        type="button"
                        aria-label="Stäng språkchatten"
                        onClick={() =>
                            setPageChatOpen(
                                false,
                            )
                        }
                        style={{
                            position:
                                "fixed",
                            inset: 0,
                            zIndex: 199,
                            border: 0,
                            background:
                                "rgba(0, 0, 0, 0.28)",
                        }}
                    />

                    <aside
                        className="page-chat"
                        aria-label="Fråga om sidan"
                        style={{
                            position:
                                "fixed",
                            zIndex: 200,
                            left: "12px",
                            right: "12px",
                            bottom:
                                "max(12px, env(safe-area-inset-bottom))",
                            width:
                                "min(520px, calc(100vw - 24px))",
                            maxHeight:
                                "min(70vh, 620px)",
                            margin:
                                "0 auto",
                            boxSizing:
                                "border-box",
                            display:
                                "flex",
                            flexDirection:
                                "column",
                            gap: "12px",
                            padding:
                                "14px",
                            border:
                                "1px solid var(--border)",
                            borderRadius:
                                "18px",
                            background:
                                "var(--surface)",
                            color:
                                "var(--text)",
                            boxShadow:
                                "var(--shadow)",
                        }}
                    >
                        <div
                            style={{
                                display:
                                    "flex",
                                alignItems:
                                    "center",
                                justifyContent:
                                    "space-between",
                                gap: "12px",
                            }}
                        >
                            <strong>
                                Fråga om sidan
                            </strong>

                            <button
                                type="button"
                                onClick={() =>
                                    setPageChatOpen(
                                        false,
                                    )
                                }
                                aria-label="Stäng"
                                style={{
                                    width:
                                        "32px",
                                    height:
                                        "32px",
                                    padding: 0,
                                    border:
                                        "1px solid var(--border)",
                                    borderRadius:
                                        "50%",
                                    background:
                                        "transparent",
                                    color:
                                        "var(--text)",
                                    fontSize:
                                        "20px",
                                }}
                            >
                                ×
                            </button>
                        </div>

                        <div
                            style={{
                                minHeight:
                                    "72px",
                                maxHeight:
                                    "38vh",
                                overflowY:
                                    "auto",
                                display:
                                    "flex",
                                flexDirection:
                                    "column",
                                gap: "10px",
                            }}
                        >
                            {pageChatMessages
                                .length ===
                                0 && (
                                    <p
                                        style={{
                                            margin: 0,
                                            color:
                                                "var(--text-muted)",
                                            lineHeight:
                                                1.4,
                                        }}
                                    >
                                        Fråga om ett
                                        ord, grammatik,
                                        ett uttryck eller
                                        något annat i
                                        texten du ser.
                                    </p>
                                )}

                            {pageChatMessages.map(
                                (
                                    message,
                                    index,
                                ) => (
                                    <div
                                        key={
                                            index
                                        }
                                        style={{
                                            alignSelf:
                                                message.role ===
                                                    "user"
                                                    ? "flex-end"
                                                    : "flex-start",
                                            maxWidth:
                                                "88%",
                                            padding:
                                                "9px 11px",
                                            border:
                                                "1px solid var(--border)",
                                            borderRadius:
                                                "12px",
                                            background:
                                                message.role ===
                                                    "user"
                                                    ? "var(--surface-hover)"
                                                    : "transparent",
                                            whiteSpace:
                                                "pre-wrap",
                                            lineHeight:
                                                1.4,
                                        }}
                                    >
                                        {
                                            message.text
                                        }
                                    </div>
                                ),
                            )}

                            {pageChatLoading && (
                                <div
                                    style={{
                                        color:
                                            "var(--text-muted)",
                                    }}
                                >
                                    Tänker…
                                </div>
                            )}
                        </div>

                        <form
                            onSubmit={
                                sendPageQuestion
                            }
                            style={{
                                display:
                                    "flex",
                                gap: "8px",
                                alignItems:
                                    "flex-end",
                            }}
                        >
                            <textarea
                                autoFocus
                                value={
                                    pageChatInput
                                }
                                onChange={(
                                    event,
                                ) =>
                                    setPageChatInput(
                                        event
                                            .target
                                            .value,
                                    )
                                }
                                placeholder="Fråga om språket på sidan…"
                                rows={2}
                                style={{
                                    flex: 1,
                                    resize:
                                        "none",
                                    boxSizing:
                                        "border-box",
                                    padding:
                                        "10px 12px",
                                    border:
                                        "1px solid var(--border)",
                                    borderRadius:
                                        "12px",
                                    background:
                                        "var(--surface)",
                                    color:
                                        "var(--text)",
                                    font:
                                        "inherit",
                                }}
                            />

                            <button
                                type="submit"
                                disabled={
                                    pageChatLoading ||
                                    !pageChatInput
                                        .trim()
                                }
                                style={{
                                    minHeight:
                                        "42px",
                                    padding:
                                        "0 14px",
                                    border:
                                        "1px solid var(--border)",
                                    borderRadius:
                                        "12px",
                                    background:
                                        "var(--text)",
                                    color:
                                        "var(--surface)",
                                    font:
                                        "inherit",
                                    fontWeight:
                                        600,
                                }}
                            >
                                Skicka
                            </button>
                        </form>
                    </aside>
                </>
            )}
        </section>
    );
}
