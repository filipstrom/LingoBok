import { createElement, useEffect, useRef, useState } from "react";
import "../lib/foliate-js/view.js";
import "./BookReader.css";

export type BookSource = File;

type FoliateReader = HTMLElement & {
    open: (file: File) => Promise<void>;
    goTo: (target: number | string) => Promise<void>;
    next: () => Promise<void>;
    prev: () => Promise<void>;
};

type CaretDocument = Document & {
    caretPositionFromPoint?: (
        x: number,
        y: number
    ) => {
        offsetNode: Node;
        offset: number;
    } | null;

    caretRangeFromPoint?: (
        x: number,
        y: number
    ) => Range | null;
};

export type BookReaderProps = {
    book: File;
    onBack?: () => void;
    className?: string;
};

function getWordAtPoint(
    doc: Document,
    x: number,
    y: number
): string | null {
    const caretDoc = doc as CaretDocument;

    let node: Node | null = null;
    let offset = 0;

    const position = caretDoc.caretPositionFromPoint?.(x, y);

    if (position) {
        node = position.offsetNode;
        offset = position.offset;
    } else {
        const range = caretDoc.caretRangeFromPoint?.(x, y);

        if (range) {
            node = range.startContainer;
            offset = range.startOffset;
        }
    }

    if (!node || node.nodeType !== Node.TEXT_NODE) {
        return null;
    }

    const text = node.textContent ?? "";

    const isWordCharacter = (character: string) =>
        /[\p{L}\p{M}'’-]/u.test(character);

    if (
        !isWordCharacter(text[offset] ?? "") &&
        offset > 0 &&
        isWordCharacter(text[offset - 1])
    ) {
        offset--;
    }

    if (!isWordCharacter(text[offset] ?? "")) {
        return null;
    }

    let start = offset;
    let end = offset;

    while (start > 0 && isWordCharacter(text[start - 1])) {
        start--;
    }

    while (
        end < text.length &&
        isWordCharacter(text[end])
    ) {
        end++;
    }

    return text.slice(start, end);
}

export default function BookReader({
    book,
    onBack,
    className = "",
}: BookReaderProps) {
    const readerRef = useRef<FoliateReader | null>(null);

    // Hindrar React StrictMode från att öppna samma bok två gånger.
    const openedBookRef = useRef<File | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /*
     * Samma listener-upplägg som i den fungerande App.tsx.
     */
    useEffect(() => {
        const reader = readerRef.current;

        if (!reader) return;

        const handleRelocate = (event: Event) => {
            console.log("Reading position changed:", event);
        };

        const handleLoad = (event: Event) => {
            const customEvent = event as CustomEvent<{
                doc: Document;
                index: number;
            }>;

            const doc = customEvent.detail.doc;

            console.log(
                "Loaded EPUB section:",
                customEvent.detail.index
            );

            doc.addEventListener("click", (event) => {
                const mouseEvent = event as MouseEvent;

                const word = getWordAtPoint(
                    doc,
                    mouseEvent.clientX,
                    mouseEvent.clientY
                );

                if (word) {
                    console.log("WORD:", word);
                }
            });
        };

        reader.addEventListener(
            "relocate",
            handleRelocate
        );

        reader.addEventListener(
            "load",
            handleLoad
        );

        return () => {
            reader.removeEventListener(
                "relocate",
                handleRelocate
            );

            reader.removeEventListener(
                "load",
                handleLoad
            );
        };
    }, []);

    /*
     * Enda egentliga skillnaden mot gamla App.tsx:
     * filen kommer från props istället för <input>.
     */
    useEffect(() => {
        const reader = readerRef.current;

        if (!reader) return;

        // React StrictMode kan köra effecten två gånger i development.
        if (openedBookRef.current === book) {
            return;
        }

        openedBookRef.current = book;

        const openBook = async () => {
            try {
                setLoading(true);
                setError(null);

                console.log("Opening:", book.name);

                await reader.open(book);

                console.log("Book opened");

                await reader.goTo(0);

                console.log("Moved to first section");
            } catch (cause) {
                console.error(
                    "Failed to open EPUB:",
                    cause
                );

                setError("Could not open this book.");
            } finally {
                setLoading(false);
            }
        };

        void openBook();
    }, [book]);

    function nextPage() {
        void readerRef.current?.next();
    }

    function prevPage() {
        void readerRef.current?.prev();
    }

    /*
     * Desktop-testning.
     */
    useEffect(() => {
        const handleKeyDown = (
            event: KeyboardEvent
        ) => {
            if (event.key === "ArrowRight") {
                nextPage();
            }

            if (event.key === "ArrowLeft") {
                prevPage();
            }
        };

        window.addEventListener(
            "keydown",
            handleKeyDown
        );

        return () => {
            window.removeEventListener(
                "keydown",
                handleKeyDown
            );
        };
    }, []);

    return (
        <section
            className={`book-reader ${className}`}
        >
            {onBack && (
                <button
                    className="book-reader__back"
                    type="button"
                    onClick={onBack}
                    aria-label="Back to library"
                >
                    ←
                </button>
            )}

            {loading && (
                <p className="book-reader__status">
                    Opening book...
                </p>
            )}

            {error && (
                <p className="book-reader__status">
                    {error}
                </p>
            )}

            {createElement("foliate-view", {
                ref: readerRef,
            })}

            {/* Behåll dem tills allt fungerar igen */}
            <div className="book-reader__controls">
                <button
                    type="button"
                    onClick={prevPage}
                >
                    Previous
                </button>

                <button
                    type="button"
                    onClick={nextPage}
                >
                    Next
                </button>
            </div>
        </section>
    );
}